// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SovereignASIWallet
 * @notice Simulates an ASI-native vesting wallet with agentic templates.
 * Used for ASI Chain DevNet integration testing.
 */
contract SovereignASIWallet is Ownable {
    
    enum Template { AGENT_ALPHA, NEURAL_REWARD, CUSTOM }

    struct VestingPosition {
        address beneficiary;
        address token;
        uint256 start;
        uint256 cliff;
        uint256 duration;
        uint256 totalAllocation;
        uint256 released;
        Template template;
        bool active;
    }

    mapping(uint256 => VestingPosition) public positions;
    uint256 public nextPositionId;

    event PositionCreated(uint256 indexed id, address indexed beneficiary, Template template);
    event TokensReleased(uint256 indexed id, address indexed beneficiary, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Create a vesting position based on pre-defined agentic templates.
     */
    function createAgentPosition(
        address beneficiary,
        address token,
        uint256 totalAllocation,
        Template template
    ) external onlyOwner returns (uint256) {
        uint256 start = block.timestamp;
        uint256 cliff;
        uint256 duration;

        if (template == Template.AGENT_ALPHA) {
            cliff = 180 days; // 6 months cliff
            duration = 730 days; // 24 months linear
        } else if (template == Template.NEURAL_REWARD) {
            cliff = 0;
            duration = 365 days; // 12 months linear
        } else {
            revert("Unknown template");
        }

        uint256 id = nextPositionId++;
        positions[id] = VestingPosition({
            beneficiary: beneficiary,
            token: token,
            start: start,
            cliff: cliff,
            duration: duration,
            totalAllocation: totalAllocation,
            released: 0,
            template: template,
            active: true
        });

        emit PositionCreated(id, beneficiary, template);
        return id;
    }

    /**
     * @notice Simulates the release of tokens to the beneficiary or a specified address.
     */
    function releaseTo(uint256 id, address to, uint256 amount) public {
        VestingPosition storage pos = positions[id];
        require(pos.active, "Position not active");
        require(block.timestamp >= pos.start + pos.cliff, "Cliff not reached");
        
        uint256 vestable = _vestedAmount(pos);
        require(amount <= vestable - pos.released, "Amount exceeds vested");

        pos.released += amount;
        bool success = IERC20(pos.token).transfer(to, amount);
        require(success, "Transfer failed");

        emit TokensReleased(id, to, amount);
    }

    function _vestedAmount(VestingPosition memory pos) internal view returns (uint256) {
        if (block.timestamp < pos.start + pos.cliff) {
            return 0;
        } else if (block.timestamp >= pos.start + pos.duration) {
            return pos.totalAllocation;
        } else {
            return (pos.totalAllocation * (block.timestamp - pos.start)) / pos.duration;
        }
    }

    /**
     * @notice Returns the metadata for a position in a standardized format.
     */
    function getPositionInfo(uint256 id) external view returns (
        address beneficiary,
        address token,
        uint256 totalAllocation,
        uint256 start,
        uint256 duration,
        Template template
    ) {
        VestingPosition memory pos = positions[id];
        return (pos.beneficiary, pos.token, pos.totalAllocation, pos.start, pos.duration, pos.template);
    }
}
