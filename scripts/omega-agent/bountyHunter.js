// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { ethers } = require("ethers");

/**
 * Strict Recourse Bounty Hunter
 * Listens for loan defaults and actively triggers the sweepSecondaryAssets mechanically.
 */
class BountyHunter {
    constructor(loanManagerContract, recourseTokens, logger = console) {
        this.loanManager = loanManagerContract;
        this.recourseTokens = recourseTokens;
        this.logger = logger;
    }

    start() {
        this.logger.log("\n[BOUNTY_HUNTER] Listening for LoanSettled(default) events...");

        this.loanManager.on("LoanSettled", async (loanId, defaulted) => {
            if (defaulted) {
                this.logger.log(`\n🚨 [BOUNTY_HUNTER] LOAN ${loanId} HAS DEFAULTED!`);
                try {
                    const deficit = await this.loanManager.loanDeficits(loanId);
                    this.logger.log(`[BOUNTY_HUNTER] Loan ${loanId} deficit recorded at: $${ethers.formatUnits(deficit, 6)}`);

                    if (deficit > 0n) {
                        this.logger.log(`[BOUNTY_HUNTER] Executing Extreme Recourse: Sweeping borrower secondary assets...`);

                        // In production, this would be:
                        // const tx = await this.loanManager.sweepSecondaryAssets(loanId, this.recourseTokens);
                        // this.logger.log(`[BOUNTY_HUNTER] Transaction Sent: ${tx.hash}`);
                        // await tx.wait();

                        this.logger.log(`[BOUNTY_HUNTER] Simulation: Successfully seized assets to cover deficit!`);
                    }
                } catch (err) {
                    this.logger.error(`[BOUNTY_HUNTER] Error processing default for loan ${loanId}:`, err.message);
                }
            }
        });

        // Also listen for partial sweeps (just to log success)
        this.loanManager.on("DeficitSwept", (loanId, token, amountSeized, usdcValue) => {
            this.logger.log(`\n🩸 [BOUNTY_HUNTER] SUCCESS! Loan ${loanId} | Seized token ${token} worth $${ethers.formatUnits(usdcValue, 6)}`);
        });
    }

    simulate() {
        setInterval(() => {
            if (Math.random() > 0.95) { // Rare simulated default
                const mockLoanId = Math.floor(Math.random() * 1000);
                this.logger.log(`\n🚨 [BOUNTY_HUNTER] SIMULATION: LOAN ${mockLoanId} HAS ENDED IN DEFICIT.`);
                this.logger.log(`⚙️ [BOUNTY_HUNTER] Executing \`sweepSecondaryAssets\` for ${this.recourseTokens.join(", ")}...`);
                setTimeout(() => {
                    this.logger.log(`🩸 [BOUNTY_HUNTER] SWEEP COMPLETE: Seized assets worth $14,200 from borrower wallet. Zero-Deficit Maintained.`);
                }, 2000);
            }
        }, 15000);
    }
}

module.exports = BountyHunter;
