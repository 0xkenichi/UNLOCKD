const hre = require("hardhat");

const ONE_MINUTE = 60;
const ONE_HOUR = 60 * ONE_MINUTE;

const TOKEN_NAME = "SKYWALKER";
const TOKEN_SYMBOL = "SKY";
const TOKEN_DECIMALS = 6;
const TOTAL_SUPPLY = ethersToBigInt("1000000000", TOKEN_DECIMALS); // 1B SKY
const PRESALE_PRICE_USD = "0.05";

const TOKENOMICS = {
  presale: 2000, // 20.00%
  team: 1500, // 15.00%
  ecosystem: 2500, // 25.00%
  treasury: 2000, // 20.00%
  liquidity: 1000, // 10.00%
  marketing: 1000 // 10.00%
};

function ethersToBigInt(amount, decimals) {
  return BigInt(hre.ethers.parseUnits(amount, decimals).toString());
}

function bpsShare(total, bps) {
  return (total * BigInt(bps)) / 10_000n;
}

function formatPct(bps) {
  return `${(bps / 100).toString()}.${(bps % 100).toString().padStart(2, "0")}%`;
}

async function main() {
  const { ethers, deployments, network } = hre;
  const [deployer] = await ethers.getSigners();
  const beneficiary = process.env.SKYWALKER_BENEFICIARY
    ? ethers.getAddress(process.env.SKYWALKER_BENEFICIARY)
    : deployer.address;

  const usdcDeployment = await deployments.get("MockUSDC");
  const valuationDeployment = await deployments.get("ValuationEngine");
  const poolDeployment = await deployments.get("LendingPool");
  const vestingAdapterDeployment = await deployments.get("VestingAdapter");

  const usdc = await ethers.getContractAt("MockUSDC", usdcDeployment.address, deployer);
  const valuation = await ethers.getContractAt(
    "ValuationEngine",
    valuationDeployment.address,
    deployer
  );
  const pool = await ethers.getContractAt("LendingPool", poolDeployment.address, deployer);
  const vestingAdapter = await ethers.getContractAt(
    "VestingAdapter",
    vestingAdapterDeployment.address,
    deployer
  );

  const priceFeedAddress = await valuation.priceFeed();
  const priceFeed = await ethers.getContractAt("MockPriceFeed", priceFeedAddress, deployer);
  await (await priceFeed.setPrice(ethers.parseUnits(PRESALE_PRICE_USD, 8))).wait();

  const MockProjectToken = await ethers.getContractFactory("MockProjectToken");
  const token = await MockProjectToken.connect(deployer).deploy(
    TOKEN_NAME,
    TOKEN_SYMBOL,
    TOKEN_DECIMALS,
    TOTAL_SUPPLY,
    deployer.address
  );
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  const wallets = {
    beneficiary,
    team: process.env.SKYWALKER_TEAM_WALLET
      ? ethers.getAddress(process.env.SKYWALKER_TEAM_WALLET)
      : deployer.address,
    ecosystem: process.env.SKYWALKER_ECOSYSTEM_WALLET
      ? ethers.getAddress(process.env.SKYWALKER_ECOSYSTEM_WALLET)
      : deployer.address,
    treasury: process.env.SKYWALKER_TREASURY_WALLET
      ? ethers.getAddress(process.env.SKYWALKER_TREASURY_WALLET)
      : deployer.address,
    liquidity: process.env.SKYWALKER_LIQUIDITY_WALLET
      ? ethers.getAddress(process.env.SKYWALKER_LIQUIDITY_WALLET)
      : deployer.address,
    marketing: process.env.SKYWALKER_MARKETING_WALLET
      ? ethers.getAddress(process.env.SKYWALKER_MARKETING_WALLET)
      : deployer.address
  };

  const allocations = {
    presale: bpsShare(TOTAL_SUPPLY, TOKENOMICS.presale),
    team: bpsShare(TOTAL_SUPPLY, TOKENOMICS.team),
    ecosystem: bpsShare(TOTAL_SUPPLY, TOKENOMICS.ecosystem),
    treasury: bpsShare(TOTAL_SUPPLY, TOKENOMICS.treasury),
    liquidity: bpsShare(TOTAL_SUPPLY, TOKENOMICS.liquidity),
    marketing: bpsShare(TOTAL_SUPPLY, TOKENOMICS.marketing)
  };

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const cliffSeconds = 2 * ONE_HOUR;
  const stepInterval = 10 * ONE_MINUTE;
  const stepCount = 10;
  const durationSeconds = cliffSeconds + stepInterval * stepCount;

  const MockStepVestingWallet = await ethers.getContractFactory("MockStepVestingWallet");
  const vesting = await MockStepVestingWallet.connect(deployer).deploy(
    beneficiary,
    now,
    cliffSeconds,
    stepInterval,
    stepCount,
    tokenAddress,
    allocations.presale
  );
  await vesting.waitForDeployment();
  const vestingAddress = await vesting.getAddress();

  await (await token.transfer(vestingAddress, allocations.presale)).wait();
  await (await token.transfer(wallets.team, allocations.team)).wait();
  await (await token.transfer(wallets.ecosystem, allocations.ecosystem)).wait();
  await (await token.transfer(wallets.treasury, allocations.treasury)).wait();
  await (await token.transfer(wallets.liquidity, allocations.liquidity)).wait();
  await (await token.transfer(wallets.marketing, allocations.marketing)).wait();

  const poolDeposit = ethers.parseUnits("250000", 6);
  const poolAddress = await pool.getAddress();
  const issuanceTreasury = await pool.issuanceTreasury();
  const treasurySigner = await ethers.getSigner(issuanceTreasury);

  await (await usdc.mint(treasurySigner.address, poolDeposit)).wait();
  await (await usdc.connect(treasurySigner).approve(poolAddress, ethers.MaxUint256)).wait();
  await (await pool.connect(treasurySigner).deposit(poolDeposit)).wait();

  const collateralId = process.env.COLLATERAL_ID
    ? BigInt(process.env.COLLATERAL_ID)
    : BigInt(Math.floor(Date.now() / 1000));
  await (
    await vestingAdapter.connect(deployer).escrow(collateralId, vestingAddress, beneficiary)
  ).wait();

  const unlockTime = now + durationSeconds;
  const [pv, ltvBps] = await valuation.computeDPV(allocations.presale, tokenAddress, unlockTime);
  const maxBorrow = (pv * ltvBps) / 10_000n;

  console.log("\n=== SKYWALKER realistic tokenomics setup ===");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Beneficiary wallet:", beneficiary);
  console.log("Token:", tokenAddress, `(${TOKEN_NAME}/${TOKEN_SYMBOL})`);
  console.log("Vesting contract:", vestingAddress);
  console.log("Collateral ID:", collateralId.toString());
  console.log("Presale price (USD):", PRESALE_PRICE_USD);
  console.log("Unlock cadence: 2h cliff, then 10% every 10 minutes for 10 steps");
  console.log("First unlock at:", new Date((now + cliffSeconds) * 1000).toISOString());
  console.log("Final unlock at:", new Date(unlockTime * 1000).toISOString());

  console.log("\n--- Tokenomics ---");
  console.log(
    `Presale (${formatPct(TOKENOMICS.presale)}):`,
    ethers.formatUnits(allocations.presale, TOKEN_DECIMALS),
    TOKEN_SYMBOL,
    "-> vested wallet"
  );
  console.log(
    `Team (${formatPct(TOKENOMICS.team)}):`,
    ethers.formatUnits(allocations.team, TOKEN_DECIMALS),
    TOKEN_SYMBOL,
    "->",
    wallets.team
  );
  console.log(
    `Ecosystem (${formatPct(TOKENOMICS.ecosystem)}):`,
    ethers.formatUnits(allocations.ecosystem, TOKEN_DECIMALS),
    TOKEN_SYMBOL,
    "->",
    wallets.ecosystem
  );
  console.log(
    `Treasury (${formatPct(TOKENOMICS.treasury)}):`,
    ethers.formatUnits(allocations.treasury, TOKEN_DECIMALS),
    TOKEN_SYMBOL,
    "->",
    wallets.treasury
  );
  console.log(
    `Liquidity (${formatPct(TOKENOMICS.liquidity)}):`,
    ethers.formatUnits(allocations.liquidity, TOKEN_DECIMALS),
    TOKEN_SYMBOL,
    "->",
    wallets.liquidity
  );
  console.log(
    `Marketing (${formatPct(TOKENOMICS.marketing)}):`,
    ethers.formatUnits(allocations.marketing, TOKEN_DECIMALS),
    TOKEN_SYMBOL,
    "->",
    wallets.marketing
  );
  console.log("Total supply:", ethers.formatUnits(TOTAL_SUPPLY, TOKEN_DECIMALS), TOKEN_SYMBOL);

  console.log("\n--- Borrow UI instructions ---");
  console.log("1. Connect wallet:", beneficiary);
  console.log("2. Enter collateral ID:", collateralId.toString());
  console.log("3. Enter vesting contract:", vestingAddress);
  console.log("4. Click Escrow (already done by script, safe to re-check) then Borrow");
  console.log("\nValuation preview:");
  console.log("DPV (USD 6dp):", pv.toString());
  console.log("LTV (bps):", ltvBps.toString());
  console.log("Estimated max borrow (USDC 6dp):", maxBorrow.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
