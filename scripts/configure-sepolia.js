// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { ethers, deployments, getNamedAccounts } = require("hardhat");

async function maybeSend(label, txPromise) {
  const tx = await txPromise;
  console.log(`${label}: ${tx.hash}`);
  await tx.wait();
}

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  const adapterDeployment = await deployments.get("VestingAdapter");
  const poolDeployment = await deployments.get("LendingPool");
  const loanDeployment = await deployments.get("LoanManager");
  const dutchDeployment = await deployments.get("DutchAuction");
  const sealedDeployment = await deployments.get("SealedBidAuction");

  const adapter = await ethers.getContractAt(
    "VestingAdapter",
    adapterDeployment.address,
    signer
  );
  const pool = await ethers.getContractAt(
    "LendingPool",
    poolDeployment.address,
    signer
  );
  const loanManager = await ethers.getContractAt(
    "LoanManager",
    loanDeployment.address,
    signer
  );
  const loanManagerAddress = loanDeployment.address;

  const currentAdapterManager = await adapter.loanManager();
  if (currentAdapterManager.toLowerCase() !== loanManagerAddress.toLowerCase()) {
    await maybeSend(
      "VestingAdapter.setLoanManager",
      adapter.setLoanManager(loanManagerAddress)
    );
  } else {
    console.log("VestingAdapter.setLoanManager: already set");
  }

  const dutchAllowed = await adapter.authorizedCallers(dutchDeployment.address);
  if (!dutchAllowed) {
    await maybeSend(
      "VestingAdapter.setAuthorizedCaller(dutch)",
      adapter.setAuthorizedCaller(dutchDeployment.address, true)
    );
  } else {
    console.log("VestingAdapter.setAuthorizedCaller(dutch): already set");
  }

  const sealedAllowed = await adapter.authorizedCallers(sealedDeployment.address);
  if (!sealedAllowed) {
    await maybeSend(
      "VestingAdapter.setAuthorizedCaller(sealed)",
      adapter.setAuthorizedCaller(sealedDeployment.address, true)
    );
  } else {
    console.log("VestingAdapter.setAuthorizedCaller(sealed): already set");
  }

  const currentPoolManager = await pool.loanManager();
  if (currentPoolManager.toLowerCase() !== loanManagerAddress.toLowerCase()) {
    await maybeSend(
      "LendingPool.setLoanManager",
      pool.setLoanManager(loanManagerAddress)
    );
  } else {
    console.log("LendingPool.setLoanManager: already set");
  }

  const currentIssuance = await pool.issuanceTreasury();
  const currentReturns = await pool.returnsTreasury();
  if (
    currentIssuance.toLowerCase() !== deployer.toLowerCase() ||
    currentReturns.toLowerCase() !== deployer.toLowerCase()
  ) {
    await maybeSend(
      "LendingPool.setTreasuries",
      pool.setTreasuries(deployer, deployer)
    );
  } else {
    console.log("LendingPool.setTreasuries: already set");
  }

  const lmIssuance = await loanManager.issuanceTreasury();
  const lmReturns = await loanManager.returnsTreasury();
  if (
    lmIssuance.toLowerCase() !== deployer.toLowerCase() ||
    lmReturns.toLowerCase() !== deployer.toLowerCase()
  ) {
    await maybeSend(
      "LoanManager.setTreasuries",
      loanManager.setTreasuries(deployer, deployer)
    );
  } else {
    console.log("LoanManager.setTreasuries: already set");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
