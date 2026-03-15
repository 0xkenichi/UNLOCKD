// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const hre = require("hardhat");

async function main() {
  const { ethers, deployments, network } = hre;

  if (network.name !== "sepolia") {
    throw new Error("Run with --network sepolia");
  }

  const loanManagerDeployment = await deployments.get("LoanManager");
  const poolDeployment = await deployments.get("LendingPool");

  const loanManager = await ethers.getContractAt(
    "LoanManager",
    loanManagerDeployment.address
  );
  const pool = await ethers.getContractAt(
    "LendingPool",
    poolDeployment.address
  );

  const latestBlock = await ethers.provider.getBlockNumber();
  const fromBlock = Math.max(latestBlock - 200, 0);
  const step = 10;

  const loanCreated = [];
  const loanRepaid = [];
  const loanSettled = [];
  const poolTreasuryUpdates = [];

  for (let start = fromBlock; start <= latestBlock; start += step) {
    const end = Math.min(start + step - 1, latestBlock);
    const createdChunk = await loanManager.queryFilter(
      loanManager.filters.LoanCreated(),
      start,
      end
    );
    const repaidChunk = await loanManager.queryFilter(
      loanManager.filters.LoanRepaid(),
      start,
      end
    );
    const settledChunk = await loanManager.queryFilter(
      loanManager.filters.LoanSettled(),
      start,
      end
    );
    const treasuryChunk = await pool.queryFilter(
      pool.filters.TreasuryConfigUpdated(),
      start,
      end
    );
    loanCreated.push(...createdChunk);
    loanRepaid.push(...repaidChunk);
    loanSettled.push(...settledChunk);
    poolTreasuryUpdates.push(...treasuryChunk);
  }
  const loanCount = await loanManager.loanCount();
  const totalBorrowed = await pool.totalBorrowed();

  console.log("LoanCreated events:", loanCreated.length);
  loanCreated.forEach((evt) => {
    console.log(
      `  LoanCreated loanId=${evt.args.loanId} borrower=${evt.args.borrower} amount=${evt.args.amount}`
    );
  });
  console.log("LoanRepaid events:", loanRepaid.length);
  loanRepaid.forEach((evt) => {
    console.log(`  LoanRepaid loanId=${evt.args.loanId} amount=${evt.args.amount}`);
  });
  console.log("LoanSettled events:", loanSettled.length);
  loanSettled.forEach((evt) => {
    console.log(
      `  LoanSettled loanId=${evt.args.loanId} defaulted=${evt.args.defaulted}`
    );
  });

  console.log("LendingPool treasury updates:", poolTreasuryUpdates.length);
  console.log("LoanManager loanCount:", loanCount.toString());
  console.log("LendingPool totalBorrowed:", totalBorrowed.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
