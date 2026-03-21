// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { decodeEventLog, parseAbiItem } = require('viem');

/**
 * Registry of known vesting factory events and addresses
 */
const VESTING_REGISTRY = {
  HEDGEY_V1: {
    address: '0x2CDE9919e81b20B4B33DD562a48a84b54C48F00C',
    event: parseAbiItem('event PlanCreated(uint256 indexed id, address indexed creator, address indexed recipient, address token, uint256 amount, uint256 start, uint256 cliff, uint256 end, uint256 rate)'),
    protocol: 'Hedgey Finance',
    recipientField: 'recipient'
  },
  SABLIER_V1: {
    address: '0xCD18eAa163733Da39c232722cBC4E8940b1D8888',
    event: parseAbiItem('event CreateStream(uint256 indexed id, address indexed sender, address indexed recipient, uint256 deposit, address token, uint256 startTime, uint256 stopTime)'),
    protocol: 'Sablier V1',
    recipientField: 'recipient'
  },
  HOLI_PROTOCOL: {
    address: '0x7b5ef00ce695029e0d6705c004b3e71d54c77ae6',
    event: parseAbiItem('event TokensReleased(bytes32 indexed scheduleId, address indexed beneficiary, uint256 amount)'),
    protocol: 'Holi Protocol',
    recipientField: 'beneficiary'
  },
  VESTRA_DEMO: {
    address: '0x6EE0a9B7972f43100B9c0757D88BF5A8c7F0bF2E',
    event: parseAbiItem('event DemoPositionMinted(address indexed user, address indexed vestingContract, uint256 collateralId)'),
    protocol: 'Vestra Demo',
    recipientField: 'user'
  },
  SOVEREIGN_ASI: {
    address: '0x5a82034705DAeda18D8D5c52c73525350Dc7Ad1f',
    event: parseAbiItem('event PositionCreated(uint256 indexed id, address indexed beneficiary, uint8 template)'),
    protocol: 'Sovereign ASI',
    recipientField: 'beneficiary'
  },
  SABLIER_V2: {
    address: '0xAFb979d9afAd1aD27C5eFf4E27226E3AB9e5dCC9',
    event: parseAbiItem('event CreateLockupLinearStream(uint256 indexed streamId, address indexed sender, address indexed recipient, (uint128 deposit, uint128 protocolFee, uint128 brokerFee) amounts, address asset, bool cancelable, bool transferable, (uint40 start, uint40 cliff, uint40 end) range, address broker)'),
    protocol: 'Sablier V2',
    recipientField: 'recipient'
  },
  HEDGEY_V2: {
    address: '0x321aD58650F8e318B0F284Ec4D9C776D2Fbe99D0', // General proxy/factory for V2
    event: parseAbiItem('event PlanCreated(uint256 indexed id, address indexed creator, address indexed recipient, address token, uint256 amount, uint256 start, uint256 cliff, uint256 end, uint256 rate)'),
    protocol: 'Hedgey V2',
    recipientField: 'recipient'
  }
};

/**
 * Scans for vesting creation events where the user is the recipient.
 */
async function scanVestingLogs(client, walletAddress, customRange) {
  const results = [];
  const wallet = walletAddress.toLowerCase();

  for (const [key, config] of Object.entries(VESTING_REGISTRY)) {
    try {
      const currentBlock = await client.getBlockNumber();
      const chainId = await client.getChainId();
      
      // Some providers (Thirdweb/Merkle) have strict 1k limits
      const DEMO_MODE = process.env.DEMO_MODE === 'true';
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Alchemy Free Tier has a strict 10 block limit for eth_getLogs
      // chunkSize 10 means we want 10 blocks: [toBlock - 9, toBlock]
      const rangeLimit = DEMO_MODE ? 500n : 2500n; // Reduced to 2500 to stay within free tier limits
      const chunkSize = 10n;

      if (!DEMO_MODE) {
        console.log(`[DiscoveryUtils] Scanning ${config.protocol} logs for ${wallet} in chunks (Total: ${rangeLimit} blocks)`);
      }

      let toBlock = currentBlock;
      let fromBlock = toBlock - (chunkSize - 1n);

      while (toBlock > currentBlock - rangeLimit) {
        try {
          const logs = await client.getLogs({
            address: config.address,
            event: config.event,
            args: { [config.recipientField]: wallet },
            fromBlock: fromBlock > (currentBlock - rangeLimit) ? fromBlock : (currentBlock - rangeLimit),
            toBlock: toBlock
          });

          for (const log of logs) {
            const { args } = log;
            const id = (args.id || args.scheduleId || args.collateralId || args.vestingContract || args.streamId || '0x').toString();
            results.push({
              id,
              protocol: config.protocol,
              contractAddress: args.vestingContract || config.address,
              recipient: args.recipient || args.beneficiary || args.user,
              token: args.token || args.asset || (config.protocol === 'Vestra Demo' ? '0xA9d67A08595FCADbB9A4cbF8032f13fFC9837A6d' : config.address),
              amount: (args.amount || args.deposit || (args.amounts ? args.amounts.deposit : '0')).toString(),
              start: Number(args.start || args.startTime || (args.range ? args.range.start : 0)),
              end: Number(args.end || args.stopTime || (args.range ? args.range.end : 0)),
              cliff: Number(args.cliff || args.startTime || (args.range ? args.range.cliff : 0)),
              chainId
            });
          }
          
          // Respect rate limits on public RPCs
          if (DEMO_MODE) {
            await sleep(500); 
          } else {
            await sleep(250); // Increased sleep to 250ms
          }
        } catch (chunkErr) {
          if (chunkErr.message.includes('429')) {
            const jitterOffset = Math.floor(Math.random() * 5000); // 0-5s jitter
            const backoffMs = 30000 + jitterOffset; // 30s base backoff
            console.warn(`[DiscoveryUtils] RATE LIMITED (429) on ${chainId}. Backing off for ${Math.round(backoffMs/1000)}s...`);
            await sleep(backoffMs); 
          } else {
            console.warn(`[DiscoveryUtils] Chunk scan failed [${fromBlock} - ${toBlock}]:`, chunkErr.message);
          }
        }

        toBlock = fromBlock - 1n;
        fromBlock = toBlock - (chunkSize - 1n);
      }
    } catch (err) {
      console.warn(`[DiscoveryUtils] Full scan failed for ${key}:`, err.message);
    }
  }

  return results;
}

module.exports = { scanVestingLogs, VESTING_REGISTRY };
