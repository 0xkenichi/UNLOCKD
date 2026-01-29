// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IVestingWallet {
    function beneficiary() external view returns (address);
    function start() external view returns (uint256);
    function duration() external view returns (uint256);
    function released(address token) external view returns (uint256);
}

interface IVestingWalletToken is IVestingWallet {
    function token() external view returns (address);
    function totalAllocation() external view returns (uint256);
}

interface IVestingWalletTokenRelease is IVestingWalletToken {
    function releaseTo(address to, uint256 amount) external;
}

contract VestingAdapter is IERC721Receiver, Ownable {

    struct Collateral {
        address vestingContract;
        address token;
        uint256 totalAmount;
        uint256 unlockTime;
    }

    address public loanManager;
    mapping(address => bool) public authorizedCallers;
    mapping(uint256 => Collateral) public collaterals;
    mapping(uint256 => address) public vestingContracts;

    constructor() Ownable(msg.sender) {}

    function setLoanManager(address manager) external onlyOwner {
        require(manager != address(0), "manager=0");
        loanManager = manager;
    }

    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        require(caller != address(0), "caller=0");
        authorizedCallers[caller] = allowed;
    }

    function escrow(
        uint256 collateralId,
        address vestingContract,
        address borrower
    ) external {
        require(borrower != address(0), "borrower=0");
        require(
            msg.sender == borrower ||
                msg.sender == loanManager ||
                authorizedCallers[msg.sender],
            "not authorized"
        );
        require(vestingContract.code.length > 0, "not a contract");
        require(collaterals[collateralId].vestingContract == address(0), "id used");

        IVestingWalletToken vesting = IVestingWalletToken(vestingContract);
        require(vesting.beneficiary() == borrower, "not beneficiary");

        uint256 start = vesting.start();
        uint256 duration = vesting.duration();
        require(duration > 0, "duration=0");
        uint256 unlockTime = start + duration;
        require(unlockTime > block.timestamp, "already unlocked");

        address token = vesting.token();
        require(token != address(0), "token=0");
        uint256 total = vesting.totalAllocation();
        require(total > 0, "total=0");

        collaterals[collateralId] = Collateral({
            vestingContract: vestingContract,
            token: token,
            totalAmount: total,
            unlockTime: unlockTime
        });
        vestingContracts[collateralId] = vestingContract;
    }

    function getDetails(
        uint256 collateralId
    ) external view returns (uint256 quantity, address token, uint256 unlockTime) {
        Collateral memory c = collaterals[collateralId];
        require(c.vestingContract != address(0), "unknown collateral");

        uint256 releasedAmt = IVestingWallet(c.vestingContract).released(c.token);
        require(c.totalAmount >= releasedAmt, "released>total");
        quantity = c.totalAmount - releasedAmt;
        token = c.token;
        unlockTime = c.unlockTime;
    }

    function releaseTo(uint256 collateralId, address to, uint256 amount) external {
        require(
            msg.sender == loanManager || authorizedCallers[msg.sender],
            "not authorized"
        );
        require(to != address(0), "to=0");

        Collateral memory c = collaterals[collateralId];
        require(c.vestingContract != address(0), "unknown collateral");
        require(block.timestamp >= c.unlockTime, "not unlocked");
        require(amount > 0, "amount=0");

        IVestingWalletTokenRelease(c.vestingContract).releaseTo(to, amount);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
