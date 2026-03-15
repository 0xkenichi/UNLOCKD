import axios from 'axios';

// Multi-oracle price consensus implementation
export const getConsensusPrice = async (token: string) => {
  const prices = await Promise.allSettled([
    getRedstonePrice(token),
    getPythPrice(token),
    getChainlinkPrice(token)
  ]);

  const validPrices = prices
    .filter((p): p is PromiseFulfilledResult<number> => p.status === 'fulfilled')
    .map(p => p.value);

  if (validPrices.length === 0) throw new Error("No oracle data available");

  return median(validPrices);
};

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  const half = Math.floor(values.length / 2);
  if (values.length % 2) return values[half];
  return (values[half - 1] + values[half]) / 2.0;
};

// Mock functions for oracles (to be expanded with actual SDKs/APIs)
async function getRedstonePrice(token: string): Promise<number> {
  // Redstone integration logic
  return 2500.50; 
}

async function getPythPrice(token: string): Promise<number> {
  // Pyth integration logic
  return 2501.20;
}

async function getChainlinkPrice(token: string): Promise<number> {
  // Chainlink integration logic
  return 2499.80;
}
