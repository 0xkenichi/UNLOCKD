// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
/**
 * Seed script: creates a sample vest (1h cliff, 3h total) with MockVestraToken,
 * funds the lending pool with mock USDC, and escrows the vest for borrowing.
 *
 * Run: npx hardhat run scripts/seed-sample-vest.js [--network localhost|sepolia]
 *
 * For local testing, run: npx hardhat run scripts/seed-sample-vest.js
 * This will deploy contracts first (on ephemeral hardhat network) then seed.
 *
 * For sepolia: deploy first, then: npx hardhat run scripts/seed-sample-vest.js --network sepolia
 *
 * Output includes: collateralId, vestingContract address, and instructions
 * for borrowing against the vest via the LoanManager.
 */

const hre = require('hardhat');

const ONE_HOUR = 60 * 60;
const THREE_HOURS = 3 * ONE_HOUR;
const ALLOCATION = 10_000n * 10n ** 18n; // 10,000 VEST
const POOL_DEPOSIT = 100_000n * 10n ** 6n; // 100,000 mock USDC

async function main() {
  const { ethers, deployments, network, run } = hre;
  const [deployer] = await ethers.getSigners();
  const borrower = deployer; // use deployer as borrower for testing

  console.log(`\n[seed-sample-vest] Network: ${network.name}`);
  console.log(`[seed-sample-vest] Deployer: ${deployer.address}\n`);

  // On hardhat (ephemeral), ensure deploy has run so addresses exist on-chain
  if (network.name === 'hardhat') {
    const usdcExists = await deployments.getOrNull('MockUSDC');
    if (!usdcExists) {
      console.log('[seed-sample-vest] Deploying contracts first (hardhat)...');
      await run('deploy', { tags: 'full' });
    }
  }

  // Resolve deployed contracts
  const usdcDeployment = await deployments.getOrNull('MockUSDC');
  const poolDeployment = await deployments.getOrNull('LendingPool');
  const vestingAdapterDeployment = await deployments.getOrNull('VestingAdapter');
  const priceFeedDeployment = await deployments.getOrNull('MockPriceFeed');

  if (!usdcDeployment || !poolDeployment || !vestingAdapterDeployment) {
    console.error('Missing deployments. Run full deploy first: npx hardhat deploy --network ' + network.name);
    process.exit(1);
  }

  const usdc = await ethers.getContractAt('MockUSDC', usdcDeployment.address, deployer);
  const pool = await ethers.getContractAt('LendingPool', poolDeployment.address, deployer);
  const vestingAdapter = await ethers.getContractAt('VestingAdapter', vestingAdapterDeployment.address, deployer);

  // 1. Deploy sample vest token (MockVestraToken)
  const VestFactory = await ethers.getContractFactory('MockVestraToken');
  const vestToken = await VestFactory.deploy();
  await vestToken.waitForDeployment();
  const vestTokenAddress = await vestToken.getAddress();
  console.log('MockVestraToken deployed:', vestTokenAddress);

  // 2. Set price feed for VEST ($1) if we have MockPriceFeed
  if (priceFeedDeployment) {
    const priceFeed = await ethers.getContractAt('MockPriceFeed', priceFeedDeployment.address, deployer);
    await priceFeed.setPrice(1e8); // $1 with 8 decimals
    console.log('MockPriceFeed set to $1');
  }

  // 3. Deploy MockLinearVestingWallet: 1h cliff, 3h total
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const cliffSeconds = ONE_HOUR;
  const durationSeconds = THREE_HOURS;

  const MockLinearVestingWallet = await ethers.getContractFactory('MockLinearVestingWallet');
  const vesting = await MockLinearVestingWallet.deploy(
    borrower.address,
    now,
    durationSeconds,
    cliffSeconds,
    vestTokenAddress,
    ALLOCATION
  );
  await vesting.waitForDeployment();
  const vestingAddress = await vesting.getAddress();

  console.log('\n--- Sample vest ---');
  console.log('MockLinearVestingWallet:', vestingAddress);
  console.log('Cliff:', cliffSeconds, 's (1 hour)');
  console.log('Total duration:', durationSeconds, 's (3 hours)');
  console.log('Unlock time:', new Date((now + durationSeconds) * 1000).toISOString());
  console.log('Allocation:', ethers.formatUnits(ALLOCATION, 18), 'VEST');

  // 4. Fund vesting contract with VEST
  await vestToken.mint(vestingAddress, ALLOCATION);
  console.log('Funded vesting contract with', ethers.formatUnits(ALLOCATION, 18), 'VEST');

  // 5. Generate collateral ID (user will escrow when borrowing in the UI)
  const collateralId = BigInt(Math.floor(Date.now() / 1000));
  console.log('\nCollateral ID (use in UI for escrow + borrow):', collateralId.toString());

  // 6. Fund lending pool with mock USDC
  const poolAddress = await pool.getAddress();
  const issuanceTreasury = await pool.issuanceTreasury();
  const treasurySigner = await ethers.getSigner(issuanceTreasury);

  await usdc.mint(treasurySigner.address, POOL_DEPOSIT);
  await usdc.connect(treasurySigner).approve(poolAddress, ethers.MaxUint256);
  await pool.connect(treasurySigner).deposit(POOL_DEPOSIT);
  console.log('\nLending pool funded with', ethers.formatUnits(POOL_DEPOSIT, 6), 'mock USDC');

  // Also give borrower some USDC for gas/repay
  await usdc.mint(borrower.address, 10_000n * 10n ** 6n);
  console.log('Borrower funded with 10,000 mock USDC');

  console.log('\n--- Borrow instructions ---');
  console.log('Collateral ID:', collateralId.toString());
  console.log('Vesting contract:', vestingAddress);
  console.log('\nIn the UI:');
  console.log('  1. Connect wallet (', deployer.address, ')');
  console.log('  2. Enter collateral ID:', collateralId.toString());
  console.log('  3. Enter vesting contract:', vestingAddress);
  console.log('  4. Click Escrow → then Borrow');
  console.log('\nOr via Hardhat:');
  console.log('  npx hardhat run scripts/interact-sepolia.js --network', network.name);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
