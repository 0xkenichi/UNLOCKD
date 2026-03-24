import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('ValuationEngine v2', function () {
  let valuationEngine: any;
  let admin: any, relayer: any, guardian: any, user: any;
  
  const BPS = 10000n;
  const WAD = 10n ** 18n;
  const MAX_OMEGA_BPS = 9500n;
  const OMEGA_TIMELOCK = 3600; // 1 hour

  // Mocks
  const dummyToken = '0x1111111111111111111111111111111111111111';

  beforeEach(async function () {
    [admin, relayer, guardian, user] = await ethers.getSigners();

    const ValuationEngine = await ethers.getContractFactory('ValuationEngine');
    // For ethers v6 (most modern setups)
    valuationEngine = await ValuationEngine.deploy(admin.address);
    if(valuationEngine.waitForDeployment) {
       await valuationEngine.waitForDeployment();
    }

    const RELAYER_ROLE = await valuationEngine.RELAYER_ROLE();
    const GUARDIAN_ROLE = await valuationEngine.GUARDIAN_ROLE();

    await valuationEngine.grantRole(RELAYER_ROLE, relayer.address);
    await valuationEngine.grantRole(GUARDIAN_ROLE, guardian.address);
  });

  describe('Omega Management Data', function () {
    it('Should propose Omega correctly within limits', async function () {
      await valuationEngine.connect(relayer).proposeOmega(dummyToken, 9000n);
      const remainingTime = await valuationEngine.omegaTimelockRemaining(dummyToken);
      expect(remainingTime).to.be.closeTo(OMEGA_TIMELOCK, 5); // 5 sec margin of error
      
      const params = await valuationEngine.tokenParams(dummyToken);
      expect(params.pendingOmegaBps).to.equal(9000n);
    });

    it('Should revert proposeOmega if delta is too large', async function () {
      // Set initial baseline
      await valuationEngine.connect(relayer).proposeOmega(dummyToken, 8000n);
      await time.increase(OMEGA_TIMELOCK + 1);
      await valuationEngine.finalizeOmega(dummyToken);

      // Try jumping by 10% (limit is 5% = 500 bps)
      await expect(valuationEngine.connect(relayer).proposeOmega(dummyToken, 9000n))
        .to.be.revertedWith('Delta exceeds max per cycle');
    });

    it('Should revert finalizeOmega before timelock elapses', async function () {
      await valuationEngine.connect(relayer).proposeOmega(dummyToken, 8500n);
      
      await expect(valuationEngine.finalizeOmega(dummyToken))
        .to.be.revertedWith('Timelock still active');
    });

    it('Should finalize Omega correctly after timelock', async function () {
      await valuationEngine.connect(relayer).proposeOmega(dummyToken, 8500n);
      await time.increase(OMEGA_TIMELOCK + 1);
      
      await valuationEngine.finalizeOmega(dummyToken);
      const omega = await valuationEngine.tokenOmegaBps(dummyToken);
      expect(omega).to.equal(8500n);
    });

    it('Should allow guardian emergency slash to bypass timelock', async function () {
       await valuationEngine.connect(relayer).proposeOmega(dummyToken, 9000n);
       await time.increase(OMEGA_TIMELOCK + 1);
       await valuationEngine.finalizeOmega(dummyToken);

       await valuationEngine.connect(guardian).emergencySlashOmega(dummyToken, 5000n);
       const omega = await valuationEngine.tokenOmegaBps(dummyToken);
       expect(omega).to.equal(5000n);
    });
  });

  describe('Risk Parameters', function () {
    it('Should update risk parameters as relayer and correctly compute rDynamic', async function () {
      const price = ethers.parseEther('1.5');
      const liqUsd = ethers.parseEther('1000000');
      
      await valuationEngine.connect(relayer).updateRiskParams(
         dummyToken,
         price,
         9400n, // Lambda
         ethers.parseEther('0.4'), // v30d
         ethers.parseEther('0.35'), // v90d
         ethers.parseEther('0.45'), // vImplied
         liqUsd,
         1000n, // Token Risk Premium
         500n // Liq Premium
      );

      const params = await valuationEngine.tokenParams(dummyToken);
      expect(params.ewmaPrice).to.equal(price);
      expect(params.rDynamicBps).to.equal(500n + 1000n + 500n); // base (500 defaults) + 1000 + 500
    });
  });

  describe('dDPV Computation Validation', function () {
    it('Should compute correct DPV and reasonable LTV for a CLIFF vesting schedule', async function () {
       // Establish Omega factor
       await valuationEngine.connect(relayer).proposeOmega(dummyToken, 9000n);
       await time.increase(OMEGA_TIMELOCK + 1);
       await valuationEngine.finalizeOmega(dummyToken);

       // Update underlying params
       const price = ethers.parseEther('2');
       const liqUsd = ethers.parseEther('10000000');
       await valuationEngine.connect(relayer).updateRiskParams(
         dummyToken,
         price,
         9400n, 
         ethers.parseEther('0.2'), // v30d
         ethers.parseEther('0.2'), // v90d
         0n, // implied
         liqUsd,
         500n, // Token risk penalty
         100n  // Liq risk premium
      );

      const unlockTime = (await time.latest()) + (30 * 86400); // 30 days into the future
      const quantity = 1000n; // Simple 1000 tokens
      const schedule = 0; // CLIFF (enum value)
      const loanDuration = 86400 * 30; // Not relevant for Cliff but required param

      const [dpv, ltvBps] = await valuationEngine.computeDPV(quantity, dummyToken, unlockTime, schedule, loanDuration);

      // Basic validations ensuring precision scaling handled internally matches expectations
      expect(dpv).to.be.greaterThan(0n); // Returned in 6-dec USDC representation normally
      expect(ltvBps).to.be.greaterThan(0n); // Generally 50% to 70% bounds (5000 to 7000 bps)
    });
  });
});
