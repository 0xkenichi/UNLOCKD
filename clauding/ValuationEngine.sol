// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

/**
 * @title  ValuationEngine v2
 * @notice dDPV v2: Dynamic Discounted Present Value engine for Vestra Protocol.
 *
 * Formula:
 *   dDPV_v2 = Q_eff(schedule) × EWMA(P, λ_adaptive) × e^(−r_dynamic × T)
 *             × (1 − V_regime) × Ω_timelocked × LiquidityDepth(token)
 *
 * Improvements over v1:
 *   1. Q_effective: schedule-aware quantity (cliff / linear / graded)
 *   2. Adaptive λ EWMA: lambda tightens with realized volatility
 *   3. Dynamic r: anchored to on-chain base rate + risk + liquidity premiums
 *   4. V_regime: forward-looking vol with regime detection (30d/90d ratio)
 *   5. Ω timelock + delta guard: prevents flash manipulation of risk multiplier
 *   6. LiquidityDepth multiplier: DEX depth haircut at auction time
 *
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @dev All price / vol values use 18-decimal fixed-point unless noted.
///      Basis-point values (bps) are out of 10_000.

contract ValuationEngine is AccessControl, ReentrancyGuard, Pausable {

    // ─── Roles ───────────────────────────────────────────────────────────────

    bytes32 public constant RELAYER_ROLE   = keccak256("RELAYER_ROLE");
    bytes32 public constant GOVERNOR_ROLE  = keccak256("GOVERNOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE  = keccak256("GUARDIAN_ROLE");

    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant BPS             = 10_000;
    uint256 public constant WAD             = 1e18;

    /// @dev Ω ceiling — never allow a full 1.0 multiplier (leaves 5% safety floor)
    uint256 public constant MAX_OMEGA_BPS   = 9_500;

    /// @dev Maximum Ω change per update cycle (5%) — prevents step-function manipulation
    uint256 public constant MAX_OMEGA_DELTA = 500;

    /// @dev Minimum seconds between Ω finalization
    uint256 public constant OMEGA_TIMELOCK  = 3_600; // 1 hour

    /// @dev Volatility penalty hard cap
    uint256 public constant MAX_V_REGIME    = 0.95e18; // 95%

    /// @dev Minimum dynamic discount rate (floor at 3% APR)
    uint256 public constant MIN_R_BPS       = 300;

    /// @dev Maximum dynamic discount rate (ceiling at 80% APR)
    uint256 public constant MAX_R_BPS       = 8_000;

    // ─── Vesting Schedule Types ──────────────────────────────────────────────

    enum VestingSchedule { CLIFF, LINEAR, GRADED }

    // ─── Per-Token State ─────────────────────────────────────────────────────

    struct TokenRiskParams {
        // Ω state
        uint256 omegaBps;            // current finalized Ω (0–9500)
        uint256 pendingOmegaBps;     // proposed Ω (pending timelock)
        uint256 lastOmegaProposedAt; // timestamp of last proposeOmega() call

        // Volatility (18-dec WAD fractions, e.g. 0.45e18 = 45% annualized vol)
        uint256 vRealized30d;        // 30-day realized vol
        uint256 vRealized90d;        // 90-day realized vol
        uint256 vImplied;            // implied vol proxy (0 if unavailable)

        // Price (18-dec, USD)
        uint256 ewmaPrice;           // current EWMA price
        uint256 lambdaBps;           // current adaptive λ (bps, e.g. 9400 = 0.94)

        // Liquidity (18-dec USD)
        uint256 dexLiquidityUsd;     // on-chain DEX pool depth at time of update

        // Dynamic discount rate (bps)
        uint256 rDynamicBps;         // total discount rate = base + risk + liq premiums

        // Last full-state update
        uint256 lastUpdatedAt;
    }

    mapping(address => TokenRiskParams) public tokenParams;

    // ─── Global Base Rate ────────────────────────────────────────────────────

    /// @notice On-chain base rate (e.g. AAVE USDC supply APR), in bps.
    ///         Updated by relayer from the money market oracle.
    uint256 public baseRateBps;

    // ─── Events ──────────────────────────────────────────────────────────────

    event OmegaProposed(address indexed token, uint256 currentBps, uint256 proposedBps, uint256 unlocksAt);
    event OmegaFinalized(address indexed token, uint256 newOmegaBps);
    event RiskParamsUpdated(address indexed token, uint256 ewmaPrice, uint256 vRealized30d, uint256 rDynamicBps);
    event BaseRateUpdated(uint256 newBaseRateBps);
    event DPVComputed(address indexed token, uint256 quantity, uint256 dpv, uint256 ltv);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GOVERNOR_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
        baseRateBps = 500; // default 5% base rate
    }

    // ─── dDPV v2 Core ────────────────────────────────────────────────────────

    /**
     * @notice Compute dDPV_v2 and a recommended LTV for a vesting position.
     *
     * @param quantity      Token quantity (raw units, not WAD-scaled).
     * @param token         ERC-20 address of the vesting token.
     * @param unlockTime    Unix timestamp of the unlock / cliff / stream end.
     * @param schedule      CLIFF | LINEAR | GRADED
     * @param loanDuration  Seconds the loan will be outstanding (for Q_eff on linear).
     *
     * @return dpv          Dynamic discounted present value, in USDC (6 dec).
     * @return ltvBps       Recommended loan-to-value in basis points.
     */
    function computeDPV(
        uint256 quantity,
        address token,
        uint256 unlockTime,
        VestingSchedule schedule,
        uint256 loanDuration
    )
        external
        view
        whenNotPaused
        returns (uint256 dpv, uint256 ltvBps)
    {
        require(unlockTime > block.timestamp, "Already unlocked");
        require(quantity > 0, "Zero quantity");

        TokenRiskParams memory p = tokenParams[token];
        require(p.ewmaPrice > 0, "No price feed");
        require(p.omegaBps > 0, "Omega not initialised");

        uint256 T = unlockTime - block.timestamp; // seconds to unlock

        // 1. Q_effective: schedule-weighted quantity
        uint256 qEff = _computeQEffective(quantity, schedule, T, loanDuration);

        // 2. Gross value: Q_eff × EWMA price (result in 18-dec USD)
        uint256 grossValue = (qEff * p.ewmaPrice) / WAD;

        // 3. Time decay: e^(−r × T_years) approximated via Taylor series (gas-safe)
        uint256 tYearsBps = (T * BPS) / 365 days; // T in years × 10_000
        uint256 timeFactor = _expDecayBps(p.rDynamicBps, tYearsBps); // WAD

        // 4. Volatility regime penalty: (1 − V_regime)
        uint256 vRegime = _computeVRegime(p.vRealized30d, p.vRealized90d, p.vImplied);
        require(vRegime < WAD, "Vol penalty would zero DPV");
        uint256 volFactor = WAD - vRegime; // WAD

        // 5. Ω multiplier
        uint256 omegaFactor = (p.omegaBps * WAD) / BPS; // WAD

        // 6. Liquidity depth multiplier
        uint256 liquidityFactor = _liquidityDepthFactor(grossValue, p.dexLiquidityUsd); // WAD

        // dDPV = grossValue × timeFactor × volFactor × omegaFactor × liquidityFactor
        dpv = grossValue;
        dpv = (dpv * timeFactor)    / WAD;
        dpv = (dpv * volFactor)     / WAD;
        dpv = (dpv * omegaFactor)   / WAD;
        dpv = (dpv * liquidityFactor) / WAD;

        // Convert to USDC (6 dec) from 18-dec
        dpv = dpv / 1e12;

        // LTV: conservative cap — max 70% of dDPV
        ltvBps = _computeLTV(p.omegaBps, vRegime, p.rDynamicBps);

        emit DPVComputed(token, quantity, dpv, ltvBps);
    }

    // ─── Ω Management (guarded) ──────────────────────────────────────────────

    /**
     * @notice Propose a new Ω for a token. Subject to delta guard + timelock.
     * @dev    Called by the off-chain Omega AI Watcher relayer.
     */
    function proposeOmega(address token, uint256 newOmegaBps)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
    {
        require(newOmegaBps <= MAX_OMEGA_BPS, "Exceeds omega ceiling");

        TokenRiskParams storage p = tokenParams[token];
        uint256 current = p.omegaBps;

        // Delta guard: max 5% change per cycle
        if (current > 0) {
            uint256 delta = newOmegaBps > current
                ? newOmegaBps - current
                : current - newOmegaBps;
            require(delta <= MAX_OMEGA_DELTA, "Delta exceeds max per cycle");
        }

        p.pendingOmegaBps     = newOmegaBps;
        p.lastOmegaProposedAt = block.timestamp;

        emit OmegaProposed(token, current, newOmegaBps, block.timestamp + OMEGA_TIMELOCK);
    }

    /**
     * @notice Finalize a proposed Ω after the timelock has elapsed.
     * @dev    Anyone can call — the timelock is the guard.
     */
    function finalizeOmega(address token) external whenNotPaused {
        TokenRiskParams storage p = tokenParams[token];
        require(p.pendingOmegaBps > 0, "No pending proposal");
        require(
            block.timestamp >= p.lastOmegaProposedAt + OMEGA_TIMELOCK,
            "Timelock still active"
        );

        p.omegaBps        = p.pendingOmegaBps;
        p.pendingOmegaBps = 0;

        emit OmegaFinalized(token, p.omegaBps);
    }

    /**
     * @notice Emergency Ω slash — Guardian can immediately drop Ω to floor.
     *         Used when the Citadel detects imminent exploit.
     */
    function emergencySlashOmega(address token, uint256 floorBps)
        external
        onlyRole(GUARDIAN_ROLE)
    {
        require(floorBps < tokenParams[token].omegaBps, "Not a slash");
        tokenParams[token].omegaBps = floorBps;
        tokenParams[token].pendingOmegaBps = 0; // cancel any pending proposal
        emit OmegaFinalized(token, floorBps);
    }

    // ─── Risk Params Update ──────────────────────────────────────────────────

    /**
     * @notice Update all dynamic risk inputs for a token.
     *         Called by the off-chain oracle relayer on each epoch.
     */
    function updateRiskParams(
        address token,
        uint256 newEwmaPrice,       // 18-dec USD
        uint256 newLambdaBps,       // e.g. 9400 = λ 0.94
        uint256 newVRealized30d,    // 18-dec annualized vol
        uint256 newVRealized90d,
        uint256 newVImplied,        // 0 if not available
        uint256 newDexLiquidityUsd, // 18-dec USD
        uint256 tokenRiskPremiumBps,
        uint256 liquidityPremiumBps
    )
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
    {
        require(newEwmaPrice > 0, "Invalid price");
        require(newLambdaBps >= 8_000 && newLambdaBps <= 9_900, "Lambda out of range");
        require(newVRealized30d <= MAX_V_REGIME, "Vol exceeds cap");

        TokenRiskParams storage p = tokenParams[token];
        p.ewmaPrice        = newEwmaPrice;
        p.lambdaBps        = newLambdaBps;
        p.vRealized30d     = newVRealized30d;
        p.vRealized90d     = newVRealized90d;
        p.vImplied         = newVImplied;
        p.dexLiquidityUsd  = newDexLiquidityUsd;
        p.lastUpdatedAt    = block.timestamp;

        // Recompute dynamic r = base + token risk premium + liquidity premium
        uint256 rNew = baseRateBps + tokenRiskPremiumBps + liquidityPremiumBps;
        rNew = rNew < MIN_R_BPS ? MIN_R_BPS : rNew;
        rNew = rNew > MAX_R_BPS ? MAX_R_BPS : rNew;
        p.rDynamicBps = rNew;

        emit RiskParamsUpdated(token, newEwmaPrice, newVRealized30d, rNew);
    }

    /// @notice Update the global base rate (e.g. from AAVE USDC oracle).
    function updateBaseRate(uint256 newBaseRateBps)
        external
        onlyRole(RELAYER_ROLE)
    {
        require(newBaseRateBps <= 5_000, "Base rate exceeds 50%");
        baseRateBps = newBaseRateBps;
        emit BaseRateUpdated(newBaseRateBps);
    }

    // ─── View Helpers ────────────────────────────────────────────────────────

    function tokenOmegaBps(address token) external view returns (uint256) {
        return tokenParams[token].omegaBps;
    }

    function omegaTimelockRemaining(address token) external view returns (uint256) {
        TokenRiskParams memory p = tokenParams[token];
        if (p.pendingOmegaBps == 0) return 0;
        uint256 unlockAt = p.lastOmegaProposedAt + OMEGA_TIMELOCK;
        if (block.timestamp >= unlockAt) return 0;
        return unlockAt - block.timestamp;
    }

    // ─── Guardian Controls ───────────────────────────────────────────────────

    function pause()   external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    // ─── Internal Math ───────────────────────────────────────────────────────

    /**
     * @dev Schedule-weighted effective quantity.
     *      CLIFF: full Q (lump risk at T).
     *      LINEAR: proportion of Q that unlocks within loanDuration.
     *      GRADED: caller must pre-compute and pass as CLIFF (handled off-chain).
     */
    function _computeQEffective(
        uint256 quantity,
        VestingSchedule schedule,
        uint256 T,
        uint256 loanDuration
    ) internal pure returns (uint256) {
        if (schedule == VestingSchedule.CLIFF) return quantity;
        if (schedule == VestingSchedule.LINEAR) {
            // Fraction of vesting stream that falls within loan duration
            uint256 fraction = loanDuration >= T
                ? WAD
                : (loanDuration * WAD) / T;
            return (quantity * fraction) / WAD;
        }
        // GRADED: treat as full cliff (conservative)
        return quantity;
    }

    /**
     * @dev Approximate e^(−r × T) using a 6-term Taylor expansion.
     *      Safe for r up to ~80% APR and T up to ~5 years.
     *      Returns WAD-scaled result.
     *
     *      e^(-x) ≈ 1 - x + x²/2 - x³/6 + x⁴/24 - x⁵/120
     *      where x = rBps × tYearsBps / BPS²
     */
    function _expDecayBps(uint256 rBps, uint256 tYearsBps)
        internal
        pure
        returns (uint256)
    {
        // x = r × T (both in BPS, result in BPS²)
        // Rescale to WAD for precision
        uint256 x = (rBps * tYearsBps * WAD) / (BPS * BPS);
        if (x >= WAD) return 0; // extreme discount → floor at 0

        uint256 x2 = (x * x) / WAD;
        uint256 x3 = (x2 * x) / WAD;
        uint256 x4 = (x3 * x) / WAD;
        uint256 x5 = (x4 * x) / WAD;

        uint256 pos = WAD + x2 / 2 + x4 / 24;
        uint256 neg = x  + x3 / 6  + x5 / 120;

        return pos > neg ? pos - neg : 0;
    }

    /**
     * @dev Forward-looking volatility with regime detection.
     *      If 30d/90d ratio > 1.5 → entering high-vol regime → 25% uplift.
     *      Implied vol proxy wins if higher (forward-looking).
     */
    function _computeVRegime(
        uint256 v30d,
        uint256 v90d,
        uint256 vImplied
    ) internal pure returns (uint256) {
        uint256 base = v30d;

        if (v90d > 0) {
            uint256 ratio = (v30d * BPS) / v90d; // BPS-scaled
            if (ratio > 15_000) {
                // High-vol regime: uplift by 25%
                base = (v30d * 12_500) / BPS;
            }
        }

        // Forward-looking implied vol wins if higher
        if (vImplied > base) base = vImplied;

        // Hard cap
        return base > MAX_V_REGIME ? MAX_V_REGIME : base;
    }

    /**
     * @dev DEX liquidity depth discount.
     *      Haircut scales with position size as fraction of pool depth.
     */
    function _liquidityDepthFactor(
        uint256 positionUsd,
        uint256 dexLiquidityUsd
    ) internal pure returns (uint256) {
        if (dexLiquidityUsd == 0) return 0.40e18; // unknown liquidity → severe haircut
        uint256 impactBps = (positionUsd * BPS) / dexLiquidityUsd;

        if (impactBps < 200)  return 1.00e18; // <2%   → no discount
        if (impactBps < 1000) return 0.85e18; // 2–10% → 15% haircut
        if (impactBps < 3000) return 0.65e18; // 10–30%→ 35% haircut
        return 0.40e18;                        // >30%  → severe haircut
    }

    /**
     * @dev Conservative LTV derivation from risk components.
     *      Higher Ω → higher eligible LTV.
     *      Higher vol / rate → lower LTV.
     */
    function _computeLTV(
        uint256 omegaBps,
        uint256 vRegime,    // WAD
        uint256 rBps
    ) internal pure returns (uint256) {
        // Base LTV scales with Ω: max 70% at Ω=9500
        uint256 baseLtv = (omegaBps * 7_000) / MAX_OMEGA_BPS; // bps

        // Vol penalty: reduce LTV by vol regime (WAD-scaled → bps)
        uint256 volPenaltyBps = (vRegime * BPS) / WAD;
        baseLtv = baseLtv > volPenaltyBps ? baseLtv - volPenaltyBps : 0;

        // Rate penalty: higher r = shorter effective term = lower LTV
        uint256 ratePenaltyBps = rBps / 4; // quarter of discount rate
        baseLtv = baseLtv > ratePenaltyBps ? baseLtv - ratePenaltyBps : 0;

        // Floor at 5%, ceiling at 70%
        if (baseLtv < 500)  baseLtv = 500;
        if (baseLtv > 7000) baseLtv = 7000;

        return baseLtv;
    }
}
