// SPDX-License-Identifier: BSL-1.1
// Copyright © 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title VestraCreditRegistry
 * @notice On-chain registry for Vestra Credit Scores (VCS).
 *
 * The off-chain VCS engine (vcsEngine.ts) computes scores from identity providers,
 * on-chain activity, credit history, and governance participation.  The authorised
 * RELAYER pushes an attested score + tier into this registry on a cadence of
 * ≤ 24 h (or immediately on any scoring event that changes the tier).
 *
 * Consumers (LoanManager, LendingPool) call:
 *   - getTier(borrower)            → VcsTier  (STANDARD | PREMIUM | TITAN)
 *   - getLtvBoostBps(borrower)     → uint16   (basis points to ADD to base LTV)
 *   - getRateAdjBps(borrower)      → int16    (basis points, negative = discount)
 *   - getMaxBorrowCap(borrower)    → uint256  (USDC, 6-decimal)
 *   - getOmegaFloor(borrower)      → uint16   (in bps, e.g. 7000 = Ω ≥ 0.70)
 *
 * Security model:
 *   - RELAYER_ROLE:  trusted backend process that writes scores.  Should be a
 *                    2/3 multisig before mainnet (see open security gap #5).
 *   - GOVERNOR_ROLE: governance timelock — can update tier thresholds and caps.
 *   - Scores expire after MAX_STALENESS seconds; stale scores revert to STANDARD.
 *   - Borrowers can trigger a "re-score request" event so the backend re-computes.
 */
contract VestraCreditRegistry is AccessControl, Pausable {

    // ─── Roles ──────────────────────────────────────────────────────────────

    bytes32 public constant RELAYER_ROLE  = keccak256("RELAYER_ROLE");
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    // ─── Types ──────────────────────────────────────────────────────────────

    enum VcsTier { STANDARD, PREMIUM, TITAN }

    struct ScoreRecord {
        uint16   score;          // 0–1000
        VcsTier  tier;
        uint32   updatedAt;      // unix timestamp
        uint16   ltvBoostBps;    // e.g. 500 = +5%
        int16    rateAdjBps;     // e.g. -200 = −2%
        uint256  maxBorrowCap;   // USDC (6 decimals)
        uint16   omegaFloorBps;  // e.g. 5000 = 0.50
    }

    // ─── Storage ────────────────────────────────────────────────────────────

    mapping(address => ScoreRecord) private _scores;
    
    /// mapping(borrower => mapping(asset => isAuthorized))
    mapping(address => mapping(address => bool)) public walletPermissions;

    /// Maximum age of a score before it degrades to STANDARD
    uint32 public constant MAX_STALENESS = 48 hours;

    // Default STANDARD parameters (used for unscored or stale addresses)
    uint16  public defaultLtvBoostBps   = 0;
    int16   public defaultRateAdjBps    = 0;
    uint256 public defaultMaxBorrowCap  = 100_000 * 1e6; // 100K USDC
    uint16  public defaultOmegaFloorBps = 3000;           // Ω ≥ 0.30

    // ─── Events ─────────────────────────────────────────────────────────────

    event ScoreUpdated(
        address indexed borrower,
        uint16          score,
        VcsTier         tier,
        uint32          updatedAt
    );

    event RescoreRequested(address indexed borrower, uint32 requestedAt);

    event WalletPermissionUpdated(address indexed borrower, address indexed asset, bool status);

    event DefaultParamsUpdated(
        uint16  ltvBoostBps,
        int16   rateAdjBps,
        uint256 maxBorrowCap,
        uint16  omegaFloorBps
    );

    // ─── Constructor ────────────────────────────────────────────────────────

    constructor(address governor, address relayer, address pauser) {
        require(governor != address(0), "governor=0");
        require(relayer  != address(0), "relayer=0");
        require(pauser   != address(0), "pauser=0");

        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _grantRole(GOVERNOR_ROLE,      governor);
        _grantRole(RELAYER_ROLE,       relayer);
        _grantRole(PAUSER_ROLE,        pauser);
    }

    // ─── Relayer writes ──────────────────────────────────────────────────────

    /**
     * @notice Push a new score for a borrower.
     * @dev Called by the off-chain VCS relayer after every scoring event.
     *      The relayer converts float values to bps before calling:
     *        ltvBoostBps   = vcs.ltvBoostBps        (e.g. 500)
     *        rateAdjBps    = vcs.rateSurchargeOrDiscountBps (e.g. -200)
     *        omegaFloorBps = omegaFloor * 10000      (e.g. 7000)
     */
    function updateScore(
        address borrower,
        uint16  score,
        VcsTier tier,
        uint16  ltvBoostBps,
        int16   rateAdjBps,
        uint256 maxBorrowCap,
        uint16  omegaFloorBps
    ) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(borrower != address(0), "borrower=0");
        require(score <= 1000,          "score>1000");
        require(ltvBoostBps <= 2000,    "ltv>20%");    // sanity cap

        _scores[borrower] = ScoreRecord({
            score:        score,
            tier:         tier,
            updatedAt:    uint32(block.timestamp),
            ltvBoostBps:  ltvBoostBps,
            rateAdjBps:   rateAdjBps,
            maxBorrowCap: maxBorrowCap,
            omegaFloorBps: omegaFloorBps
        });

        emit ScoreUpdated(borrower, score, tier, uint32(block.timestamp));
    }

    // ─── Consumer reads ──────────────────────────────────────────────────────

    function getRecord(address borrower) external view returns (ScoreRecord memory) {
        return _isStale(borrower) ? _defaultRecord() : _scores[borrower];
    }

    function getScore(address borrower) external view returns (uint16) {
        return _isStale(borrower) ? 500 : _scores[borrower].score;
    }

    function getTier(address borrower) external view returns (VcsTier) {
        return _isStale(borrower) ? VcsTier.STANDARD : _scores[borrower].tier;
    }

    function getLtvBoostBps(address borrower) external view returns (uint16) {
        return _isStale(borrower) ? defaultLtvBoostBps : _scores[borrower].ltvBoostBps;
    }

    function getRateAdjBps(address borrower) external view returns (int16) {
        return _isStale(borrower) ? defaultRateAdjBps : _scores[borrower].rateAdjBps;
    }

    function getMaxBorrowCap(address borrower) external view returns (uint256) {
        return _isStale(borrower) ? defaultMaxBorrowCap : _scores[borrower].maxBorrowCap;
    }

    function getOmegaFloor(address borrower) external view returns (uint16) {
        return _isStale(borrower) ? defaultOmegaFloorBps : _scores[borrower].omegaFloorBps;
    }

    function isStale(address borrower) external view returns (bool) {
        return _isStale(borrower);
    }

    // ─── Borrower interaction ────────────────────────────────────────────────

    /**
     * @notice Emits an event asking the off-chain relayer to re-score this address.
     *         Throttled: the relayer ignores requests more frequent than 1/hour.
     */
    function requestRescore() external whenNotPaused {
        emit RescoreRequested(msg.sender, uint32(block.timestamp));
    }

    /**
     * @notice Grants or revokes protocol visibility/access to a specific asset.
     * Signals to the off-chain VCS engine to apply LTV/Score boosts.
     */
    function grantWalletPermission(address asset, bool status) external whenNotPaused {
        require(asset != address(0), "asset=0");
        walletPermissions[msg.sender][asset] = status;
        emit WalletPermissionUpdated(msg.sender, asset, status);
    }

    // ─── Governor admin ──────────────────────────────────────────────────────

    function setDefaultParams(
        uint16  ltvBoostBps,
        int16   rateAdjBps,
        uint256 maxBorrowCap,
        uint16  omegaFloorBps
    ) external onlyRole(GOVERNOR_ROLE) {
        defaultLtvBoostBps   = ltvBoostBps;
        defaultRateAdjBps    = rateAdjBps;
        defaultMaxBorrowCap  = maxBorrowCap;
        defaultOmegaFloorBps = omegaFloorBps;
        emit DefaultParamsUpdated(ltvBoostBps, rateAdjBps, maxBorrowCap, omegaFloorBps);
    }

    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _isStale(address borrower) internal view returns (bool) {
        uint32 updated = _scores[borrower].updatedAt;
        return updated == 0 || block.timestamp - updated > MAX_STALENESS;
    }

    function _defaultRecord() internal view returns (ScoreRecord memory) {
        return ScoreRecord({
            score:         500,
            tier:          VcsTier.STANDARD,
            updatedAt:     0,
            ltvBoostBps:   defaultLtvBoostBps,
            rateAdjBps:    defaultRateAdjBps,
            maxBorrowCap:  defaultMaxBorrowCap,
            omegaFloorBps: defaultOmegaFloorBps
        });
    }
}
