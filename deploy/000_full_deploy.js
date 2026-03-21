// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
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

  const registry = await deploy("VestingRegistry", {
    from: deployer,
    args: [deployer],
    log: true,
  });

  const valuation = await deploy("ValuationEngine", {
    from: deployer,
    args: [registry.address, deployer],
    log: true,
  });

  const adapter = await deploy("VestingAdapter", {
    from: deployer,
    args: [registry.address, deployer],
    log: true,
  });

  const issuanceTreasury = process.env.ISSUANCE_TREASURY || deployer;
  const returnsTreasury = process.env.RETURNS_TREASURY || deployer;

  const pool = await deploy("LendingPool", {
    from: deployer,
    args: [usdcAddress, deployer],
    log: true,
  });

  const termVault = await deploy("TermVault", {
    from: deployer,
    args: [usdcAddress, returnsTreasury, deployer],
    log: true,
  });

  const identityVerifier = await deploy("IdentityVerifierMock", {
    from: deployer,
    log: true,
  });

  const identityBoostBps = Number(process.env.IDENTITY_BOOST_BPS || 500);
  const poolFee = Number(process.env.UNISWAP_POOL_FEE || 3000);
  const slippageBps = Number(process.env.LIQUIDATION_SLIPPAGE_BPS || 9000);

  const auctionFactory = await deploy("AuctionFactory", {
    from: deployer,
    args: [adapter.address, usdcAddress, deployer],
    log: true,
  });

  const loanLogicLib = await deploy("LoanLogicLib", {
    from: deployer,
    log: true,
  });

  const loanManager = await deploy("LoanManager", {
    from: deployer,
    args: [
      valuation.address,
      adapter.address,
      pool.address,
      identityVerifier.address,
      identityBoostBps,
      auctionFactory.address,
      uniswapRouterAddress,
      poolFee,
      slippageBps,
      deployer
    ],
    libraries: {
      LoanLogicLib: loanLogicLib.address,
    },
    log: true,
  });

  const liquidationAuction = await deploy("LiquidationAuction", {
    from: deployer,
    args: [adapter.address, usdcAddress, loanManager.address, deployer],
    log: true,
  });

  const dutchAuction = await deploy("DutchAuction", {
    from: deployer,
    args: [adapter.address, usdcAddress, deployer],
    log: true,
  });

  const englishAuction = await deploy("EnglishAuction", {
    from: deployer,
    args: [adapter.address, usdcAddress, deployer],
    log: true,
  });

  const sealedBidAuction = await deploy("SealedBidAuction", {
    from: deployer,
    args: [adapter.address, usdcAddress, deployer],
    log: true,
  });

  const originationFacet = await deploy("LoanOriginationFacet", {
    from: deployer,
    args: [deployer],
    libraries: {
      LoanLogicLib: loanLogicLib.address,
    },
    log: true,
  });

  const repaymentFacet = await deploy("LoanRepaymentFacet", {
    from: deployer,
    args: [deployer],
    libraries: {
      LoanLogicLib: loanLogicLib.address,
    },
    log: true,
  });

  const loanManagerInstance = await ethers.getContractAt(
    "LoanManager",
    loanManager.address,
    await ethers.getSigner(deployer)
  );
  log("Linking facets to LoanManager...");
  await (await loanManagerInstance.setFacets(originationFacet.address, repaymentFacet.address)).wait();

  const adapterDeployment = await deployments.get("VestingAdapter");
  const adapterInstance = await ethers.getContractAt(
    "VestingAdapter",
    adapterDeployment.address,
    await ethers.getSigner(deployer)
  );
  await (await adapterInstance.setLoanManager(loanManager.address)).wait();
  await (await adapterInstance.setAuthorizedCaller(dutchAuction.address, true)).wait();
  await (await adapterInstance.setAuthorizedCaller(englishAuction.address, true)).wait();
  await (await adapterInstance.setAuthorizedCaller(sealedBidAuction.address, true)).wait();

  const auctionFactoryInstance = await ethers.getContractAt(
    "AuctionFactory",
    auctionFactory.address,
    await ethers.getSigner(deployer)
  );
  log("Registering auctions in AuctionFactory...");
  await (await auctionFactoryInstance.registerAuction("LIQUIDATION", liquidationAuction.address)).wait();
  await (await auctionFactoryInstance.registerAuction("DUTCH", dutchAuction.address)).wait();
  await (await auctionFactoryInstance.registerAuction("ENGLISH", englishAuction.address)).wait();
  await (await auctionFactoryInstance.registerAuction("SEALED_BID", sealedBidAuction.address)).wait();

  const poolDeployment = await deployments.get("LendingPool");
  const poolInstance = await ethers.getContractAt(
    "LendingPool",
    poolDeployment.address,
    await ethers.getSigner(deployer)
  );
  await (await poolInstance.setLoanManager(loanManager.address)).wait();
  await (await poolInstance.setTreasuries(issuanceTreasury, returnsTreasury)).wait();

  const termVaultInstance = await ethers.getContractAt(
    "TermVault",
    termVault.address,
    await ethers.getSigner(deployer)
  );
  const trancheApyBps = Number(process.env.TERM_VAULT_MIN_APY_BPS || 800);
  await (await termVaultInstance.setFeeConfig(
    Number(process.env.TERM_VAULT_EARLY_EXIT_FEE_BPS || 100),
    returnsTreasury
  )).wait();
  await (await termVaultInstance.setTranche(0, 30 * 24 * 60 * 60, trancheApyBps, true)).wait();
  await (await termVaultInstance.setTranche(1, 365 * 24 * 60 * 60, trancheApyBps, true)).wait();
  await (await termVaultInstance.setTranche(2, 4 * 365 * 24 * 60 * 60, trancheApyBps, true)).wait();
  await (await termVaultInstance.setTranche(3, 5 * 365 * 24 * 60 * 60, trancheApyBps, true)).wait();

  await (await loanManagerInstance.setTreasuries(issuanceTreasury, returnsTreasury)).wait();

  // 12. Deploy Insurance Vault
  const insuranceVault = await deploy("InsuranceVault", {
    from: deployer,
    args: [usdcAddress, deployer],
    log: true,
  });

  const insuranceVaultInstance = await ethers.getContractAt(
    "InsuranceVault",
    insuranceVault.address,
    await ethers.getSigner(deployer)
  );
  const GUARDIAN_ROLE = await insuranceVaultInstance.GUARDIAN_ROLE();
  await (await insuranceVaultInstance.grantRole(GUARDIAN_ROLE, loanManager.address)).wait();
  await (await insuranceVaultInstance.grantRole(GUARDIAN_ROLE, liquidationAuction.address)).wait();
  await (await loanManagerInstance.setInsuranceVault(insuranceVault.address, 500)).wait();

  const liquidationAuctionInstance = await ethers.getContractAt(
    "LiquidationAuction",
    liquidationAuction.address,
    await ethers.getSigner(deployer)
  );
  await (await liquidationAuctionInstance.setInsuranceVault(insuranceVault.address)).wait();

  // 13. Fund the pools/vaults with initial USDC for demo/testing
  if (isLocal) {
    const mockUSDCInstance = await ethers.getContractAt(
      "MockUSDC",
      usdcAddress,
      await ethers.getSigner(deployer)
    );
    // Give Insurance Vault 50k USDC
    await (await mockUSDCInstance.mint(insuranceVault.address, ethers.parseUnits("50000", 6))).wait();
    // Give LendingPool 1M USDC
    await (await mockUSDCInstance.mint(pool.address, ethers.parseUnits("1000000", 6))).wait();
  }

  // 14. Deploy DemoFaucet for UI
  const demoFaucet = await deploy("DemoFaucet", {
    from: deployer,
    args: [registry.address, usdcAddress],
    log: true,
  });

  const registryInstance = await ethers.getContractAt(
    "VestingRegistry",
    registry.address,
    await ethers.getSigner(deployer)
  );

  const GOVERNOR_ROLE = await registryInstance.GOVERNOR_ROLE();
  await (await registryInstance.grantRole(GOVERNOR_ROLE, demoFaucet.address)).wait();

  // Give the UI deployer some eth to pay gas
  if (isLocal) {
    // If the UI is using some other account, hardhat provides 10,000 ETH to account 0.
  }

  log("Deployment complete!");
};

module.exports.tags = ["full"];
