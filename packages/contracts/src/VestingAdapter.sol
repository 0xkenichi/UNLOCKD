// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "./interfaces/IVestingProtocol.sol";

/**
 * @title  VestingAdapter
 *
 * @notice Escrows vesting-stream NFTs (Sablier v2 Lockup, Streamflow EVM
 *         wrappers, whitelisted generic ERC-721 claims) as loan collateral.
 *
 * @dev    Threat model:
 *         • Only `loanManager` can escrow or release. It pulls the NFT from the
 *           borrower it names, so the recorded borrower is always the real
 *           previous owner (never the LoanManager itself).
 *         • `loanManager` can be set exactly once — no role can later redirect
 *           escrowed NFTs.
 *         • Cancelable or cancelled Sablier streams are rejected: the stream
 *           sender could otherwise claw back unvested tokens mid-loan.
 *         • While escrowed, this contract is the stream recipient, so every
 *           withdrawal from the stream lands here. Those tokens are attributed
 *           to the escrow (via the stream's withdrawn counter) and travel with
 *           the NFT on release. Collateral quantity is therefore constant for
 *           the life of the loan.
 *
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract VestingAdapter is AccessControl, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");

    enum Protocol {
        SABLIER_V2,      // 0
        STREAMFLOW_EVM,  // 1
        GENERIC_ERC721   // 2 — contracts implementing IVestingProtocol
    }

    struct EscrowRecord {
        address  nftContract;
        uint256  streamId;
        address  borrower;
        Protocol protocol;
        address  token;
        uint256  quantity;           // collateral tokens: unwithdrawn at escrow time
        uint256  withdrawnAtEscrow;  // stream's withdrawn counter when escrowed
        uint256  paidOut;            // vested tokens already sent out of this contract
        uint256  unlockTime;
        uint256  loanId;
        bool     released;
    }

    /// protocol → NFT contract → approved
    mapping(Protocol => mapping(address => bool)) public whitelisted;

    mapping(uint256 => EscrowRecord) private _escrows;
    uint256 private _nextEscrowId = 1;

    /// (nftContract, streamId) → active escrowId (0 = none)
    mapping(address => mapping(uint256 => uint256)) private _activeEscrow;

    address public loanManager;

    event ProtocolWhitelisted(Protocol indexed protocol, address indexed nftContract, bool approved);
    event LoanManagerSet(address indexed loanManager);
    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed loanId,
        address indexed borrower,
        address nftContract,
        uint256 streamId,
        Protocol protocol,
        address token,
        uint256 quantity,
        uint256 unlockTime
    );
    event VestedCollected(uint256 indexed escrowId, uint256 amount);
    event EscrowReleased(uint256 indexed escrowId, uint256 indexed loanId, address indexed recipient, uint256 vestedTokens);

    error NotWhitelisted(address nftContract);
    error NotOwner(address expected, address owner);
    error AlreadyEscrowed(address nftContract, uint256 streamId);
    error EscrowNotFound(uint256 escrowId);
    error AlreadyReleased(uint256 escrowId);
    error OnlyLoanManager(address caller);
    error LoanManagerAlreadySet();
    error ZeroAddress();
    error InvalidUnlockTime(uint256 unlockTime);
    error StreamCancelable(uint256 streamId);
    error StreamCancelled(uint256 streamId);
    error NothingLocked(uint256 streamId);

    modifier onlyLoanManager() {
        if (msg.sender != loanManager) revert OnlyLoanManager(msg.sender);
        _;
    }

    constructor(address _governor) {
        if (_governor == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, _governor);
        _grantRole(GOVERNOR_ROLE, _governor);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Governance
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Approve or revoke a vesting NFT contract. Revocation does not affect existing escrows.
     * @dev    Whitelisting criteria (the adapter's guarantees rely on them; only Sablier v2 is
     *         checked on-chain for cancelability):
     *         1. streams cannot be cancelled or clawed back by the sender once escrowed;
     *         2. withdrawals can only go to the current NFT owner (this contract while escrowed);
     *         3. the reported `withdrawn` amount only increases and equals tokens actually sent;
     *         4. the streamed token is a plain ERC-20 (no fee-on-transfer, rebasing or hooks).
     */
    function setWhitelisted(Protocol protocol, address nftContract, bool approved)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        if (nftContract == address(0)) revert ZeroAddress();
        whitelisted[protocol][nftContract] = approved;
        emit ProtocolWhitelisted(protocol, nftContract, approved);
    }

    /// @notice One-time wiring of the LoanManager.
    function setLoanManager(address _loanManager) external onlyRole(GOVERNOR_ROLE) {
        if (_loanManager == address(0)) revert ZeroAddress();
        if (loanManager != address(0)) revert LoanManagerAlreadySet();
        loanManager = _loanManager;
        emit LoanManagerSet(_loanManager);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LoanManager entry points
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Pull `streamId` from `borrower` into escrow for `loanId`.
     * @dev    `borrower` must have approved this contract for the NFT.
     */
    function escrowFor(
        address  borrower,
        address  nftContract,
        uint256  streamId,
        Protocol protocol,
        uint256  loanId
    ) external onlyLoanManager nonReentrant returns (uint256 escrowId) {
        if (!whitelisted[protocol][nftContract]) revert NotWhitelisted(nftContract);

        address currentOwner = IERC721(nftContract).ownerOf(streamId);
        if (currentOwner != borrower) revert NotOwner(borrower, currentOwner);
        if (_activeEscrow[nftContract][streamId] != 0) revert AlreadyEscrowed(nftContract, streamId);

        if (protocol == Protocol.SABLIER_V2) {
            ISablierV2Lockup s = ISablierV2Lockup(nftContract);
            if (s.wasCanceled(streamId)) revert StreamCancelled(streamId);
            if (s.isCancelable(streamId)) revert StreamCancelable(streamId);
        }

        (address token, uint256 total, uint256 withdrawn, uint256 refunded, uint256 unlockTime) =
            _readStream(protocol, nftContract, streamId);

        if (unlockTime <= block.timestamp) revert InvalidUnlockTime(unlockTime);
        uint256 quantity = total - withdrawn - refunded;
        if (quantity == 0) revert NothingLocked(streamId);

        escrowId = _nextEscrowId++;
        _escrows[escrowId] = EscrowRecord({
            nftContract:       nftContract,
            streamId:          streamId,
            borrower:          borrower,
            protocol:          protocol,
            token:             token,
            quantity:          quantity,
            withdrawnAtEscrow: withdrawn,
            paidOut:           0,
            unlockTime:        unlockTime,
            loanId:            loanId,
            released:          false
        });
        _activeEscrow[nftContract][streamId] = escrowId;

        IERC721(nftContract).transferFrom(borrower, address(this), streamId);

        emit EscrowCreated(escrowId, loanId, borrower, nftContract, streamId, protocol, token, quantity, unlockTime);
    }

    /**
     * @notice Send the NFT and every vested token withdrawn into escrow to `to`.
     * @dev    LoanManager passes the borrower on repayment, or the auction winner on liquidation.
     */
    function release(uint256 escrowId, address to) external onlyLoanManager nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        EscrowRecord storage rec = _requireActive(escrowId);

        uint256 vested = _heldTokens(rec);
        rec.released = true;
        rec.paidOut += vested;
        delete _activeEscrow[rec.nftContract][rec.streamId];

        IERC721(rec.nftContract).transferFrom(address(this), to, rec.streamId);
        if (vested > 0) IERC20(rec.token).safeTransfer(to, vested);

        emit EscrowReleased(escrowId, rec.loanId, to, vested);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Permissionless
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw everything currently vested from an escrowed Sablier stream into escrow.
     *         Purely custodial bookkeeping: the tokens still belong to the escrow and leave
     *         only with the NFT. Safe for anyone to call.
     */
    function collectVested(uint256 escrowId) external nonReentrant {
        EscrowRecord storage rec = _requireActive(escrowId);
        if (rec.protocol != Protocol.SABLIER_V2) return;
        uint256 before = _heldTokens(rec);
        ISablierV2Lockup(rec.nftContract).withdrawMax(rec.streamId, address(this));
        emit VestedCollected(escrowId, _heldTokens(rec) - before);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Collateral token, constant collateral quantity and unlock time.
    function collateral(uint256 escrowId)
        external
        view
        returns (address token, uint256 quantity, uint256 unlockTime)
    {
        EscrowRecord storage rec = _escrows[escrowId];
        if (rec.borrower == address(0)) revert EscrowNotFound(escrowId);
        return (rec.token, rec.quantity, rec.unlockTime);
    }

    function getEscrow(uint256 escrowId) external view returns (EscrowRecord memory) {
        EscrowRecord memory rec = _escrows[escrowId];
        if (rec.borrower == address(0)) revert EscrowNotFound(escrowId);
        return rec;
    }

    /// @notice Vested tokens sitting in this contract on behalf of `escrowId`.
    function heldTokens(uint256 escrowId) external view returns (uint256) {
        EscrowRecord storage rec = _escrows[escrowId];
        if (rec.borrower == address(0) || rec.released) return 0;
        return _heldTokens(rec);
    }

    function getEscrowId(address nftContract, uint256 streamId) external view returns (uint256) {
        return _activeEscrow[nftContract][streamId];
    }

    /// @dev Accept ERC-721 transfers only from whitelisted contracts.
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        view
        override
        returns (bytes4)
    {
        bool known = whitelisted[Protocol.SABLIER_V2][msg.sender]
            || whitelisted[Protocol.STREAMFLOW_EVM][msg.sender]
            || whitelisted[Protocol.GENERIC_ERC721][msg.sender];
        require(known, "VestingAdapter: unsolicited NFT");
        return IERC721Receiver.onERC721Received.selector;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _requireActive(uint256 escrowId) internal view returns (EscrowRecord storage rec) {
        rec = _escrows[escrowId];
        if (rec.borrower == address(0)) revert EscrowNotFound(escrowId);
        if (rec.released) revert AlreadyReleased(escrowId);
    }

    /// @dev Tokens withdrawn from the stream since escrow (all of which were sent here, as this
    ///      contract is the recipient), minus what was already paid out. Capped by the actual
    ///      balance as a defence against a misbehaving whitelisted stream contract.
    function _heldTokens(EscrowRecord storage rec) internal view returns (uint256) {
        (, , uint256 withdrawn, , ) = _readStream(rec.protocol, rec.nftContract, rec.streamId);
        uint256 owed = withdrawn - rec.withdrawnAtEscrow - rec.paidOut;
        uint256 bal = IERC20(rec.token).balanceOf(address(this));
        return owed < bal ? owed : bal;
    }

    function _readStream(Protocol protocol, address nftContract, uint256 streamId)
        internal
        view
        returns (address token, uint256 total, uint256 withdrawn, uint256 refunded, uint256 unlockTime)
    {
        if (protocol == Protocol.SABLIER_V2) {
            ISablierV2Lockup s = ISablierV2Lockup(nftContract);
            token      = s.getAsset(streamId);
            total      = s.getDepositedAmount(streamId);
            withdrawn  = s.getWithdrawnAmount(streamId);
            refunded   = s.getRefundedAmount(streamId);
            unlockTime = s.getEndTime(streamId);
        } else if (protocol == Protocol.STREAMFLOW_EVM) {
            (token, total, withdrawn, unlockTime) = IStreamflow(nftContract).getStreamData(streamId);
        } else {
            (token, total, withdrawn, unlockTime) = IVestingProtocol(nftContract).getStream(streamId);
        }
    }
}
