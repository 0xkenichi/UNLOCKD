const meTTabrain = require('../meTTabrain');
const omegaWatcher = require('../omegaWatcher');

class OmegaService {
  constructor(config = {}) {
    this.simulationState = {
      volatility: config.defaultVolatility || 5,
      interestRateBps: config.defaultInterestRateBps || 800,
      chaosFactor: 0,
      lastUpdate: Date.now()
    };
    
    this.omegaWatcher = omegaWatcher;
    this.meTTabrain = meTTabrain;
  }

  async init(valuationContract) {
    console.log('[OmegaService] Initializing...');
    if (valuationContract) {
      this.omegaWatcher.setContract(valuationContract);
    }
    this.omegaWatcher.start();
  }

  updateSimulation(volatility, interestRateBps) {
    if (volatility !== undefined) this.simulationState.volatility = Number(volatility);
    if (interestRateBps !== undefined) this.simulationState.interestRateBps = Number(interestRateBps);
    this.simulationState.lastUpdate = Date.now();
    
    this.omegaWatcher.emit('simulationUpdate', this.simulationState);
    return this.simulationState;
  }

  getSimulationState() {
    return this.simulationState;
  }

  getOmegaHealth() {
    return {
      simulation: this.simulationState,
      alerts: this.omegaWatcher.alerts || [],
      activeLoans: this.omegaWatcher.activeLoans?.size || 0
    };
  }

  evaluateLoanHealth(loanId, loanData) {
    // If specific loan data not provided, try to get from watcher
    const data = loanData || this.omegaWatcher.activeLoans.get(loanId);
    if (!data) return null;

    return this.meTTabrain.evaluateLoanHealth({
      ...data,
      volatilityIndex: this.simulationState.volatility / 100
    });
  }

  calculateDynamicAPR(baseBps, token) {
    if (this.simulationState.volatility > 10) {
      return this.meTTabrain.calculateDynamicAPR({
        baseBps,
        tokenAddress: token,
        volatilityIndex: Math.min(1.0, this.simulationState.volatility / 100)
      });
    }
    return baseBps;
  }

  emitLoanCreated(loanId, details) {
    this.omegaWatcher.emit('loanCreated', { id: loanId, ...details });
  }
}

module.exports = OmegaService;
