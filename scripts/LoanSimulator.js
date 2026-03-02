const { ethers } = require("ethers");

/**
 * Off-chain ValuationEngine Simulator for Vestra Protocol
 * Exact mirror of ValuationEngine.sol math.
 * Useful for frontend UIs, dashboards, and internal risk monitoring.
 */
class LoanCalculator {
    constructor(riskFreeRates = { 1: 2, 2: 5, 3: 10 }, baseLTVs = { 1: 5000, 2: 3500, 3: 2000 }) {
        this.BPS_DENOMINATOR = 10000;
        this.riskFreeRates = riskFreeRates;
        this.baseLTVs = baseLTVs;
        this.baseVolatility = 50; // default 50%
        this.drawdownPenaltyPerBps = 50;
        this.maxDrawdownPenaltyBps = 2000;
        this.rangeVolWeightBps = 10;
    }

    /**
     * Calculates the exact Discounted Present Value (DPV) and Loan-To-Value (LTV)
     * purely off-chain, mirroring ABDKMath64x64 operations.
     * 
     * @param {number} quantity Token amount (human readable, e.g. 1000)
     * @param {number} price Current Oracle Price (human readable, e.g. 1.50)
     * @param {number} rank Registry Rank (1, 2, or 3)
     * @param {number} yearsToUnlock Exact fractional years until unlockTime
     * @param {object} bounds { ath: 0, atl: 0 } bounds in standard units
     * @returns {object} { pv, ltvBps, effectiveLtvPercent, maxBorrowable }
     */
    computeDPV(quantity, price, rank, yearsToUnlock, bounds = { ath: 0, atl: 0 }) {
        if (![1, 2, 3].includes(rank)) throw new Error("Invalid rank. Must be 1, 2, or 3.");

        const baseValue = quantity * price;

        const rankBaseLtv = this.baseLTVs[rank];
        const rankRiskFreeRate = this.riskFreeRates[rank]; // 2, 5, or 10

        // Time discount: exp(-rate * years)
        const rate = rankRiskFreeRate / 100;
        const discount = Math.exp(-(rate * yearsToUnlock));

        let effectiveVol = this.baseVolatility;
        let extraDiscountBps = 0;

        if (bounds.ath > 0 && bounds.atl > 0 && bounds.ath >= bounds.atl) {
            if (price <= bounds.ath) {
                const drawdownBps = ((bounds.ath - price) * this.BPS_DENOMINATOR) / bounds.ath;
                let penalty = (drawdownBps * this.drawdownPenaltyPerBps) / this.BPS_DENOMINATOR;
                if (penalty > this.maxDrawdownPenaltyBps) penalty = this.maxDrawdownPenaltyBps;
                extraDiscountBps = penalty;
            }

            const mid = bounds.ath + bounds.atl;
            if (mid > 0) {
                const rangeRatioBps = ((bounds.ath - bounds.atl) * this.BPS_DENOMINATOR) / mid;
                const volAdd = (rangeRatioBps * this.rangeVolWeightBps) / this.BPS_DENOMINATOR;
                effectiveVol = this.baseVolatility + (volAdd / 100);
                if (effectiveVol > 100) effectiveVol = 100;
            }
        }

        // Monte Carlo-inspired conservatism
        const liquidity = 0.9;
        const shock = 0.95;
        const volPenalty = effectiveVol / 200; // 0.5 * vol
        let volAdj = 1 - volPenalty;
        if (volAdj < 0) volAdj = 0;

        let pv = baseValue * discount * liquidity * shock * volAdj;
        if (extraDiscountBps > 0) {
            pv = pv * ((this.BPS_DENOMINATOR - extraDiscountBps) / this.BPS_DENOMINATOR);
        }

        let ltvBps = rankBaseLtv * liquidity * shock * volAdj;
        if (extraDiscountBps > 0) {
            ltvBps = ltvBps * ((this.BPS_DENOMINATOR - extraDiscountBps) / this.BPS_DENOMINATOR);
        }

        if (ltvBps > this.BPS_DENOMINATOR) ltvBps = this.BPS_DENOMINATOR;

        return {
            pv: pv,
            ltvBps: ltvBps,
            effectiveLtvPercent: (ltvBps / 100).toFixed(2) + "%",
            maxBorrowable: pv * (ltvBps / this.BPS_DENOMINATOR)
        };
    }

    // Example terminal output generator
    printSimulatedLoan(quantity, price, rank, daysToUnlock, ath, atl) {
        const years = daysToUnlock / 365;
        const bounds = { ath: ath || 0, atl: atl || 0 };
        const res = this.computeDPV(quantity, price, rank, years, bounds);

        console.log("-----------------------------------------");
        console.log(`Loan Simulation Output (Rank ${rank})`);
        console.log("-----------------------------------------");
        console.log(`Collateral Quantity : ${quantity}`);
        console.log(`Token Price         : $${price.toFixed(2)}`);
        console.log(`Base Market Value   : $${(quantity * price).toFixed(2)}`);
        console.log(`Time to Unlock      : ${daysToUnlock} Days (${years.toFixed(2)} Years)`);
        if (ath) console.log(`ATH / ATL           : $${ath} / $${atl}`);
        console.log(`--- Valuation Engine Result ---`);
        console.log(`Discounted PV       : $${res.pv.toFixed(2)}`);
        console.log(`Effective LTV       : ${res.effectiveLtvPercent}`);
        console.log(`Max Available Loan  : $${res.maxBorrowable.toFixed(2)} USDC`);
        console.log("-----------------------------------------\n");
    }
}

module.exports = LoanCalculator;

// Quick CLI Execution if run directly
if (require.main === module) {
    const calc = new LoanCalculator();
    console.log("=== Vestra Valuation Engine Security CLI ===\n");

    // Scenario 1: Stable Premium Token (Rank 1)
    calc.printSimulatedLoan(100000, 1.0, 1, 365, 1.2, 0.8);

    // Scenario 2: Highly Volatile Standard Token (Rank 3) down 50% from ATH
    calc.printSimulatedLoan(100000, 1.0, 3, 365, 2.0, 0.5);

    // Scenario 3: Flagship with massive time lock (4 years)
    calc.printSimulatedLoan(100000, 1.0, 1, 1460, 1.2, 0.8);
}
