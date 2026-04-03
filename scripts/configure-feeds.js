const { ethers } = require("hardhat");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`[Config] Setting up price feeds with: ${deployer.address}`);

  const VALUATION_ENGINE = process.env.NEXT_VALUATIONENGINE_ADDRESS;
  if (!VALUATION_ENGINE) {
    console.error("Missing NEXT_VALUATIONENGINE_ADDRESS in .env");
    return;
  }

  const engine = await ethers.getContractAt("ValuationEngine", VALUATION_ENGINE);

  const ASSETS = [
    { 
      symbol: 'ETH',  
      address: '0x0000000000000000000000000000000000000000', // Native/Placeholder
      feed: '0x694AA1769357215DE4FAC081bf1f309aDC325306' // Sepolia ETH/USD
    },
    { 
      symbol: 'WBTC', 
      address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', 
      feed: '0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43' // Sepolia BTC/USD
    }
  ];

  for (const asset of ASSETS) {
    console.log(`-> Setting feed for ${asset.symbol} (${asset.address})...`);
    try {
      const tx = await engine.setTokenPriceFeed(asset.address, asset.feed);
      await tx.wait();
      console.log(`✅ Success: ${tx.hash}`);
    } catch (err) {
      console.error(`❌ Failed: ${err.message}`);
    }
  }

  console.log("[Config] Feeds synchronized.");
}

main().catch(console.error);
