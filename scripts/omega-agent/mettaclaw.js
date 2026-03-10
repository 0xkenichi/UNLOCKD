// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const path = require('path');
const fs = require("fs");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const { ethers } = require("ethers");
const { createClient } = require('@supabase/supabase-js');

// ── TELEMETRY & DATABASE SETUP ──────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
}

// Unique Session ID for this specific run
const sessionId = `sid_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

async function logToSupabase(table, data) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from(table).insert([{
            ...data,
            session_id: sessionId,
            timestamp: new Date()
        }]);
        if (error) console.error(`[Supabase Error]:`, error.message);
    } catch (e) {
        console.error(`[Supabase Conn Error]: Database offline.`);
    }
}

// ── SECTION 1: True MeTTa Execution Bridge ──────────────────────────────────
class TrueMeTTaBridge {
    constructor() {
        this.brainDir = path.join(__dirname, "brain");
        this.stateFile = path.join(this.brainDir, "current_state.metta");
        this.runnerFile = path.join(this.brainDir, "runner.metta");
        this.mettaBin = process.env.METTA_PATH || 'metta';
        this.stateAtoms = new Map();

        // Initialize Default Baseline Atoms
        this.setAtom("def_coll_rank", '(CollateralRank 3 3)'); // Default rank 3 for unknown pools
        this.setAtom("def_vol", '(TokenVolatility any 0)');  // Default 0 vol
        this.setAtom("def_sent", '(MarketSentiment any 0.0)'); // Neutral sentiment
        this.setAtom("def_pump", '(FlashPumpDetected any False)'); // No pump
        this.setAtom("def_liq", '(LiquidationRate any 0.0)');  // Zero liquidations
        this.setAtom("def_util", '(PoolUtilization any 0)');  // Zero utilization
        this.setAtom("def_rep_r", '(BorrowerRepaid any 0)');  // Baseline reputation
        this.setAtom("def_rep_d", '(BorrowerDefaulted any 0)');
        if (!fs.existsSync(this.brainDir)) fs.mkdirSync(this.brainDir);
    }

    setAtom(key, atomString) {
        this.stateAtoms.set(key, atomString);
    }

    async flushState() {
        const content = Array.from(this.stateAtoms.values()).join("\n");
        fs.writeFileSync(this.stateFile, content);
    }

    async query(expression) {
        await this.flushState();

        // Use a "Flat Space" approach to avoid module isolation issues in MeTTa 0.2.10
        const riskBrain = fs.readFileSync(path.join(this.brainDir, "risk_brain.metta"), "utf8");
        const selfImprove = fs.readFileSync(path.join(this.brainDir, "self_improve.metta"), "utf8");
        const currentState = fs.readFileSync(this.stateFile, "utf8");

        const runnerContent = `
; FLAT SPACE RUNNER (MeTTaclaw)
${riskBrain}
${selfImprove}
${currentState}

!${expression}
        `;
        fs.writeFileSync(this.runnerFile, runnerContent);

        try {
            const { stdout, stderr } = await exec(`${this.mettaBin} runner.metta`, { cwd: this.brainDir });

            if (stderr) {
                // Some MeTTa warnings are normal, but we log them if they look systemic
                if (stderr.includes("Error") || stderr.includes("Panic")) {
                    console.error(`[MeTTa CLI Error]:`, stderr.trim());
                }
            }

            if (stdout.includes("Error")) {
                console.error(`[MeTTa Logic Error]:`, stdout.trim());
                return null;
            }

            const matches = stdout.match(/\[(.*?)\]/g);
            if (matches && matches.length > 0) {
                // Take the last result line (corresponds to our query)
                const lastMatch = matches[matches.length - 1];
                // Strip the brackets and split by comma to handle superpositions
                const rawContent = lastMatch.substring(1, lastMatch.length - 1).trim();
                if (!rawContent || rawContent === "") return null;

                // If there are multiple results, take the first one (most specific)
                const results = rawContent.split(",").map(s => s.trim());
                return results[0];
            }
            return stdout.trim();
        } catch (error) {
            console.error(`[MeTTa CLI Exec Error]: Ensure '${this.mettaBin}' is in your PATH or METTA_PATH is set.`);
            return null;
        }
    }
}

const metta = new TrueMeTTaBridge();

// ── SECTION 2: Risk Logic ───────────────────────────────────────────────────

async function performRiskAnalysis(activeAgents, spotPrice, priceWindow, chainName, useMetta) {
    // 1. Agent Swarm Jitter
    const swarmVolatility = (Math.random() - 0.5) * 800;
    const nextAgents = Math.max(500, Math.min(25000, Math.floor(activeAgents + swarmVolatility)));

    // 2. Realistic Price & LWMA TWAP
    priceWindow.push(spotPrice);
    if (priceWindow.length > 20) priceWindow.shift();
    const twap = priceWindow.reduce((a, b) => a + b, 0) / priceWindow.length;

    // 3. Chaos Engine: 5% chance of Flash Pump (Demo Trigger)
    const isFlashPump = Math.random() < 0.05;
    if (isFlashPump) {
        console.log(`\n[🚨 ALERT] MeTTa detecting Flash Pump patterns...`);
        metta.setAtom("pump", `(FlashPumpDetected "0xTOKEN" True)`);
    } else {
        metta.setAtom("pump", `(FlashPumpDetected "0xTOKEN" False)`);
    }

    // 4. Inject State into MeTTa
    metta.setAtom("vol", `(TokenVolatility "0xTOKEN" ${Math.floor(Math.random() * 30)})`);
    metta.setAtom("sent", `(MarketSentiment "0xTOKEN" ${(Math.random() * 2 - 1).toFixed(2)})`);
    metta.setAtom("util", `(PoolUtilization 1 ${Math.floor(6000 + (Math.random() * 2000))})`);
    metta.setAtom("twap", `(MarketTWAP "0xTOKEN" ${twap.toFixed(4)})`);

    // 5. Query ASI for decisions
    let borrowRateBps = 500;
    let omegaBps = 10000;

    if (useMetta) {
        const borrowRateRaw = await metta.query(`(BorrowRateBps 1)`);
        const omegaRaw = await metta.query(`(RecommendedOmegaBps "0xTOKEN")`);
        borrowRateBps = parseInt(borrowRateRaw) || 500;
        omegaBps = parseInt(omegaRaw) || 10000;
    } else {
        // Static Watcher multipliers (Skip Full AI)
        if (isFlashPump) {
            omegaBps = 1000; // Drastic LTV cut on pump (10%)
            borrowRateBps = 2000; // 20% interest spike
        } else if (spotPrice > twap * 1.1) {
            omegaBps = 8000; // 80% multiplier if spot is running hot
            borrowRateBps = 800; // 8% interest
        } else {
            omegaBps = 10000; // 100% normal
            borrowRateBps = 500; // 5% base rate
        }
    }

    console.log(`[ASI] Spot: $${spotPrice.toFixed(4)} | Rate: ${(borrowRateBps / 100).toFixed(2)}% | Omega: ${omegaBps} | Agents: ${nextAgents}`);

    // 6. Push to UI and Database
    try {
        if (process.env.ADMIN_API_KEY) {
            // Update Backend Simulation State
            const recOmega = omegaBps; // Use the queried omegaBps
            const volMapping = Math.floor((10000 - recOmega) / 50); // Map omega bps back to simulator "agents"
            await fetch("http://localhost:3000/api/simulation/update", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-key": process.env.ADMIN_API_KEY || "vestra-admin-secret"
                },
                body: JSON.stringify({
                    interestRateBps: borrowRateBps,
                    volatility: volMapping, // Changed to volMapping
                    twap: twap,
                    omega: omegaBps
                })
            }).catch(() => { }); // Silent fail if UI server is down
        }

        await logToSupabase('market_logs', {
            spot_price: spotPrice,
            twap: twap,
            agents: nextAgents,
            omega: omegaBps,
            chain: chainName
        });
    } catch (e) { }

    return { nextAgents, borrowRateBps, omegaBps, twap };
}

// ── MAIN EXPORT ─────────────────────────────────────────────────────────────
async function start(provider, wallet, useMetta = true) {
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    let chainName = `Chain_${chainId}`;
    if (chainId === 1) chainName = "Ethereum Mainnet";
    if (chainId === 8453) chainName = "Base";
    if (chainId === 84532) chainName = "Base Sepolia";
    if (chainId === 1337 || chainId === 31337) chainName = "Hardhat/Local";

    console.log(`\n[MeTTaclaw] ASI Chain Coprocessor Starting...`);
    console.log(`[MeTTaclaw] Session: ${sessionId}`);
    console.log(`[MeTTaclaw] Network: ${chainName}`);
    console.log(`[MeTTaclaw] Wallet: ${wallet.address}\n`);

    let activeAgents = 1000;
    let priceWindow = [];
    let spotPrice = 1.0;
    let epochId = 1;

    // Set static baseline atoms
    metta.setAtom("rank", `(CollateralRank "0xTOKEN" 1)`);
    metta.setAtom("liq", `(LiquidationRate "0xTOKEN" 0.02)`);

    // ── LOOP 1: Real-Time Risk & Market Chaos Engine
    setInterval(async () => {
        spotPrice = 1.0 + (Math.random() - 0.5) * 0.15;
        const result = await performRiskAnalysis(activeAgents, spotPrice, priceWindow, chainName, useMetta);
        activeAgents = result.nextAgents;
    }, 15000);

    // ── LOOP 2: On-Chain Event Watcher
    const vaultAddress = process.env.VAULT_CONTRACT_ADDRESS;
    if (vaultAddress && vaultAddress !== ethers.ZeroAddress) {
        const vaultABI = ["event LoanRequested(address indexed borrower, uint256 amount, address token)"];
        const vaultContract = new ethers.Contract(vaultAddress, vaultABI, provider);
        console.log(`[MeTTaclaw] 🛰️  Watching Smart Contract: ${vaultAddress}`);

        vaultContract.on("LoanRequested", async (borrower, amount, token) => {
            console.log(`\n[ON-CHAIN] 📝 New Loan Request: ${borrower} | Amount: ${ethers.formatUnits(amount, 18)}`);
            metta.setAtom("current_request", `(OpenLoan "req_${Date.now()}" "${borrower}" "${token}" ${amount} 0 4000)`);

            let verdict = "APPROVED (Static)";
            let score = 50;

            if (useMetta) {
                verdict = await metta.query(`(LoanVerdict "${borrower}" "${token}")`);
                score = await metta.query(`(LoanRiskScore "${borrower}" "${token}")`);
            } else {
                if (ethers.formatUnits(amount, 18) > 10000) score = 80;
                else score = 30;
                verdict = score > 60 ? "MANUAL_REVIEW_REQUIRED" : "APPROVED_STATIC";
            }

            console.log(`[MeTTaclaw] ⚖️  Verdict: ${verdict} | Risk Score: ${score}`);

            await logToSupabase('loan_requests', {
                borrower,
                amount: ethers.formatUnits(amount, 18),
                verdict,
                risk_score: parseInt(score) || 0,
                chain: chainName
            });
        });
    }

    // ── LOOP 3: Epoch Self-Improvement
    if (useMetta) {
        setInterval(async () => {
            console.log(`\n[🧬] INITIATING AI SELF-IMPROVEMENT LOOP (Epoch ${epochId})`);
            metta.setAtom("epoch_liq", `(EpochLiquidationRate ${epochId} 0.04)`);
            metta.setAtom("epoch_rev", `(EpochRevenueUSDC ${epochId} 12000)`);

            // 2. Continuous ingestion of events vs simulation
            // We simulate market volatility shifts to show MeTTa reagining
            const simVol = Math.floor(20 + Math.random() * 60); // 20-80 "risk units"
            const sentiment = Math.random() > 0.5 ? "BULLISH" : "BEARISH";

            console.log(`\n[MeTTaclaw] Ingesting: Market Volatility=${simVol}, Sentiment=${sentiment}`);
            await metta.addAtom(`(MarketVolatility ${simVol})`);
            await metta.addAtom(`(MarketSentiment "${sentiment}")`);

            const result = await metta.query(`(RunEpochAdaptation ${epochId})`);
            console.log(`[MeTTaclaw] 🧬 Learning Summary: ${result}\n`);

            const recOmega = await metta.query("(RecommendedOmegaBps 1)"); // This query was in the instruction, but its result is not used here.
            console.log(`[MeTTaclaw] MeTTa Reasoning Output: Recommended Omega = ${recOmega} bps`);


            await logToSupabase('epoch_stats', { epoch_id: epochId, result });
            epochId++;
        }, 300000);
    }
}

module.exports = {
    start,
    query: (expr) => metta.query(expr),
    inject: (key, atom) => metta.setAtom(key, atom)
};