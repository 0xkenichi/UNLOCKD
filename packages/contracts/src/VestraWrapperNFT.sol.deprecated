// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title  VestraWrapperNFT
 * @notice ERC-721 representing an active Vestra loan position.
 */
contract VestraWrapperNFT is ERC721, AccessControl {
    using Strings for uint256;

    bytes32 public constant LOAN_MANAGER_ROLE = keccak256("LOAN_MANAGER_ROLE");

    uint256 private _tokenIdCounter;

    struct LoanMetadata {
        address collateralToken;    
        uint256 streamId;           
        uint256 borrowedUsdc;       
        uint256 dpvAtOrigination;   
        uint256 interestRateBps;    
        uint256 originatedAt;       
        uint256 dueAt;              
        uint256 vcsTier;            
        bool    settled;            
    }

    mapping(uint256 => LoanMetadata) public loanData;

    event LoanNFTMinted(uint256 indexed tokenId, address indexed borrower, uint256 streamId, uint256 borrowedUsdc);
    event LoanNFTBurned(uint256 indexed tokenId, bool repaid);

    constructor() ERC721("Vestra Loan Position", "vLOAN") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function mint(address to, LoanMetadata calldata metadata) external onlyRole(LOAN_MANAGER_ROLE) returns (uint256 tokenId) {
        tokenId = ++_tokenIdCounter;
        _safeMint(to, tokenId);
        loanData[tokenId] = metadata;
        emit LoanNFTMinted(tokenId, to, metadata.streamId, metadata.borrowedUsdc);
    }

    function burn(uint256 tokenId, bool repaid) external onlyRole(LOAN_MANAGER_ROLE) {
        loanData[tokenId].settled = true;
        _burn(tokenId);
        emit LoanNFTBurned(tokenId, repaid);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Vestra: nonexistent token");
        LoanMetadata storage m = loanData[tokenId];

        string memory json = string(abi.encodePacked(
            '{"name":"Vestra Loan #', tokenId.toString(),
            '","description":"Active Vestra Protocol loan position.",',
            '"attributes":[',
            '{"trait_type":"Borrowed USDC","value":"', (m.borrowedUsdc / 1e6).toString(), '"},',
            '{"trait_type":"Stream ID","value":"',    m.streamId.toString(), '"},',
            '{"trait_type":"Interest Rate BPS","value":"', m.interestRateBps.toString(), '"},',
            '{"trait_type":"Due At","value":"',        m.dueAt.toString(), '"},',
            '{"trait_type":"Settled","value":"',       m.settled ? "true" : "false", '"}',
            ']}'
        ));

        return string(abi.encodePacked("data:application/json;utf8,", json));
    }

    function supportsInterface(bytes4 id) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(id);
    }

    function grantLoanManager(address lm) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(LOAN_MANAGER_ROLE, lm);
    }

    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
