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
        // MeTTa imports MUST NOT have the .metta extension
        const runnerContent = `
!(import! &self risk_brain)
!(import! &self self_improve)
!(import! &self current_state)

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

            const match = stdout.match(/\[(.*?)\]/);
            return (match && match[1]) ? match[1].trim() : stdout.trim();
        } catch (error) {
            console.error(`[MeTTa CLI Exec Error]: Ensure '${this.mettaBin}' is in your PATH or METTA_PATH is set.`);
            return null;
        }
    }
}

const metta = new TrueMeTTaBridge();

// ── SECTION 2: Risk Logic ───────────────────────────────────────────────────

async function performRiskAnalysis(activeAgents, spotPrice, priceWindow, chainName) {
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
    const borrowRateRaw = await metta.query(`(BorrowRateBps 1)`);
    const omegaRaw = await metta.query(`(RecommendedOmegaBps "0xTOKEN")`);

    const borrowRateBps = parseInt(borrowRateRaw) || 500;
    const omegaBps = parseInt(omegaRaw) || 10000;

    console.log(`[ASI] Spot: $${spotPrice.toFixed(4)} | Rate: ${(borrowRateBps / 100).toFixed(2)}% | Omega: ${omegaBps} | Agents: ${nextAgents}`);

    // 6. Push to UI and Database
    try {
        if (process.env.ADMIN_API_KEY) {
            await fetch("http://localhost:4000/api/simulation/update", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-key": process.env.ADMIN_API_KEY },
                body: JSON.stringify({
                    interestRateBps: borrowRateBps,
                    volatility: nextAgents,
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
async function start(provider, wallet) {
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
        const result = await performRiskAnalysis(activeAgents, spotPrice, priceWindow, chainName);
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

            const verdict = await metta.query(`(LoanVerdict "${borrower}" "${token}")`);
            const score = await metta.query(`(LoanRiskScore "${borrower}" "${token}")`);

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
    setInterval(async () => {
        console.log(`\n[🧬] INITIATING AI SELF-IMPROVEMENT LOOP (Epoch ${epochId})`);
        metta.setAtom("epoch_liq", `(EpochLiquidationRate ${epochId} 0.04)`);
        metta.setAtom("epoch_rev", `(EpochRevenueUSDC ${epochId} 12000)`);

        const result = await metta.query(`(RunEpochAdaptation ${epochId})`);
        console.log(`[MeTTaclaw] 🧬 Learning Summary: ${result}\n`);

        await logToSupabase('epoch_stats', { epoch_id: epochId, result });
        epochId++;
    }, 300000);
}

module.exports = { start, query: (expr) => metta.query(expr) };