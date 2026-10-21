// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

// ─────────────────────────────────────────────────────────────────────────────
// Threat model:
//   • Only LoanManager (MINTER_ROLE) may mint / burn.
//   • tokenId == loanId (1:1, enforced at mint by LoanManager).
//   • Transfers intentionally unrestricted — secondary market OK.
//   • NFT holder at settlement receives residual collateral.
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  VestraWrapperNFT
 * @notice ERC-721 representation of an open Vestra loan position.
 *         Minted at origination, burned at repayment or liquidation.
 *         tokenId == loanId. Holder at settlement receives residual.
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract VestraWrapperNFT is ERC721Enumerable, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    string private _baseTokenURI;

    struct LoanMeta {
        address borrower;        // original borrower (not necessarily current holder)
        address collateralToken; // vesting token used as collateral
        uint256 principal;       // USDC borrowed (6-dec)
        uint256 unlockTime;      // collateral unlock timestamp (seconds)
        uint64  mintedAt;        // block.timestamp at origination
    }

    mapping(uint256 => LoanMeta) public loanMeta;

    event LoanNFTMinted(uint256 indexed loanId, address indexed borrower, uint256 principal);
    event LoanNFTBurned(uint256 indexed loanId, address indexed holder);

    constructor(address admin, string memory baseURI)
        ERC721("Vestra Loan Position", "VLOAN")
    {
        require(admin != address(0), "admin=0");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _baseTokenURI = baseURI;
    }

    /**
     * @notice Mints a loan NFT at origination. Only MINTER_ROLE.
     * @dev    Reverts if tokenId already exists (ERC721 invariant).
     *         unlockTime must be in the future.
     */
    function mint(
        uint256 loanId,
        address borrower,
        address collateralToken,
        uint256 principal,
        uint256 unlockTime
    ) external onlyRole(MINTER_ROLE) {
        require(borrower        != address(0), "borrower=0");
        require(collateralToken != address(0), "collateral=0");
        require(principal > 0,                 "principal=0");
        require(unlockTime > block.timestamp,  "unlock in past");

        loanMeta[loanId] = LoanMeta({
            borrower:        borrower,
            collateralToken: collateralToken,
            principal:       principal,
            unlockTime:      unlockTime,
            mintedAt:        uint64(block.timestamp)
        });

        _safeMint(borrower, loanId);
        emit LoanNFTMinted(loanId, borrower, principal);
    }

    /**
     * @notice Burns a loan NFT on repayment or liquidation. Only MINTER_ROLE.
     * @dev    Reverts if loanId does not exist.
     */
    function burn(uint256 loanId) external onlyRole(MINTER_ROLE) {
        address holder = ownerOf(loanId); // reverts if non-existent
        delete loanMeta[loanId];
        _burn(loanId);
        emit LoanNFTBurned(loanId, holder);
    }

    /// @notice All open loan IDs held by a wallet.
    function loansOf(address wallet) external view returns (uint256[] memory ids) {
        uint256 count = balanceOf(wallet);
        ids = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            ids[i] = tokenOfOwnerByIndex(wallet, i);
        }
    }

    function _baseURI() internal view override returns (string memory) { return _baseTokenURI; }

    function setBaseURI(string calldata newURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = newURI;
    }

    function supportsInterface(bytes4 id)
        public view override(ERC721Enumerable, AccessControl) returns (bool)
    { return super.supportsInterface(id); }
}
