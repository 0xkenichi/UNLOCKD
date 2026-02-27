const { ethers, network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!deployer) {
    throw new Error(
      "No deployer account configured. Set PRIVATE_KEY in your environment (see hardhat.config.js)."
    );
  }

  log(`Deploying to ${network.name} (chainId: ${network.config.chainId})`);

  let usdcAddress = process.env.USDC_ADDRESS || "";
  let priceFeedAddress = process.env.PRICE_FEED_ADDRESS || "";
  let uniswapRouterAddress = process.env.UNISWAP_ROUTER_ADDRESS || "";

  const chainId = network.config.chainId;
  const isLocal =
    network.name === "hardhat" || network.name === "localhost";
  const isTestnet = [11155111, 84532, 43113, 545].includes(chainId);

  if (isLocal || (!usdcAddress && !priceFeedAddress && isTestnet)) {
    const mockUSDC = await deploy("MockUSDC", { from: deployer, log: true });
    const testnetPriceFeed = await deploy("MockPriceFeed", {
      from: deployer,
      log: true,
    });
    usdcAddress = mockUSDC.address;
    priceFeedAddress = testnetPriceFeed.address;
  }

  if (isLocal || (!uniswapRouterAddress && isTestnet)) {
    const mockRouter = await deploy("MockSwapRouter", {
      from: deployer,
      log: true,
    });
    uniswapRouterAddress = mockRouter.address;
  }

  if (!usdcAddress) {
    throw new Error("Missing USDC_ADDRESS for this network");
  }
  if (!priceFeedAddress) {
    throw new Error("Missing PRICE_FEED_ADDRESS for this network");
  }
  if (!uniswapRouterAddress) {
    throw new Error("Missing UNISWAP_ROUTER_ADDRESS for this network");
  }

  const valuation = await deploy("ValuationEngine", {
    from: deployer,
    args: [priceFeedAddress],
    log: true,
  });

  const adapter = await deploy("VestingAdapter", { from: deployer, log: true });

  const issuanceTreasury = process.env.ISSUANCE_TREASURY || deployer;
  const returnsTreasury = process.env.RETURNS_TREASURY || deployer;

  const pool = await deploy("LendingPool", {
    from: deployer,
    args: [usdcAddress],
    log: true,
  });

  const termVault = await deploy("TermVault", {
    from: deployer,
    args: [usdcAddress, returnsTreasury],
    log: true,
  });

  const identityVerifier = await deploy("IdentityVerifierMock", {
    from: deployer,
    log: true,
  });

  const identityBoostBps = Number(process.env.IDENTITY_BOOST_BPS || 500);
  const poolFee = Number(process.env.UNISWAP_POOL_FEE || 3000);
  const slippageBps = Number(process.env.LIQUIDATION_SLIPPAGE_BPS || 9000);

  const loanManager = await deploy("LoanManager", {
    from: deployer,
    args: [
      valuation.address,
      adapter.address,
      pool.address,
      identityVerifier.address,
      identityBoostBps,
      uniswapRouterAddress,
      poolFee,
      slippageBps,
    ],
    log: true,
  });

  const auctionFactory = await deploy("AuctionFactory", {
    from: deployer,
    args: [adapter.address, usdcAddress],
    log: true,
  });

  const dutchAuction = await deploy("DutchAuction", {
    from: deployer,
    args: [adapter.address, usdcAddress],
    log: true,
  });

  const sealedBidAuction = await deploy("SealedBidAuction", {
    from: deployer,
    args: [adapter.address, usdcAddress],
    log: true,
  });

  const adapterDeployment = await deployments.get("VestingAdapter");
  const adapterInstance = await ethers.getContractAt(
    "VestingAdapter",
    adapterDeployment.address,
    await ethers.getSigner(deployer)
  );
  await adapterInstance.setLoanManager(loanManager.address);
  await adapterInstance.setAuthorizedCaller(dutchAuction.address, true);
  await adapterInstance.setAuthorizedCaller(sealedBidAuction.address, true);

  const poolDeployment = await deployments.get("LendingPool");
  const poolInstance = await ethers.getContractAt(
    "LendingPool",
    poolDeployment.address,
    await ethers.getSigner(deployer)
  );
  await poolInstance.setLoanManager(loanManager.address);
  await poolInstance.setTreasuries(issuanceTreasury, returnsTreasury);

  const termVaultInstance = await ethers.getContractAt(
    "TermVault",
    termVault.address,
    await ethers.getSigner(deployer)
  );
  const trancheApyBps = Number(process.env.TERM_VAULT_MIN_APY_BPS || 800);
  await termVaultInstance.setFeeConfig(
    Number(process.env.TERM_VAULT_EARLY_EXIT_FEE_BPS || 100),
    returnsTreasury
  );
  await termVaultInstance.setTranche(0, 30 * 24 * 60 * 60, trancheApyBps, true);
  await termVaultInstance.setTranche(1, 365 * 24 * 60 * 60, trancheApyBps, true);
  await termVaultInstance.setTranche(2, 4 * 365 * 24 * 60 * 60, trancheApyBps, true);
  await termVaultInstance.setTranche(3, 5 * 365 * 24 * 60 * 60, trancheApyBps, true);

  const loanManagerInstance = await ethers.getContractAt(
    "LoanManager",
    loanManager.address,
    await ethers.getSigner(deployer)
  );
  await loanManagerInstance.setTreasuries(issuanceTreasury, returnsTreasury);

  log("Deployment complete!");
};

module.exports.tags = ["full"];
