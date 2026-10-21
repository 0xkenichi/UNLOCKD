// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OpenClawLighthouse
 * @notice A decentralized risk oracle that aggregates assessments from multiple independent agents.
 */
contract OpenClawLighthouse is Ownable {
    struct Vote {
        uint256 omegaBps;
        uint256 timestamp;
    }

    mapping(address => bool) public isAuthorizedAgent;
    mapping(address => mapping(address => Vote)) public agentVotes; // token => agent => vote
    address[] public authorizedAgents;

    uint256 public constant VOTE_EXPIRY = 24 hours;
    uint256 public minVotesRequired = 1;

    event AgentAuthorized(address indexed agent);
    event AgentDeauthorized(address indexed agent);
    event VoteSubmitted(address indexed token, address indexed agent, uint256 omegaBps);

    constructor() Ownable(msg.sender) {}

    function authorizeAgent(address agent) external onlyOwner {
        if (!isAuthorizedAgent[agent]) {
            isAuthorizedAgent[agent] = true;
            authorizedAgents.push(agent);
            emit AgentAuthorized(agent);
        }
    }

    function deauthorizeAgent(address agent) external onlyOwner {
        isAuthorizedAgent[agent] = false;
        emit AgentDeauthorized(agent);
    }

    function submitVote(address token, uint256 omegaBps) external {
        require(isAuthorizedAgent[msg.sender], "not authorized");
        require(omegaBps <= 10000, "invalid omega");
        
        agentVotes[token][msg.sender] = Vote({
            omegaBps: omegaBps,
            timestamp: block.timestamp
        });
        
        emit VoteSubmitted(token, msg.sender, omegaBps);
    }

    /**
     * @notice Returns the median Omega assessment for a token.
     * For simplicity in this version, we return the minimum of active votes to be conservative.
     */
    function getConsensusOmega(address token) external view returns (uint256) {
        uint256 minOmega = 10000;
        uint256 validVotes = 0;

        for (uint256 i = 0; i < authorizedAgents.length; i++) {
            address agent = authorizedAgents[i];
            if (isAuthorizedAgent[agent]) {
                Vote memory v = agentVotes[token][agent];
                if (v.timestamp > 0 && block.timestamp - v.timestamp < VOTE_EXPIRY) {
                    if (v.omegaBps < minOmega) {
                        minOmega = v.omegaBps;
                    }
                    validVotes++;
                }
            }
        }

        if (validVotes < minVotesRequired) {
            return 10000; // No consensus, default to 100%
        }

        return minOmega;
    }

    function setMinVotesRequired(uint256 _min) external onlyOwner {
        minVotesRequired = _min;
    }
}
