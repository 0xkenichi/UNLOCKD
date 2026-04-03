const { fetchSablierStreams } = require('../evm/sablier');
const { fetchHedgeyPlans } = require('../evm/hedgey');
const { fetchSuperfluidStreams } = require('../evm/superfluid');
const { fetchLlamaPayStreams } = require('../evm/llamapay');
const { fetchStreamflowVestingContracts } = require('../solana/streamflow');
const MarketDataService = require('./MarketDataService');

/**
 * VestingOracleService
 * Multi-chain service to discover and validate vesting contracts across all major protocols.
 */
class VestingOracleService {
  constructor() {
    this.protocols = {
      evm: ['Sablier', 'Superfluid', 'Hedgey', 'LlamaPay'],
      solana: ['Streamflow', 'Zebec']
    };
  }

  /**
   * Fetch user vestings from EVM and Solana
   */
  async fetchData(wallet, chain = 'all', clients = {}) {
    const results = [];
    const tasks = [];

    if (chain === 'evm' || chain === 'all') {
      tasks.push(this.fetchEvm(wallet, clients));
    }
    
    if (chain === 'solana' || chain === 'all') {
      tasks.push(this.fetchSolana(wallet));
    }
    
    const responses = await Promise.allSettled(tasks);
    responses.forEach(res => {
      if (res.status === 'fulfilled') results.push(...res.value);
    });

    // Enforce USD valuation for all streams
    return await this.enrichWithPrices(results);
  }

  async fetchEvm(wallet, clients = {}) {
    const chains = [1, 137, 42161, 10, 8453]; // Mainnet, Polygon, Arbitrum, Optimism, Base
    const results = [];
    const tasks = [];

    for (const chainId of chains) {
      const client = clients[chainId] || null;
      
      tasks.push(fetchSablierStreams([wallet], chainId));
      tasks.push(fetchHedgeyPlans(wallet, chainId));
      tasks.push(fetchSuperfluidStreams([wallet], client));
      tasks.push(fetchLlamaPayStreams(wallet, chainId));
    }

    const responses = await Promise.allSettled(tasks);
    responses.forEach(res => {
      if (res.status === 'fulfilled' && res.value) results.push(...res.value);
    });

    return results;
  }

  async fetchSolana(wallet) {
    if (wallet.startsWith('0x')) return [];
    try {
      return await fetchStreamflowVestingContracts([wallet]);
    } catch (err) {
      console.warn('[VestingOracle] Solana fetch failed:', err.message);
      return [];
    }
  }

  async enrichWithPrices(streams) {
    const enriched = [];
    for (const stream of streams) {
      try {
        const symbol = stream.tokenSymbol || 'USDC';
        const price = await MarketDataService.getPrice(symbol);
        
        const decimals = stream.tokenDecimals || 18;
        const amountLocked = parseFloat(stream.quantity || '0') / (10 ** decimals);
        const valueUsd = amountLocked * price;

        let monthlyInflowUsd = 0;
        if (stream.ratePerSecond) {
            const rate = parseFloat(stream.ratePerSecond) / (10 ** decimals);
            monthlyInflowUsd = rate * 86400 * 30 * price;
        } else if (stream.ratePerMonth) {
            const rate = parseFloat(stream.ratePerMonth) / (10 ** decimals);
            monthlyInflowUsd = rate * price;
        }

        enriched.push({
          ...stream,
          valueUsd,
          monthlyInflowUsd,
          price
        });
      } catch (err) {
        enriched.push({ ...stream, valueUsd: 0, monthlyInflowUsd: 0 });
      }
    }
    return enriched;
  }

  async fetchUserVestings(wallet, chain = 'all', clients = {}) {
    return this.fetchData(wallet, chain, clients);
  }
}

module.exports = new VestingOracleService();
