// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockProjectToken is ERC20, Ownable {
    uint256 public immutable cap;
    uint8 private immutable tokenDecimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 cap_,
        address initialOwner
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        require(cap_ > 0, "cap=0");
        require(initialOwner != address(0), "owner=0");
        cap = cap_;
        tokenDecimals = decimals_;
        _mint(initialOwner, cap_);
        _transferOwnership(initialOwner);
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= cap, "cap exceeded");
        _mint(to, amount);
    }
}
