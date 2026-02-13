const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const mockUSDC = await deploy("MockUSDC", { from: deployer, log: true });
  const testnetPriceFeed = await deploy("MockPriceFeed", { from: deployer, log: true });

  await deploy("ValuationEngine", {
    from: deployer,
    args: [testnetPriceFeed.address],
    log: true,
  });
  await deploy("VestingAdapter", { from: deployer, log: true });
  await deploy("LendingPool", {
    from: deployer,
    args: [mockUSDC.address],
    log: true,
  });

  const identityVerifier = await deploy("IdentityVerifierMock", {
    from: deployer,
    log: true,
  });
  const identityBoostBps = Number(process.env.IDENTITY_BOOST_BPS || 500);

  const valuation = await deployments.get("ValuationEngine");
  const adapter = await deployments.get("VestingAdapter");
  const pool = await deployments.get("LendingPool");
  const loanManager = await deploy("LoanManager", {
    from: deployer,
    args: [
      valuation.address,
      adapter.address,
      pool.address,
      identityVerifier.address,
      identityBoostBps,
    ],
    log: true,
  });

  const auctionFactory = await deploy("AuctionFactory", {
    from: deployer,
    args: [adapter.address, mockUSDC.address],
    log: true,
  });

  const dutchAuction = await deploy("DutchAuction", {
    from: deployer,
    args: [adapter.address, mockUSDC.address],
    log: true,
  });

  const sealedBidAuction = await deploy("SealedBidAuction", {
    from: deployer,
    args: [adapter.address, mockUSDC.address],
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
};

module.exports.tags = ["local"];
