const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const getRelayerRpcUrl = () =>
  process.env.EVM_RELAYER_RPC_URL ||
  process.env.RELAYER_RPC_URL ||
  process.env.RPC_URL ||
  process.env.ALCHEMY_SEPOLIA_URL ||
  process.env.INFURA_SEPOLIA_URL ||
  'https://rpc.sepolia.org';

const getRelayerWallet = () => {
  const pk = process.env.EVM_RELAYER_PRIVATE_KEY || process.env.RELAYER_PRIVATE_KEY || '';
  if (!pk) {
    throw new Error('Missing EVM relayer private key (EVM_RELAYER_PRIVATE_KEY or RELAYER_PRIVATE_KEY).');
  }
  const provider = new ethers.JsonRpcProvider(getRelayerRpcUrl());
  return new ethers.Wallet(pk, provider);
};

const loadHardhatArtifact = (relativeParts) => {
  const full = path.join(__dirname, '..', '..', ...relativeParts);
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw);
};

const getFactoryFromArtifact = ({ artifactPathParts, wallet }) => {
  const artifact = loadHardhatArtifact(artifactPathParts);
  if (!artifact?.abi || !artifact?.bytecode) {
    throw new Error('Artifact missing abi/bytecode. Run `npx hardhat compile`.');
  }
  return new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
};

const getVestraVaultFactory = (wallet) => {
  // Hardhat artifact path: artifacts/contracts/VestraVault.sol/VestraVault.json
  return getFactoryFromArtifact({
    artifactPathParts: ['artifacts', 'contracts', 'VestraVault.sol', 'VestraVault.json'],
    wallet
  });
};

const deployVestraVault = async ({ controllerAddress } = {}) => {
  const relayer = getRelayerWallet();
  const controller = controllerAddress || relayer.address;
  const factory = getVestraVaultFactory(relayer);
  const contract = await factory.deploy(controller);
  const receipt = await contract.deploymentTransaction().wait(1);
  return {
    vaultAddress: await contract.getAddress(),
    deployTxHash: receipt?.hash || contract.deploymentTransaction().hash,
    relayerAddress: relayer.address
  };
};

const execViaVault = async ({ vaultAddress, target, value = 0n, data }) => {
  if (!vaultAddress || !target || !data) throw new Error('vaultAddress, target, data required');
  const relayer = getRelayerWallet();
  const artifact = loadHardhatArtifact([
    'artifacts',
    'contracts',
    'VestraVault.sol',
    'VestraVault.json'
  ]);
  const vault = new ethers.Contract(vaultAddress, artifact.abi, relayer);
  const tx = await vault.exec(target, value, data);
  return { txHash: tx.hash };
};

const deploySablierV2OperatorWrapper = async ({ lockupAddress, streamId, beneficiary } = {}) => {
  if (!ethers.isAddress(lockupAddress)) throw new Error('Invalid lockup address');
  if (!beneficiary || !ethers.isAddress(beneficiary)) throw new Error('Invalid beneficiary address');
  const id = BigInt(streamId);
  if (id <= 0n) throw new Error('streamId must be > 0');

  const relayer = getRelayerWallet();
  // Hardhat artifact path: artifacts/contracts/wrappers/SablierV2OperatorWrapper.sol/SablierV2OperatorWrapper.json
  const factory = getFactoryFromArtifact({
    artifactPathParts: [
      'artifacts',
      'contracts',
      'wrappers',
      'SablierV2OperatorWrapper.sol',
      'SablierV2OperatorWrapper.json'
    ],
    wallet: relayer
  });
  const contract = await factory.deploy(ethers.getAddress(lockupAddress), id, ethers.getAddress(beneficiary));
  const receipt = await contract.deploymentTransaction().wait(1);
  return {
    wrapperAddress: await contract.getAddress(),
    deployTxHash: receipt?.hash || contract.deploymentTransaction().hash
  };
};

const deployOZVestingClaimWrapper = async ({ beneficiary, token, totalAllocation } = {}) => {
  if (!beneficiary || !ethers.isAddress(beneficiary)) throw new Error('Invalid beneficiary address');
  if (!token || !ethers.isAddress(token)) throw new Error('Invalid token address');
  const total = BigInt(totalAllocation);
  if (total <= 0n) throw new Error('totalAllocation must be > 0');

  const relayer = getRelayerWallet();
  const factory = getFactoryFromArtifact({
    artifactPathParts: [
      'artifacts',
      'contracts',
      'wrappers',
      'OZVestingClaimWrapper.sol',
      'OZVestingClaimWrapper.json'
    ],
    wallet: relayer
  });
  const contract = await factory.deploy(
    ethers.getAddress(beneficiary),
    ethers.getAddress(token),
    total
  );
  const receipt = await contract.deploymentTransaction().wait(1);
  return {
    wrapperAddress: await contract.getAddress(),
    deployTxHash: receipt?.hash || contract.deploymentTransaction().hash
  };
};

const deployTokenTimelockClaimWrapper = async ({ beneficiary, token, totalAllocation, duration } = {}) => {
  if (!beneficiary || !ethers.isAddress(beneficiary)) throw new Error('Invalid beneficiary address');
  if (!token || !ethers.isAddress(token)) throw new Error('Invalid token address');
  const total = BigInt(totalAllocation);
  const dur = BigInt(duration);
  if (total <= 0n) throw new Error('totalAllocation must be > 0');
  if (dur <= 0n) throw new Error('duration must be > 0');

  const relayer = getRelayerWallet();
  const factory = getFactoryFromArtifact({
    artifactPathParts: [
      'artifacts',
      'contracts',
      'wrappers',
      'TokenTimelockClaimWrapper.sol',
      'TokenTimelockClaimWrapper.json'
    ],
    wallet: relayer
  });
  const contract = await factory.deploy(
    ethers.getAddress(beneficiary),
    ethers.getAddress(token),
    total,
    dur
  );
  const receipt = await contract.deploymentTransaction().wait(1);
  return {
    wrapperAddress: await contract.getAddress(),
    deployTxHash: receipt?.hash || contract.deploymentTransaction().hash
  };
};

const deploySuperfluidClaimWrapper = async ({ beneficiary, token, totalAllocation, startTime, duration } = {}) => {
  if (!beneficiary || !ethers.isAddress(beneficiary)) throw new Error('Invalid beneficiary address');
  if (!token || !ethers.isAddress(token)) throw new Error('Invalid token address');
  const total = BigInt(totalAllocation);
  const start = BigInt(startTime);
  const dur = BigInt(duration);
  if (total <= 0n) throw new Error('totalAllocation must be > 0');
  if (dur <= 0n) throw new Error('duration must be > 0');

  const relayer = getRelayerWallet();
  const factory = getFactoryFromArtifact({
    artifactPathParts: [
      'artifacts',
      'contracts',
      'wrappers',
      'SuperfluidClaimWrapper.sol',
      'SuperfluidClaimWrapper.json'
    ],
    wallet: relayer
  });
  const contract = await factory.deploy(
    ethers.getAddress(beneficiary),
    ethers.getAddress(token),
    total,
    start,
    dur
  );
  const receipt = await contract.deploymentTransaction().wait(1);
  return {
    wrapperAddress: await contract.getAddress(),
    deployTxHash: receipt?.hash || contract.deploymentTransaction().hash
  };
};

module.exports = {
  getRelayerRpcUrl,
  getRelayerWallet,
  deployVestraVault,
  execViaVault,
  deploySablierV2OperatorWrapper,
  deployOZVestingClaimWrapper,
  deployTokenTimelockClaimWrapper,
  deploySuperfluidClaimWrapper
};

