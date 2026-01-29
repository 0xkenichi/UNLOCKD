const hre = require("hardhat");

async function main() {
  const { ethers, deployments, network } = hre;

  if (network.name !== "sepolia") {
    throw new Error("Run with --network sepolia");
  }

  const [deployer, borrowerFallback] = await ethers.getSigners();
  const borrower = borrowerFallback || deployer;

  const collateralId = process.env.COLLATERAL_ID
    ? BigInt(process.env.COLLATERAL_ID)
    : BigInt(Math.floor(Date.now() / 1000));

  const usdcDeployment = await deployments.get("MockUSDC");
  const vestingAdapterDeployment = await deployments.get("VestingAdapter");

  const usdc = await ethers.getContractAt(
    "MockUSDC",
    usdcDeployment.address,
    deployer
  );
  const vestingAdapter = await ethers.getContractAt(
    "VestingAdapter",
    vestingAdapterDeployment.address,
    deployer
  );

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const vesting = await MockVestingWallet.connect(deployer).deploy(
    borrower.address,
    now,
    180 * 24 * 60 * 60,
    await usdc.getAddress(),
    ethers.parseUnits("10000", 6)
  );
  await vesting.waitForDeployment();

  const vestingAddress = await vesting.getAddress();

  console.log("MockVestingWallet deployed:", vestingAddress);
  console.log("Borrower:", borrower.address);
  console.log("Collateral ID:", collateralId.toString());

  const escrowTx = await vestingAdapter
    .connect(borrower)
    .escrow(collateralId, vestingAddress, borrower.address);
  await escrowTx.wait();

  console.log("Escrowed collateral. Use this ID in the UI.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
