// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISablierV2Flow {
    function getRecipient(bytes32 flowId) external view returns (address);
    function getAsset(bytes32 flowId) external view returns (address);
    function getRatePerSecond(bytes32 flowId) external view returns (uint128);
    function withdraw(bytes32 flowId, address to, uint128 amount) external;
}

/**
 * @title SablierV2FlowWrapper
 * @author Vestra Protocol
 * @notice Wrapper for Sablier Flow streams to allow Vestra operator management.
 */
contract SablierV2FlowWrapper is Ownable {
    ISablierV2Flow public flowContract;
    bytes32 public flowId;
    address public beneficiary;
    address public operator;

    event OperatorUpdated(address indexed operator);

    constructor(address _flowContract, bytes32 _flowId, address _beneficiary) Ownable(msg.sender) {
        require(_flowContract != address(0), "flowContract=0");
        require(_flowId != bytes32(0), "flowId=0");
        require(_beneficiary != address(0), "beneficiary=0");
        flowContract = ISablierV2Flow(_flowContract);
        flowId = _flowId;
        beneficiary = _beneficiary;
    }

    function ratePerSecond() external view returns (uint128) {
        return flowContract.getRatePerSecond(flowId);
    }

    function token() external view returns (address) {
        return flowContract.getAsset(flowId);
    }

    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "operator=0");
        operator = newOperator;
        emit OperatorUpdated(newOperator);
    }

    function releaseTo(address to, uint256 amount) external {
        require(msg.sender == operator, "not authorized");
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        flowContract.withdraw(flowId, to, uint128(amount));
    }
}
