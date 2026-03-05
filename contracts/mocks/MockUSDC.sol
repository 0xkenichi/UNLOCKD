// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC is ERC20, Ownable {
    bool public faucetEnabled = true;

    constructor() ERC20("Mock USDC", "mUSDC") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(uint256 amount) external {
        mint(msg.sender, amount);
    }

    function mint(address to, uint256 amount) public {
        require(faucetEnabled, "faucet disabled");
        _mint(to, amount);
    }

    function disableFaucet() external onlyOwner {
        faucetEnabled = false;
    }
}
