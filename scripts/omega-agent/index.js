// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
require("dotenv").config();
const { ethers } = require("ethers");
const BountyHunter = require("./bountyHunter");
const mettaclaw = require("./mettaclaw");

/**
 * The Omega Agent is the off-chain Brain of the Vestra Protocol.
 * It coordinates:
 * 1. MeTTaclaw: AI-driven risk management and interest rate adjustment.
 * 2. Bounty Hunter: Strict recourse sweeping of defaulted loans.
 */

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY;

const VALUATION_ENGINE_ADDR = process.env.VALUATION_ENGINE_ADDR;
const LOAN_MANAGER_ADDR = process.env.LOAN_MANAGER_ADDR;

const RECOURSE_TOKENS_TO_SWEEP = [
    process.env.WETH_ADDR || "0x0000000000000000000000000000000000000000",
    process.env.USDC_ADDR || "0x0000000000000000000000000000000000000000"
];

const LOAN_MANAGER_ABI = [
    "event LoanSettled(uint256 indexed loanId, bool defaulted)",
    "event DeficitSwept(uint256 indexed loanId, address indexed token, uint256 amountSeized, uint256 usdcValue)",
    "function loanDeficits(uint256 loanId) external view returns (uint256)"
];

async function main() {
    console.log("=========================================");
    console.log("====== VESTRA OMEGA AGENT STARTING ======");
    console.log("=========================================\n");

    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Wallet setup - default to random if no PK (for demo/sim)
    let wallet;
    if (PRIVATE_KEY) {
        try {
            wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        } catch (e) {
            console.error("Invalid KEEPER_PRIVATE_KEY. Check your .env file.");
            process.exit(1);
        }
    } else {
        console.warn("WARNING: KEEPER_PRIVATE_KEY not set. Running in simulation mode.");
        wallet = ethers.Wallet.createRandom().connect(provider);
    }

    const KEEPER_INDEX = parseInt(process.env.KEEPER_INDEX || "0");
    console.log(`Agent Wallet Address: ${wallet.address} (Keeper #${KEEPER_INDEX})`);

    // --- Task 0: Redundancy Jitter ---
    // Stagger starts to prevent multiple keepers from hitting the exact same block
    const jitter = KEEPER_INDEX * 2000;
    console.log(`[MAIN] Redundancy Jitter: Waiting ${jitter}ms before engaging...`);
    await new Promise(r => setTimeout(r, jitter));

    // --- Task 1: Initialize MeTTaclaw (The Brain) ---
    if (process.env.USE_METTA === "true") {
        console.log("[MAIN] Empowering Vestra with MeTTa AI Reasoner...");
        await mettaclaw.start(provider, wallet, true);
    } else {
        console.log("[MAIN] MeTTa reasoning disabled. Using static multipliers for basic watcher.");
        await mettaclaw.start(provider, wallet, false);
    }

    // --- Task 2: Initialize Bounty Hunter (The Keeper) ---
    if (LOAN_MANAGER_ADDR && LOAN_MANAGER_ADDR !== ethers.ZeroAddress) {
        const loanManager = new ethers.Contract(LOAN_MANAGER_ADDR, LOAN_MANAGER_ABI, wallet);
        const bountyHunter = new BountyHunter(loanManager, RECOURSE_TOKENS_TO_SWEEP);
        bountyHunter.start();
        console.log("[MAIN] Bounty Hunter active.");
    } else {
        console.warn("[MAIN] LOAN_MANAGER_ADDR not set. Bounty Hunter running in Simulation Mode.");
        const bountyHunter = new BountyHunter(null, RECOURSE_TOKENS_TO_SWEEP);
        bountyHunter.simulate();
    }
}

main().catch(console.error);
