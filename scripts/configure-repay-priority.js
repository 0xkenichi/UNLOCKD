const { ethers, deployments, getNamedAccounts } = require("hardhat");

async function main() {
  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  const loanDeployment = await deployments.get("LoanManager");
  const loanManager = await ethers.getContractAt(
    "LoanManager",
    loanDeployment.address,
    signer
  );

  const rawTokens =
    process.env.REPAY_TOKENS ||
    process.env[`REPAY_TOKENS_${(process.env.DEPLOYMENTS_NETWORK || "").toUpperCase()}`];

  if (!rawTokens) {
    throw new Error(
      "Set REPAY_TOKENS as a comma-separated list of token addresses."
    );
  }

  const tokens = rawTokens
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    throw new Error("REPAY_TOKENS is empty.");
  }

  const tx = await loanManager.setRepayTokenPriority(tokens);
  console.log(`LoanManager.setRepayTokenPriority: ${tx.hash}`);
  await tx.wait();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
