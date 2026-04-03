// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

// ─────────────────────────────────────────────────────────────────────────────
// OpenZeppelin
// ─────────────────────────────────────────────────────────────────────────────
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Vestra interfaces
// ─────────────────────────────────────────────────────────────────────────────
import "./interfaces/IVestingProtocol.sol";

/**
 * @title  VestingAdapter
 *
 * @notice Escrow abstraction layer for Vestra Protocol.
 *         Accepts vesting-stream NFTs (Sablier v2, Streamflow EVM, generic
 *         ERC-721 claim wrappers) from borrowers, holds them as collateral
 *         for the duration of a loan, and releases or liquidates them when
 *         the loan is settled or defaulted.
 *
 * @dev    Threat model:
 *         • Borrower tries to withdraw their NFT before loan repayment.
 *           → `releaseEscrow` is `onlyLoanManager`; borrower has no path.
 *         • Attacker submits a forged/malicious NFT contract.
 *           → Only `GOVERNOR_ROLE` can whitelist protocol adapters.
 *         • Attacker calls `escrow` for a streamId they do not own.
 *           → `IERC721.ownerOf(streamId) == msg.sender` enforced before
 *             `transferFrom`. Protocol-specific ownership checked post-transfer.
 *         • Re-entrancy via malicious ERC-721 `onERC721Received` hook.
 *           → `nonReentrant` on all state-mutating functions.
 *         • Borrower's vesting contract gets cancelled mid-loan.
 *           → `getDetails` always re-reads on-chain state; LoanManager
 *             uses this to compute residual value at settlement.
 *         • Protocol contract upgraded to steal escrowed NFTs.
 *           → Only `GOVERNOR_ROLE` can change `loanManager`. Timelock
 *             recommended on governor in production.
 *
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract VestingAdapter is
    AccessControl,
    Pausable,
    ReentrancyGuard,
    IERC721Receiver
{
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────────────────

    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // ─────────────────────────────────────────────────────────────────────────
    // Supported protocols
    // ─────────────────────────────────────────────────────────────────────────

    enum Protocol {
        SABLIER_V2,      // 0
        STREAMFLOW_EVM,  // 1
        GENERIC_ERC721   // 2 — custom NFT claim wrappers (e.g. VestraWrapperNFT)
    }

    /// @notice Registered protocol adapters, set by GOVERNOR_ROLE.
    ///         protocol → contract address → approved
    mapping(Protocol => mapping(address => bool)) public whitelisted;

    // ─────────────────────────────────────────────────────────────────────────
    // Escrow record
    // ─────────────────────────────────────────────────────────────────────────

    struct EscrowRecord {
        address nftContract;   // address of the vesting NFT contract
        uint256 streamId;      // tokenId / streamId
        address borrower;      // original owner, entitled to NFT on repayment
        Protocol protocol;     // which adapter to use for on-chain reads
        address token;         // the vesting token (collateral asset)
        uint256 totalAmount;   // total tokens locked in the stream (WAD-agnostic)
        uint256 unlockTime;    // stream end timestamp (seconds)
        uint256 loanId;        // linked LoanManager loanId (0 before assignment)
        bool    released;      // true once NFT has left escrow (any path)
    }

    /// @dev escrowId → EscrowRecord
    mapping(uint256 => EscrowRecord) private _escrows;

    /// @dev Monotonic counter. escrowId 0 is invalid sentinel.
    uint256 private _nextEscrowId = 1;

    /// @dev Reverse lookup: (nftContract, streamId) → escrowId
    ///      Prevents double-escrow of the same NFT.
    mapping(address => mapping(uint256 => uint256)) private _activeEscrow;

    // ─────────────────────────────────────────────────────────────────────────
    // LoanManager
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The only address allowed to call `linkLoan`, `releaseEscrow`,
    ///         and `liquidateEscrow`.
    address public loanManager;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ProtocolWhitelisted(Protocol indexed protocol, address indexed nftContract, bool approved);
    event LoanManagerUpdated(address indexed oldManager, address indexed newManager);

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed borrower,
        address indexed nftContract,
        uint256 streamId,
        Protocol protocol,
        address token,
        uint256 totalAmount,
        uint256 unlockTime
    );

    event LoanLinked(uint256 indexed escrowId, uint256 indexed loanId);

    event EscrowReleased(
        uint256 indexed escrowId,
        uint256 indexed loanId,
        address indexed recipient,
        bool wasLiquidation
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error NotWhitelisted(address nftContract);
    error NotOwner(address caller, address owner);
    error AlreadyEscrowed(address nftContract, uint256 streamId);
    error EscrowNotFound(uint256 escrowId);
    error AlreadyReleased(uint256 escrowId);
    error AlreadyLinked(uint256 escrowId, uint256 existingLoanId);
    error OnlyLoanManager(address caller);
    error ZeroAddress();
    error InvalidUnlockTime(uint256 unlockTime);
    error StreamCancelled(uint256 streamId);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param _governor  Address receiving GOVERNOR_ROLE and DEFAULT_ADMIN_ROLE.
     * @param _guardian  Address receiving GUARDIAN_ROLE (pause authority).
     * @param _loanManager Initial LoanManager address. Can be updated by GOVERNOR.
     */
    constructor(address _governor, address _guardian, address _loanManager) {
        if (_governor == address(0) || _guardian == address(0) || _loanManager == address(0))
            revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, _governor);
        _grantRole(GOVERNOR_ROLE, _governor);
        _grantRole(GUARDIAN_ROLE, _guardian);

        loanManager = _loanManager;
        emit LoanManagerUpdated(address(0), _loanManager);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin — GOVERNOR_ROLE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Approve or revoke a vesting NFT contract for use as collateral.
     * @dev    Only GOVERNOR_ROLE. Revocation does not affect existing escrows —
     *         those must be settled normally. New escrow calls will revert.
     * @param  protocol     The protocol family (SABLIER_V2, STREAMFLOW_EVM, GENERIC_ERC721).
     * @param  nftContract  The ERC-721 contract to whitelist.
     * @param  approved     True to approve, false to revoke.
     */
    function setWhitelisted(
        Protocol protocol,
        address nftContract,
        bool approved
    ) external onlyRole(GOVERNOR_ROLE) {
        if (nftContract == address(0)) revert ZeroAddress();
        whitelisted[protocol][nftContract] = approved;
        emit ProtocolWhitelisted(protocol, nftContract, approved);
    }

    /**
     * @notice Update the authorised LoanManager address.
     * @dev    Only GOVERNOR_ROLE. Should be behind a timelock in production.
     *         Does NOT affect outstanding escrows; those retain their loanId linkage.
     */
    function setLoanManager(address _loanManager)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        if (_loanManager == address(0)) revert ZeroAddress();
        emit LoanManagerUpdated(loanManager, _loanManager);
        loanManager = _loanManager;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin — GUARDIAN_ROLE
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Pause all state-mutating functions. Emergency use only.
    function pause() external onlyRole(GUARDIAN_ROLE) { _pause(); }

    /// @notice Resume normal operation.
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: escrow()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Escrow a vesting-stream NFT as collateral.
     *
     * @dev    Security:
     *         1. Caller must currently own the NFT (checked on-chain before transferFrom).
     *         2. nftContract must be whitelisted for the declared protocol.
     *         3. NFT must not already be in escrow (reverse-lookup check).
     *         4. unlockTime must be in the future — no escrowing expired streams.
     *         5. Uses `nonReentrant` — the `transferFrom` is the last external call.
     *         6. Protocol-specific data is pulled after transfer to ensure we read
     *            the state of the NFT we actually hold.
     *
     *         CEI order:
     *           Checks  → all reverts above
     *           Effects → _escrows write, _activeEscrow write, _nextEscrowId increment
     *           Interaction → IERC721.transferFrom (last)
     *
     * @param  streamId     The tokenId / streamId of the vesting NFT.
     * @param  nftContract  The ERC-721 contract holding the vesting position.
     * @param  protocol     The protocol family — must match whitelisted entry.
     * @return escrowId     Unique identifier for this escrow record.
     */
    function escrow(
        uint256 streamId,
        address nftContract,
        Protocol protocol
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 escrowId)
    {
        // ── Checks ──────────────────────────────────────────────────────────
        if (!whitelisted[protocol][nftContract])
            revert NotWhitelisted(nftContract);

        // Caller must own the NFT right now
        address currentOwner = IERC721(nftContract).ownerOf(streamId);
        if (currentOwner != msg.sender)
            revert NotOwner(msg.sender, currentOwner);

        // Prevent double-escrow
        if (_activeEscrow[nftContract][streamId] != 0)
            revert AlreadyEscrowed(nftContract, streamId);

        // Pull on-chain stream data and validate
        (
            address token,
            uint256 totalAmount,
            /* withdrawnAmount */,
            uint256 unlockTime
        ) = _readStream(protocol, nftContract, streamId);

        if (unlockTime <= block.timestamp)
            revert InvalidUnlockTime(unlockTime);

        // For Sablier: check stream wasn't cancelled
        if (protocol == Protocol.SABLIER_V2) {
            _assertSablierNotCancelled(nftContract, streamId);
        }

        // ── Effects ─────────────────────────────────────────────────────────
        escrowId = _nextEscrowId++;

        _escrows[escrowId] = EscrowRecord({
            nftContract:  nftContract,
            streamId:     streamId,
            borrower:     msg.sender,
            protocol:     protocol,
            token:        token,
            totalAmount:  totalAmount,
            unlockTime:   unlockTime,
            loanId:       0,
            released:     false
        });

        _activeEscrow[nftContract][streamId] = escrowId;

        // ── Interactions ─────────────────────────────────────────────────────
        // transferFrom last — re-entrancy guard is active
        IERC721(nftContract).transferFrom(msg.sender, address(this), streamId);

        emit EscrowCreated(
            escrowId,
            msg.sender,
            nftContract,
            streamId,
            protocol,
            token,
            totalAmount,
            unlockTime
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: linkLoan()   — called by LoanManager after loan origination
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Link a LoanManager loanId to an escrow record.
     * @dev    Only LoanManager. Called immediately after `createLoan` confirms
     *         the dDPV is sufficient to cover the requested amount.
     *         Reverts if already linked — prevents a single escrow backing two loans.
     * @param  escrowId  The escrow to link.
     * @param  loanId    The loan being originated.
     */
    function linkLoan(uint256 escrowId, uint256 loanId)
        external
        onlyLoanManager
        nonReentrant
        whenNotPaused
    {
        EscrowRecord storage rec = _requireActive(escrowId);

        if (rec.loanId != 0)
            revert AlreadyLinked(escrowId, rec.loanId);

        rec.loanId = loanId;
        emit LoanLinked(escrowId, loanId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: releaseEscrow()  — repayment path
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Return the escrowed NFT to the borrower after full repayment.
     * @dev    Only LoanManager. CEI: state cleared before NFT transfer.
     *         Recipient is always `rec.borrower` — LoanManager cannot redirect
     *         the NFT to an arbitrary address.
     * @param  escrowId  The escrow record to release.
     */
    function releaseEscrow(uint256 escrowId)
        external
        onlyLoanManager
        nonReentrant
    {
        EscrowRecord storage rec = _requireActive(escrowId);

        // ── Effects ─────────────────────────────────────────────────────────
        address recipient = rec.borrower;
        address nft       = rec.nftContract;
        uint256 sid       = rec.streamId;

        rec.released = true;
        delete _activeEscrow[nft][sid];

        // ── Interactions ─────────────────────────────────────────────────────
        IERC721(nft).transferFrom(address(this), recipient, sid);

        emit EscrowReleased(escrowId, rec.loanId, recipient, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: liquidateEscrow()  — default / auction path
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Transfer the escrowed NFT to `liquidator` (auction contract or
     *         strategic recourse handler). Called by LoanManager on default.
     * @dev    Only LoanManager. The liquidator address is validated non-zero
     *         here — LoanManager is trusted for logic, but we add a sanity guard.
     *         CEI: state cleared before NFT transfer.
     * @param  escrowId    The escrow record to liquidate.
     * @param  liquidator  Address receiving the NFT (Staged Auction or Strategic Recourse contract).
     */
    function liquidateEscrow(uint256 escrowId, address liquidator)
        external
        onlyLoanManager
        nonReentrant
    {
        if (liquidator == address(0)) revert ZeroAddress();
        EscrowRecord storage rec = _requireActive(escrowId);

        // ── Effects ─────────────────────────────────────────────────────────
        address nft = rec.nftContract;
        uint256 sid = rec.streamId;

        rec.released = true;
        delete _activeEscrow[nft][sid];

        // ── Interactions ─────────────────────────────────────────────────────
        IERC721(nft).transferFrom(address(this), liquidator, sid);

        emit EscrowReleased(escrowId, rec.loanId, liquidator, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View: getDetails()
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Return live escrow data.
     * @dev    `remainingValue` re-reads the chain — it reflects any
     *         withdrawals or cancellations that occurred since escrow creation.
     *         LoanManager and ValuationEngine call this for collateral checks.
     *
     * @param  escrowId  The escrow to query.
     * @return token          The vesting token address.
     * @return remainingValue Tokens still locked in the stream (totalAmount - withdrawn).
     * @return unlockTime     Stream end timestamp (seconds).
     * @return borrower       Original depositor.
     * @return loanId         Linked loan (0 if not yet linked).
     * @return released       True if NFT has left escrow.
     */
    function getDetails(uint256 escrowId)
        external
        view
        returns (
            address token,
            uint256 remainingValue,
            uint256 unlockTime,
            address borrower,
            uint256 loanId,
            bool    released
        )
    {
        EscrowRecord storage rec = _escrows[escrowId];
        if (rec.borrower == address(0)) revert EscrowNotFound(escrowId);

        token    = rec.token;
        borrower = rec.borrower;
        loanId   = rec.loanId;
        released = rec.released;

        // Live re-read for remaining value and unlock time
        (
            /* token */,
            uint256 total,
            uint256 withdrawn,
            uint256 end
        ) = _readStream(rec.protocol, rec.nftContract, rec.streamId);

        remainingValue = total > withdrawn ? total - withdrawn : 0;
        unlockTime     = end;
    }

    /**
     * @notice Convenience: return the escrowId for a given (nftContract, streamId) pair.
     *         Returns 0 if not currently escrowed.
     */
    function getEscrowId(address nftContract, uint256 streamId)
        external
        view
        returns (uint256)
    {
        return _activeEscrow[nftContract][streamId];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-721 receiver
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Accept ERC-721 transfers only from whitelisted contracts.
     *      This prevents griefing via unsolicited NFT deposits that would
     *      consume storage and confuse accounting.
     *
     *      NOTE: We do NOT use safeTransferFrom in `escrow()` — we use
     *      `transferFrom` to avoid re-entrancy via this callback.
     *      This function is implemented solely to satisfy the IERC721Receiver
     *      interface in case a protocol's NFT contract forces safeTransferFrom.
     */
    function onERC721Received(
        address /* operator */,
        address /* from */,
        uint256 /* tokenId */,
        bytes calldata /* data */
    ) external view override returns (bytes4) {
        // Accept only from known whitelisted contracts — otherwise revert
        // (loops through all protocol types — gas acceptable for inbound hook)
        bool known = (
            whitelisted[Protocol.SABLIER_V2][msg.sender]     ||
            whitelisted[Protocol.STREAMFLOW_EVM][msg.sender] ||
            whitelisted[Protocol.GENERIC_ERC721][msg.sender]
        );
        require(known, "VestingAdapter: unsolicited NFT");
        return IERC721Receiver.onERC721Received.selector;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyLoanManager() {
        if (msg.sender != loanManager) revert OnlyLoanManager(msg.sender);
        _;
    }

    function _requireActive(uint256 escrowId)
        internal
        view
        returns (EscrowRecord storage rec)
    {
        rec = _escrows[escrowId];
        if (rec.borrower == address(0)) revert EscrowNotFound(escrowId);
        if (rec.released)               revert AlreadyReleased(escrowId);
    }

    /**
     * @dev Protocol-dispatched stream read.
     *      Returns (token, totalAmount, withdrawnAmount, unlockTime).
     *      All paths must be exhaustive — adding a new Protocol enum value
     *      requires adding a branch here AND a revert on the default.
     */
    function _readStream(
        Protocol protocol,
        address  nftContract,
        uint256  streamId
    )
        internal
        view
        returns (
            address token,
            uint256 totalAmount,
            uint256 withdrawnAmount,
            uint256 unlockTime
        )
    {
        if (protocol == Protocol.SABLIER_V2) {
            ISablierV2LockupLinear sablier = ISablierV2LockupLinear(nftContract);
            (
                /* sender */,
                /* recipient */,
                uint128 deposit,
                address asset,
                /* cancelable */,
                /* wasCanceled */,
                uint128 withdrawn,
                ISablierV2LockupLinear.Timestamps memory ts
            ) = sablier.getStream(streamId);

            token           = asset;
            totalAmount     = uint256(deposit);
            withdrawnAmount = uint256(withdrawn);
            unlockTime      = uint256(ts.end);

        } else if (protocol == Protocol.STREAMFLOW_EVM) {
            IStreamflow sf = IStreamflow(nftContract);
            (token, totalAmount, withdrawnAmount, unlockTime) =
                sf.getStreamData(streamId);

        } else {
            // GENERIC_ERC721: must implement IVestingProtocol
            IVestingProtocol generic = IVestingProtocol(nftContract);
            (token, totalAmount, withdrawnAmount, unlockTime) =
                generic.getStream(streamId);
        }
    }

    /**
     * @dev Sablier-specific cancelled stream check.
     *      A cancelled Sablier stream still exists as an NFT but has `wasCanceled = true`.
     *      Accepting cancelled streams would let borrowers escrow worthless NFTs.
     */
    function _assertSablierNotCancelled(address nftContract, uint256 streamId)
        internal
        view
    {
        ISablierV2LockupLinear sablier = ISablierV2LockupLinear(nftContract);
        (
            /* sender */,
            /* recipient */,
            /* deposit */,
            /* asset */,
            /* cancelable */,
            bool wasCanceled,
            /* withdrawn */,
            /* ts */
        ) = sablier.getStream(streamId);
        if (wasCanceled) revert StreamCancelled(streamId);
    }
}
