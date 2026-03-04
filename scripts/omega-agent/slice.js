const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../../contracts/LoanManager.sol');
let content = fs.readFileSync(targetPath, 'utf8');
let lines = content.split('\n');

const replacement = `    function setFacets(address _origination, address _repayment) external onlyOwner {
        originationFacet = _origination;
        repaymentFacet = _repayment;
    }

    function _hasAutoRepayPermissions(address borrower) internal view returns (bool) {
        return usdc.allowance(borrower, address(this)) > 0;
    }

    fallback() external payable {
        address facet;
        bytes4 sig = msg.sig;
        
        // Origination Routes
        if (
            sig == bytes4(keccak256("createLoan(uint256,address,uint256,uint256)")) ||
            sig == bytes4(keccak256("createLoanWithCollateralAmount(uint256,address,uint256,uint256,uint256)")) ||
            sig == bytes4(keccak256("createPrivateLoan(uint256,address,uint256,uint256)")) ||
            sig == bytes4(keccak256("createPrivateLoanWithCollateralAmount(uint256,address,uint256,uint256,uint256)"))
        ) {
            facet = originationFacet;
        } 
        // Repayment & Execution Routes
        else {
            facet = repaymentFacet;
        }
        
        require(facet != address(0), "Facet not set");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    
    receive() external payable {}`;

// Splice starts at index 281 (line 282) and removes 938 lines
lines.splice(281, 938, replacement);

fs.writeFileSync(targetPath, lines.join('\n'));
console.log('Successfully sliced LoanManager.sol');
