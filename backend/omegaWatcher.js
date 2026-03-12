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
        logger.warn(`CRITICAL INCIDENT: Loan ${loanId} Health Factor breached threshold! HF: ${healthFactor.toFixed(4)}`);
        this.emit('liquidationTrigger', { loanId, healthFactor });
      } else if (healthFactor < 1.15) {
        logger.warn(`WARNING: Loan ${loanId} approaching liquidation zone. HF: ${healthFactor.toFixed(4)}`);
        this.emit('marginCallAlert', { loanId, healthFactor });
      }
    }
  }

  _triggerVolatilityCheck(tokenValue) {
      logger.info(`Volatility ping detected. Evaluating systemic impact... Asset Val: ${tokenValue}`);
      // Typically, Omega would instruct MeTTabrain to re-calculate base APRs across specific pools here.
  }
}

module.exports = new OmegaWatcher();
