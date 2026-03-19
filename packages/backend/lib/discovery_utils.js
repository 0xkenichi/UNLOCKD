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
      
      // Drastically reduce range for public RPC stability
      const rangeLimit = DEMO_MODE ? 2000n : 25000n;
      const chunkSize = DEMO_MODE ? 500n : 1000n;

      if (!DEMO_MODE) {
        console.log(`[DiscoveryUtils] Scanning ${config.protocol} logs for ${wallet} in chunks (Total: ${rangeLimit} blocks)`);
      }

      let toBlock = currentBlock;
      let fromBlock = toBlock - chunkSize;

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
            const id = (args.id || args.scheduleId || args.collateralId || args.vestingContract || '0x').toString();
            results.push({
              id,
              protocol: config.protocol,
              contractAddress: args.vestingContract || config.address,
              recipient: args.recipient || args.beneficiary || args.user,
              token: args.token || (config.protocol === 'Vestra Demo' ? '0xA9d67A08595FCADbB9A4cbF8032f13fFC9837A6d' : config.address),
              amount: (args.amount || args.deposit || '0').toString(),
              start: Number(args.start || args.startTime || 0),
              end: Number(args.end || args.stopTime || 0),
              cliff: Number(args.cliff || args.startTime || 0),
              chainId
            });
          }
          
          // Respect rate limits on public RPCs
          if (DEMO_MODE) await sleep(200); 
        } catch (chunkErr) {
          console.warn(`[DiscoveryUtils] Chunk scan failed [${fromBlock} - ${toBlock}]:`, chunkErr.message);
          if (chunkErr.message.includes('429')) await sleep(2000); // Back off on rate limit
        }

        toBlock = fromBlock - 1n;
        fromBlock = toBlock - chunkSize;
      }
    } catch (err) {
      console.warn(`[DiscoveryUtils] Full scan failed for ${key}:`, err.message);
    }
  }

  return results;
}

module.exports = { scanVestingLogs, VESTING_REGISTRY };
