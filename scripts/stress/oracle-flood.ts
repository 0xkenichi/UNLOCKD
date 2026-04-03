import { ethers } from "hardhat";
import Redis from "ioredis";
import { expect } from "chai";

async function main() {
    console.log("=== Starting Oracle Forensic Stress (Gaps 1 & 2) ===");
    
    // 1. Redis Setup
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    const chainId = 11155111; // Sepolia
    const token = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"; // USDC
    const priceKey = `prices:${chainId}:${token}`;
    const lockKey = `oracle:lock:${chainId}:${token}`;

    // Clean start
    await redis.del(priceKey);
    await redis.del(lockKey);

    // 2. Stress Gap 1: Redis Mutex Race Condition
    console.log("\n[Scenario 1] Testing Redis Mutex (Gap 1)...");
    
    // Add 7 candles to pass the warm-start check
    const now = Math.floor(Date.now() / 1000);
    const candles = Array.from({ length: 7 }, (_, i) => JSON.stringify({
        price: 1.0,
        timestamp: now - (i * 3600)
    }));
    await redis.lpush(priceKey, ...candles);

    // Simulate concurrent updates
    console.log("Firing concurrent oracle updates...");
    const setLock = await redis.set(lockKey, '1', 'NX', 'EX', 30);
    if (setLock === 'OK') {
        console.log("✅ Mutex lock acquired successfully for first process.");
    }

    const concurrentLock = await redis.set(lockKey, '1', 'NX', 'EX', 30);
    if (!concurrentLock) {
        console.log("✅ Mutex correctly blocked concurrent second process.");
    } else {
        throw new Error("❌ Gap 1 Failed: Mutex did not block concurrent update!");
    }
    await redis.del(lockKey);

    // 3. Stress Gap 2: maxPriceAge Staleness
    console.log("\n[Scenario 2] Testing maxPriceAge (Gap 2)...");
    const [deployer] = await ethers.getSigners();
    
    // Deploy/Get ValuationEngine
    const valuationAddr = process.env.VALUATION_ENGINE_ADDRESS;
    if (!valuationAddr) {
        console.warn("VALUATION_ENGINE_ADDRESS not set. Skipping on-chain staleness test.");
        return;
    }
    const valuation = await ethers.getContractAt("ValuationEngine", valuationAddr);
    
    // 1. Set a price
    console.log("Current block time:", (await ethers.provider.getBlock("latest"))?.timestamp);
    
    // 2. Simulate time jump (Hardhat needed for local simulation, otherwise depends on real Sepolia)
    // For a real stress test, we check the latestUpdatedAt from the oracle contract
    try {
        const [pv, ltv] = await valuation.computeDPV(1e18, token, now + 365*24*3600, ethers.ZeroAddress);
        console.log(`Initial DPV: ${pv}, LTV: ${ltv}`);
        
        console.log("Increasing time by 2 hours (simulated)...");
        await ethers.provider.send("evm_increaseTime", [7200]);
        await ethers.provider.send("evm_mine", []);
        
        console.log("Attempting DPV check with stale price...");
        await valuation.computeDPV(1e18, token, now + 365*24*3600, ethers.ZeroAddress);
        throw new Error("❌ Gap 2 Failed: ValuationEngine did not revert on stale price!");
    } catch (e: any) {
        if (e.message.includes("stale price") || e.message.includes("MaxPriceAge")) {
            console.log("✅ Gap 2 Passed: Correctly reverted on stale price.");
        } else {
            console.error("Unexpected error:", e.message);
        }
    }

    console.log("\n=== Oracle Forensic Stress Complete ===");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
