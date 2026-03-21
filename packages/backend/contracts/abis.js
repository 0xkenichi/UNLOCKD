// ABI definitions for Vestra Protocol backend

const erc20Abi = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

const erc20ReadAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

const communityPoolReadAbi = [
  'function communityPoolCount() view returns (uint256)',
  'function pendingCommunityPoolRewards(uint256 poolId, address user) view returns (uint256)',
  'function communityPools(uint256) view returns (string name,address creator,uint256 targetAmount,uint256 maxAmount,uint256 deadline,uint256 totalContributed,uint256 totalBuildingUnits,uint256 participantCount,uint256 accRewardPerWeight,uint256 totalRewardFunded,bool rewardsByBuildingSize,uint8 state)'
];

const vestingWalletReadAbi = [
  'function token() view returns (address)',
  'function totalAllocation() view returns (uint256)',
  'function start() view returns (uint256)',
  'function duration() view returns (uint256)',
  'function released(address) view returns (uint256)'
];

module.exports = {
  erc20Abi,
  erc20ReadAbi,
  communityPoolReadAbi,
  vestingWalletReadAbi
};
