// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/**
 * Omega Watcher
 * Autonomous Monitoring Agent for the Vestra Protocol.
 * Oversees loan health, triggers liquidations/adjustments, and maintains system integrity.
 */

const cron = require('node-cron');
const EventEmitter = require('events');
const winston = require('winston');
const meTTabrain = require('./meTTabrain');

// Configure Winston Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
      return `[Ω OMEGA] ${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.colorize({ all: true })
    }),
    new winston.transports.File({ filename: 'omega-watcher-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'omega-watcher-combined.log' })
  ]
});

class OmegaWatcher extends EventEmitter {
  constructor() {
    super();
    this.isActive = false;
    this.activeLoans = new Map(); // Store light state of loans {id: {principal, accrued, health, duration}}
    this.alerts = []; // Log of recent monitoring alerts
    this.MAX_ALERTS = 50;
    this.valuationContract = null;
  }

  /**
   * Set the ValuationEngine contract for on-chain enforcement
   */
  setContract(contract) {
    this.valuationContract = contract;
    logger.info('Omega Watcher: ValuationEngine contract bound.');
  }

  /**
   * Start the Omega Watcher monitoring loop
   */
  start() {
    if (this.isActive) return;
    this.isActive = true;
    logger.info('Omega Watcher Initialized. Sentinels online.');

    // Cron job running every 1 minute
    this.job = cron.schedule('* * * * *', () => {
      this._scanLoans();
    });

    // Listen for external indexing events
    this.on('loanCreated', (loanData) => this._cacheLoan(loanData));
    this.on('loanRepaid', (loanId) => this._removeLoan(loanId));
    this.on('pricePing', (tokenValue) => this._triggerVolatilityCheck(tokenValue));
    this.on('simulationUpdate', (state) => {
      logger.info(`Simulation State Sync: Volatility at ${state.volatility}%`);
      if (state.volatility > 40) {
        this._pushAlert('CRITICAL', 'Market Chaos Detected', { volatility: state.volatility });
      } else if (state.volatility > 20) {
        this._pushAlert('WARNING', 'Intermittent Volatility', { volatility: state.volatility });
      }
    });
  }

  stop() {
    if (this.job) this.job.stop();
    this.isActive = false;
    logger.info('Omega Watcher Deactivated.');
  }

  // Inject known state from Indexer
  _cacheLoan(loanData) {
    this.activeLoans.set(loanData.id, loanData);
    logger.info(`Loan Registered into Omega Grid: ${loanData.id}`, { principal: loanData.principal });
  }

  _removeLoan(loanId) {
    this.activeLoans.delete(loanId);
    logger.info(`Loan Cleared from Omega Grid: ${loanId}`);
  }

  // Routine scan across all cached loans to evaluate health factors
  _scanLoans() {
    logger.info(`Scanning ${this.activeLoans.size} active loans for health threshold breaches...`);
    
    for (const [loanId, loanData] of this.activeLoans.entries()) {
      // Recalculate Health
      const healthFactor = meTTabrain.evaluateLoanHealth({
        principal: loanData.principal,
        interestAccrued: loanData.interestAccrued || '0',
        collateralValueUsd: loanData.collateralValueUsd,
        durationDays: loanData.durationDays,
        elapsedDays: loanData.elapsedDays
      });

      // Update cached health
      loanData.healthFactor = healthFactor;

      // Detect breaches
      if (healthFactor <= 1.0) {
        const msg = `CRITICAL INCIDENT: Loan ${loanId} Health Factor breached threshold! HF: ${healthFactor.toFixed(4)}`;
        logger.warn(msg);
        this._pushAlert('CRITICAL', msg, { loanId, healthFactor });
        this.emit('liquidationTrigger', { loanId, healthFactor });
      } else if (healthFactor < 1.15) {
        const msg = `WARNING: Loan ${loanId} approaching liquidation zone. HF: ${healthFactor.toFixed(4)}`;
        logger.warn(msg);
        this._pushAlert('WARNING', msg, { loanId, healthFactor });
        this.emit('marginCallAlert', { loanId, healthFactor });
      }
    }
  }

  _pushAlert(level, message, data) {
    this.alerts.unshift({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      level,
      message,
      data
    });
    if (this.alerts.length > this.MAX_ALERTS) {
      this.alerts.pop();
    }
  }

  async _triggerVolatilityCheck(tokenValue, tokenAddress) {
      logger.info(`Volatility ping detected for ${tokenAddress || 'Unknown'}. Evaluating systemic impact... Asset Val: ${tokenValue}`);
      
      // If volatility is extreme (>50%), trigger an autonomous circuit breaker freeze
      if (parseFloat(tokenValue) > 5.0 && this.valuationContract && tokenAddress) {
          logger.warn(`EXTREME PRICE ANOMALY: Triggering autonomous circuit breaker for ${tokenAddress}`);
          try {
              const tx = await this.valuationContract.reportFlashPump(tokenAddress, 48 * 3600); // 48 hour freeze
              logger.info(`Circuit breaker transaction sent: ${tx.hash}`);
              this._pushAlert('CRITICAL', `AUTONOMOUS FREEZE: Flash pump detected on ${tokenAddress}`, { txHash: tx.hash });
          } catch (err) {
              logger.error(`Failed to trigger circuit breaker: ${err.message}`);
          }
      }
  }
}

module.exports = new OmegaWatcher();
