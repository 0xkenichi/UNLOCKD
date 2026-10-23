// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

/**
 * @title  CreditEngineV2
 * @notice The v2 credit value and borrowing limit (yellow paper §3–4), as a stateless contract.
 *
 *           CV_α(t) = drag · (1 − c) · P · [ held · M(0) + lump · M(cliff − t) + ∫ linear · M(s − t) ds ]
 *           M(w)    = exp(−σ²τ/2 + z_α σ √τ),  τ = w + L                 (hold)
 *                   = max(hold, exp(−σ²L/2 + z_α σ √L − k w))            (blend)
 *           c       = min(c_max, η σ_d √(Q P / (V_d D)))                 (whole position)
 *           B_max   = Ω · (1 − buffer) · min( CV_αo(t0),  CV_αℓ(T)/(1 + r(T − t0)),
 *                                             min_j CV_αℓ(g_j)/(1 + r(g_{j+1} − t0)) )
 *
 *         The linear part is integrated with two 8-point Gauss–Legendre panels and the drift cap
 *         uses 4 intervals. packages/risk/src/onchainV2.js is this file in floating point, and
 *         its tests show it never lends more than the proven model (packages/risk/src/v2.js) and
 *         keeps theorems T5 and T7 (docs/RISK_PROOFS.md) day by day.
 *
 *         Units: times in seconds, prices in USD with 6 decimals per whole token, values in USDC
 *         (6 decimals), quantities in the token's base units.
 */
contract CreditEngineV2 {
    using ABDKMath64x64 for int128;

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;

    // Calibrated by packages/risk/bin/stress.js; see packages/risk/src/tiers.js.
    enum Tier { Standard, OptIn }

    // z = Φ⁻¹(α) in 64.64: standard α_o 2%, α_ℓ 10%; opt-in α_o 0.5%, α_ℓ 5%.
    int128 internal constant Z_STD_ORIG = -37884980546085019648;
    int128 internal constant Z_STD_LIQ = -23640453746863058944;
    int128 internal constant Z_OPT_ORIG = -47515663940128071680;
    int128 internal constant Z_OPT_LIQ = -30342193895086731264;
    // Opt-in marketability rates k_o = 150%, k_ℓ = 75% a year.
    int128 internal constant K_OPT_ORIG = 27670116110564327424;
    int128 internal constant K_OPT_LIQ = 13835058055282163712;

    uint256 public constant LATENCY = 5 days;      // L: breach to cash
    uint256 public constant SELL_DAYS = 10;        // D: days allowed to sell the position
    uint256 public constant C_MAX_BPS = 5000;      // liquidity cost cap
    uint256 public constant BUFFER_BPS = 25;       // covers quadrature error at blend mode's kink
    uint256 public constant INTERVALS = 4;

    int128 internal constant INV_SQRT_365 = 965546714207883264;

    struct Schedule {
        uint64 start;
        uint64 cliff;
        uint64 end;
        uint256 total;     // tokens deposited in the stream
        uint256 consumed;  // withdrawn before escrow + sold in paydowns
    }

    struct Market {
        uint256 price;     // USD per whole token, 6 decimals
        uint8 decimals;    // token decimals
        uint32 sigmaBps;   // annual volatility
        uint256 advUsd;    // median daily volume, 6 decimals
        uint32 dragBps;    // unlock-drift factor for the whole position, (0, 10000]
    }

    struct Curve {
        int128 z;
        int128 k;
        bool blend;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tier curves
    // ─────────────────────────────────────────────────────────────────────────

    function originationCurve(Tier tier) public pure returns (Curve memory) {
        return tier == Tier.Standard ? Curve(Z_STD_ORIG, 0, false) : Curve(Z_OPT_ORIG, K_OPT_ORIG, true);
    }

    function liquidationCurve(Tier tier) public pure returns (Curve memory) {
        return tier == Tier.Standard ? Curve(Z_STD_LIQ, 0, false) : Curve(Z_OPT_LIQ, K_OPT_LIQ, true);
    }

    /// The median (z = 0) value: what a fair buyer pays, used to price partner buybacks and auctions.
    function fairCurve(Tier tier) public pure returns (Curve memory) {
        return tier == Tier.Standard ? Curve(0, 0, false) : Curve(0, K_OPT_LIQ, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Valuation
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Tokens vested by time `s` on a Lockup Linear schedule.
    function vestedAt(Schedule memory sch, uint256 s) public pure returns (uint256) {
        if (s < sch.cliff) return 0;
        if (s >= sch.end) return sch.total;
        return Math.mulDiv(sch.total, s - sch.start, sch.end - sch.start);
    }

    /// @notice Credit value (USDC) of the schedule at time `t` on curve `c`.
    function creditValue(Schedule memory sch, uint256 t, Market memory m, Curve memory c) public pure returns (uint256) {
        int128 sigma = ABDKMath64x64.divu(m.sigmaBps, BPS);
        Ctx memory x = Ctx({
            zs: c.z.mul(sigma),
            halfVar: sigma.mul(sigma).div(ABDKMath64x64.fromUInt(2)),
            k: c.k,
            blend: c.blend,
            sellBase: 0
        });
        if (c.blend) {
            int128 lY = ABDKMath64x64.divu(LATENCY, YEAR);
            x.sellBase = x.zs.mul(lY.sqrt()).sub(x.halfVar.mul(lY));
        }

        // Token-weighted multiplier sum, in token base units. Consumed tokens (withdrawn before
        // escrow, or sold in paydowns) are the earliest-vesting ones, so consumption is taken
        // first from what has vested, then from the cliff lump, then from the start of the
        // linear remainder. Only total − consumed tokens are ever valued.
        uint256 weighted;
        uint256 vNow = vestedAt(sch, t);
        uint256 left = sch.consumed;            // consumption still to allocate
        if (vNow > left) {
            weighted += _mult(x, 0).mulu(vNow - left);
            left = 0;
        } else {
            left -= vNow;
        }
        if (t < sch.cliff) {
            uint256 lump = vestedAt(sch, sch.cliff);
            if (lump > left) {
                weighted += _mult(x, sch.cliff - t).mulu(lump - left);
                left = 0;
            } else {
                left -= lump;
            }
        }
        uint256 a = t > sch.cliff ? t : sch.cliff;
        if (a < sch.end) {
            // The first `left` tokens of the linear remainder are gone: start the integral later.
            uint256 remaining = Math.mulDiv(sch.total, sch.end - a, sch.end - sch.start);
            if (remaining > left) {
                if (left > 0) a += Math.mulDiv(left, sch.end - sch.start, sch.total);
                if (a < sch.end) {
                    int128 avg = _linearAverage(x, a, sch.end, t);
                    weighted += avg.mulu(remaining - left);
                }
            }
        }

        uint256 scale = 10 ** uint256(m.decimals);
        uint256 usd = Math.mulDiv(weighted, m.price, scale);
        uint256 position = Math.mulDiv(sch.total > sch.consumed ? sch.total - sch.consumed : 0, m.price, scale);
        int128 keep = ABDKMath64x64.fromUInt(1).sub(_liquidityCost(position, m.advUsd, sigma));
        return Math.mulDiv(keep.mulu(usd), m.dragBps, BPS);
    }

    /**
     * @notice Largest loan at `t0` maturing at `tm` at a fixed simple rate (bps a year).
     * @dev    The interval bound: at an unchanged price CV_αℓ never falls as time passes while the
     *         debt factor only grows, so CV(g_j)/(1 + r(g_{j+1} − t0)) bounds every day in
     *         [g_j, g_{j+1}] from below. A loan at this maximum is therefore never liquidatable
     *         on any day if the price does not move.
     */
    function maxBorrow(Schedule memory sch, uint256 t0, uint256 tm, uint256 rateBps, Market memory m, Tier tier, uint256 omegaBps)
        public
        pure
        returns (uint256)
    {
        require(tm > t0, "maturity");
        Curve memory liq = liquidationCurve(tier);
        uint256 cap = _discounted(creditValue(sch, tm, m, liq), rateBps, tm - t0);
        uint256 span = tm - t0;
        for (uint256 j = 0; j < INTERVALS; j++) {
            uint256 g = t0 + (span * j) / INTERVALS;
            uint256 g2 = t0 + (span * (j + 1)) / INTERVALS;
            uint256 v = _discounted(creditValue(sch, g, m, liq), rateBps, g2 - t0);
            if (v < cap) cap = v;
        }
        uint256 orig = creditValue(sch, t0, m, originationCurve(tier));
        uint256 b = orig < cap ? orig : cap;
        return Math.mulDiv(b, omegaBps * (BPS - BUFFER_BPS), BPS * BPS);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    struct Ctx {
        int128 zs;       // z σ
        int128 halfVar;  // σ² / 2
        int128 k;
        bool blend;
        int128 sellBase; // z σ √L − σ² L / 2
    }

    /// M for a delivery `w` seconds away.
    function _mult(Ctx memory x, uint256 w) internal pure returns (int128) {
        int128 tau = ABDKMath64x64.divu(w + LATENCY, YEAR);
        int128 hold = x.zs.mul(tau.sqrt()).sub(x.halfVar.mul(tau)).exp();
        if (!x.blend) return hold;
        int128 sell = x.sellBase.sub(x.k.mul(ABDKMath64x64.divu(w, YEAR))).exp();
        return sell > hold ? sell : hold;
    }

    /// Average of M(s − t) over s in [a, end]: two equal panels of 8-point Gauss–Legendre.
    function _linearAverage(Ctx memory x, uint256 a, uint256 end, uint256 t) internal pure returns (int128 avg) {
        int128[8] memory node = [
            int128(366261427160115200), 1875420726378334208, 4376191102771605504, 7531486084669946880,
            10915257989039605760, 14070552970937946112, 16571323347331217408, 18080482646549436416
        ];
        // Gauss weights / 4: each panel's weights sum to 2, averaged over 2 panels.
        int128[8] memory weight = [
            int128(466834225476198144), 1025551507352044928, 1446716552682805248, 1672583732916339712,
            1672583732916339712, 1446716552682805248, 1025551507352044928, 466834225476198144
        ];
        uint256 width = (end - a) / 2;
        for (uint256 p = 0; p < 2; p++) {
            uint256 lo = a + width * p;
            uint256 w = p == 0 ? width : end - a - width; // second panel takes the odd second
            for (uint256 i = 0; i < 8; i++) {
                avg = avg.add(weight[i].mul(_mult(x, lo + node[i].mulu(w) - t)));
            }
        }
    }

    /// Square-root impact on selling the whole position over SELL_DAYS, capped at C_MAX.
    function _liquidityCost(uint256 positionUsd, uint256 advUsd, int128 sigma) internal pure returns (int128) {
        int128 cMax = ABDKMath64x64.divu(C_MAX_BPS, BPS);
        uint256 denom = advUsd * SELL_DAYS;
        if (denom == 0 || positionUsd / denom >= 2 ** 62) return cMax;
        int128 c = sigma.mul(INV_SQRT_365).mul(ABDKMath64x64.divu(positionUsd, denom).sqrt());
        return c < cMax ? c : cMax;
    }

    function _discounted(uint256 value, uint256 rateBps, uint256 dt) internal pure returns (uint256) {
        return Math.mulDiv(value, YEAR * BPS, YEAR * BPS + rateBps * dt);
    }
}
