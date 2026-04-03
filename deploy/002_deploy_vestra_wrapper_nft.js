// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { ethers, network } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`--- Deploying VestraWrapperNFT to ${network.name} ---`);

  const admin = deployer;
  const baseURI = "https://api.vestra.finance/nft/metadata/";

  // 1. Deploy NFT
  const nft = await deploy("VestraWrapperNFT", {
    from: deployer,
    args: [admin, baseURI],
    log: true,
  });

  log(`✅ VestraWrapperNFT deployed at: ${nft.address}`);

  // 2. Grant MINTER_ROLE to LoanManager
  try {
    const loanManagerDeployment = await get("LoanManager");
    const lmAddress = loanManagerDeployment.address;

    log(`Found LoanManager at: ${lmAddress}`);
    log(`Granting MINTER_ROLE to LoanManager...`);

    const nftContract = await ethers.getContractAt("VestraWrapperNFT", nft.address);
    const MINTER_ROLE = await nftContract.MINTER_ROLE();

    const tx = await nftContract.grantRole(MINTER_ROLE, lmAddress);
    await tx.wait();

    log(`✅ MINTER_ROLE granted successfully.`);
  } catch (err) {
    log(`⚠️ Could not automatically grant MINTER_ROLE: ${err.message}`);
    log(`Manual fallback: nft.grantRole(MINTER_ROLE, <LOAN_MANAGER_ADDRESS>)`);
  }

  log(`Deployment script 002 complete.`);
};

module.exports.tags = ["nft"];
module.exports.dependencies = ["LoanManager"]; // Ensures LoanManager exists if running all
