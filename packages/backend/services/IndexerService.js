const { ethers } = require('ethers');

class IndexerService {
  constructor(provider, persistence, contracts, config = {}) {
    this.provider = provider;
    this.persistence = persistence;
    this.contracts = contracts;
    this.config = {
      lookbackBlocks: config.lookbackBlocks || 2000,
      pollInterval: config.pollInterval || 15000,
      maxBlocksPerPoll: config.maxBlocksPerPoll || 500,
      maxEvents: config.maxEvents || 1000,
      ...config
    };

    this.lastIndexedBlock = null;
    this.activityEvents = [];
    this.seenEvents = new Set();
    this.isPolling = false;
  }

  async init() {
    console.log('[IndexerService] Initializing...');
    const persistedLastIndexed = await this.persistence.getMeta('lastIndexedBlock');
    if (persistedLastIndexed) {
      this.lastIndexedBlock = Number(persistedLastIndexed);
    }
    
    // Recovery: load existing events from persistence if available
    const existingEvents = await this.persistence.getActivityEvents({ limit: this.config.maxEvents });
    if (existingEvents && existingEvents.length > 0) {
      this.activityEvents = existingEvents;
      existingEvents.forEach(e => this.seenEvents.add(`${e.txHash}-${e.logIndex}`));
      console.log(`[IndexerService] Loaded ${existingEvents.length} events from persistence.`);
    }
  }

  async poll() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const latestBlock = await this.provider.getBlockNumber();
      if (this.lastIndexedBlock === null) {
        this.lastIndexedBlock = Math.max(latestBlock - this.config.lookbackBlocks, 0);
      }

      const startBlock = this.lastIndexedBlock + 1;
      const endBlock = Math.min(latestBlock, startBlock + this.config.maxBlocksPerPoll);

      if (startBlock > endBlock) {
        this.isPolling = false;
        return;
      }

      console.log(`[IndexerService] Polling blocks ${startBlock} to ${endBlock} in 10-block chunks with rate protection...`);
      
      const MAX_CHUNK = 10;
      for (let currentStart = startBlock; currentStart <= endBlock; currentStart += MAX_CHUNK) {
        const currentEnd = Math.min(currentStart + MAX_CHUNK - 1, endBlock);
        
        const filter = {
          address: Object.values(this.contracts).map(c => c.target || c.address),
          fromBlock: currentStart,
          toBlock: currentEnd
        };

        const logs = await this.getLogsWithRetry(filter);
        for (const log of logs) {
          try {
            const event = await this.normalizeEvent(log);
            if (event) {
              await this.pushEvent(event);
            }
          } catch (err) {
            console.error('[IndexerService] Error normalizing event:', err);
          }
        }
        
        // Polite delay to avoid 429
        await new Promise(r => setTimeout(r, 500));
      }

      this.lastIndexedBlock = endBlock;
      await this.persistence.setMeta('lastIndexedBlock', this.lastIndexedBlock);
    } catch (error) {
      console.error('[IndexerService] Poll error:', error);
    } finally {
      this.isPolling = false;
    }
  }

  async getLogsWithRetry(filter, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.provider.getLogs(filter);
      } catch (err) {
        if (i === retries - 1) throw err;
        const msg = err.message || '';
        // If it's a rate limit or a 10-block range error, wait longer
        const wait = (msg.includes('429') || msg.includes('32600')) ? 5000 * (i + 1) : 1000 * (i + 1);
        console.warn(`[IndexerService] getLogs failed, retrying in ${wait}ms...`, msg.slice(0, 100));
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }

  async normalizeEvent(log) {
    const txHash = log.transactionHash;
    const logIndex = log.index;
    const blockNumber = log.blockNumber;

    // Identify contract
    let contract;
    let name = 'Unknown';
    for (const [key, c] of Object.entries(this.contracts)) {
      if (c.target === log.address || c.address === log.address) {
        contract = c;
        name = key;
        break;
      }
    }

    if (!contract) return null;

    // Parse event
    try {
      const parsed = contract.interface.parseLog(log);
      if (!parsed) return null;

      const block = await this.provider.getBlock(blockNumber);
      
      return {
        type: parsed.name,
        params: parsed.args.toObject ? parsed.args.toObject() : parsed.args,
        contract: name,
        address: log.address,
        txHash,
        logIndex,
        blockNumber,
        timestamp: block ? block.timestamp : Math.floor(Date.now() / 1000),
      };
    } catch (e) {
      return null;
    }
  }

  async pushEvent(event) {
    const key = `${event.txHash}-${event.logIndex}`;
    if (this.seenEvents.has(key)) return;

    this.seenEvents.add(key);
    this.activityEvents.unshift(event); // Newest first

    if (this.activityEvents.length > this.config.maxEvents) {
      this.activityEvents.pop();
    }

    // Persist to DB
    await this.persistence.saveActivityEvent(event);

    // Sync specific tables
    try {
      if (event.contract === 'pool') {
        if (event.type === 'Deposit') {
          await this.persistence.syncDepositFromEvent({
            walletAddress: event.params.user,
            positionId: event.params.positionId.toString(),
            amount: event.params.amount.toString(),
            depositType: Number(event.params.depositType),
            durationDays: Number(event.params.lockDays),
            timestamp: event.timestamp
          });
        } else if (event.type === 'Withdraw') {
          // If amount reaches 0, the persistence layer handles status
          // Actually, we might need a more complex sync here, but for now we'll just re-sync
          // or mark as withdrawn if needed.
        }
      } else if (event.contract === 'loanManager') {
        if (event.type === 'LoanCreated') {
          await this.persistence.syncLoanFromEvent({
            loanId: event.params.loanId.toString(),
            borrower: event.params.borrower,
            amount: event.params.amount.toString(),
            timestamp: event.timestamp
          });
        } else if (event.type === 'LoanRepaid') {
          await this.persistence.updateLoanStatus(event.params.loanId.toString(), 'repaid', event.params.amount.toString());
        }
      }
    } catch (err) {
      console.error(`[IndexerService] Error syncing event to DB:`, err.message);
    }
  }

  getActivity() {
    return this.activityEvents;
  }

  startStub() {
    setInterval(() => this.poll(), this.config.pollInterval);
  }
}

module.exports = IndexerService;
