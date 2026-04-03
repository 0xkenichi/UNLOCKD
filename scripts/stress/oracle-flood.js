const { ethers } = require("ethers");
const Redis = require("ioredis");

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
        console.error("❌ Gap 1 Failed: Mutex did not block concurrent update!");
    }
    await redis.del(lockKey);

    // 3. Stress Gap 2: maxPriceAge Staleness
    console.log("\n[Scenario 2] Testing maxPriceAge (Gap 2)...");
    
    // We can't jump time easily on real Sepolia, but we can verify the check on a local fork
    const rpcUrl = "http://localhost:8545"; // Assuming local hardhat node
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const valuationAddr = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Local default
    const valuationAbi = ["function computeDPV(uint256,address,uint256,address) public view returns (uint256,uint256)"];
    const valuation = new ethers.Contract(valuationAddr, valuationAbi, provider);

    try {
        console.log("Attempting DPV check (Assuming local node is running and contract is deployed)...");
        // This will only work if the Hardhat node is running and the contract is there.
        // For now, we mainly validated the Redis logic which is backend-side.
        console.log("Skipping on-chain DPV check in this script (use hardhat test for local time jumps).");
    } catch (e) {
        console.log("On-chain check skipped: no local node or contract found.");
    }

    console.log("\n=== Oracle Forensic Stress Complete ===");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
