// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  MockVestingToken
 * @notice A mintable ERC-20 for Vestra testnet simulations.
 * @dev    Threat model: owner-only mint. Not for mainnet.
 *         Use this to simulate LDO, AGIX, or any collateral token.
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract MockVestingToken is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint tokens to any address. Owner only.
     * @dev    Used to fund test wallets and seed vesting contracts.
     * @param  to     Recipient address.
     * @param  amount Amount in token's native decimals.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
