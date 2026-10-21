// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Minimal execution vault used by "Private Mode".
/// The vault is the onchain actor (borrow/repay/settle) so the user's primary
/// wallet does not need to be the transaction origin.
///
/// This contract is intentionally small; higher-level authorization (user consent,
/// policy checks, rate limits) is expected to be enforced by the relayer backend.
contract VestraVault is Ownable {
    event Executed(address indexed target, uint256 value, bytes data, bytes result);
    event Swept(address indexed token, address indexed to, uint256 amount);

    constructor(address controller) Ownable(controller) {
        require(controller != address(0), "controller=0");
    }

    receive() external payable {}

    function exec(address target, uint256 value, bytes calldata data) external onlyOwner returns (bytes memory) {
        require(target != address(0), "target=0");
        (bool ok, bytes memory result) = target.call{ value: value }(data);
        require(ok, "exec failed");
        emit Executed(target, value, data, result);
        return result;
    }

    function sweepERC20(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "token=0");
        require(to != address(0), "to=0");
        // ERC20 transfer selector: a9059cbb
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
        emit Swept(token, to, amount);
    }
}

