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
      const params = parsed.args.toObject ? parsed.args.toObject() : parsed.args;

      return {
        type: parsed.name,
        params,
        contract: name,
        address: log.address,
        txHash,
        logIndex,
        blockNumber,
        timestamp: block ? block.timestamp : Math.floor(Date.now() / 1000),
        ...IndexerService.flattenParams(parsed.name, params)
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Flat fields stored with every event (persistence.saveEvents): loanId, borrower,
   * amount, tokenAddress, plus a JSON-safe payload of all event args.
   * LoanRepaid/LoanLiquidated carry no borrower; consumers join on loanId.
   */
  static flattenParams(type, params) {
    const str = (v) => (v === undefined || v === null ? undefined : v.toString());
    const payload = Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])
    );
    const flat = { payload, loanId: str(params.loanId) };
    switch (type) {
      case 'LoanOpened':
        flat.borrower = params.borrower;
        flat.amount = str(params.principal);
        flat.tokenAddress = params.token;
        break;
      case 'LoanRepaid':
        flat.amount = str(params.principalPaid + params.interestPaid);
        break;
      case 'LiquidationStarted':
        flat.amount = str(params.debt);
        break;
      case 'LoanLiquidated':
        flat.amount = str(params.price);
        flat.defaulted = true;
        break;
      case 'SurplusClaimed':
        flat.borrower = params.borrower;
        flat.amount = str(params.amount);
        break;
      case 'Deposit':
      case 'Withdraw':
        // Lender events: no borrower, so they never count toward borrower history.
        flat.amount = str(params.assets);
        break;
      default:
        break;
    }
    return flat;
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
      await this.syncEvent(event);
    } catch (err) {
      console.error(`[IndexerService] Error syncing event to DB:`, err.message);
    }
  }

  async syncEvent(event) {
    const p = event.params;
    if (event.contract === 'pool') {
      // ERC-4626 Deposit(sender, owner, assets, shares). Positions are share balances
      // read on-chain, so withdrawals need no per-position bookkeeping.
      if (event.type === 'Deposit') {
        await this.persistence.syncDepositFromEvent({
          walletAddress: p.owner,
          depositId: `${event.txHash}:${event.logIndex}`,
          assets: p.assets.toString(),
          timestamp: event.timestamp
        });
      }
      return;
    }

    if (event.contract !== 'loanManager') return;

    switch (event.type) {
      case 'LoanOpened': {
        const loan = await this.contracts.loanManager.getLoan(p.loanId);
        const { chainId } = await this.provider.getNetwork();
        await this.persistence.syncLoanFromEvent({
          loanId: p.loanId.toString(),
          borrower: p.borrower,
          amount: p.principal.toString(),
          quantity: loan.quantity.toString(),
          ltvBps: p.pv > 0n ? Number((p.principal * 10000n) / p.pv) : 0,
          dpvAtOpen: p.pv.toString(),
          collateralToken: p.token,
          streamId: loan.streamId.toString(),
          unlockTime: Number(loan.unlockTime),
          txHash: event.txHash,
          blockNumber: event.blockNumber,
          chainId: Number(chainId)
        });
        break;
      }
      case 'LoanRepaid':
        // Partial repayments leave the loan active; only a closing repayment changes status.
        if (p.closed) {
          await this.persistence.updateLoanStatus(p.loanId.toString(), 'repaid', p.interestPaid.toString());
        }
        break;
      case 'LiquidationStarted':
        await this.persistence.updateLoanStatus(p.loanId.toString(), 'auction');
        break;
      case 'LoanLiquidated':
        await this.persistence.updateLoanStatus(p.loanId.toString(), 'liquidated');
        break;
      default:
        break;
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
