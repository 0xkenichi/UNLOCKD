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
      const totalRange = customRange || 25000n; 
      const chunkSize = 1000n;
      
      let toBlock = currentBlock;
      let fromBlock = toBlock - chunkSize;
      const finalBlock = currentBlock - totalRange;

      console.log(`[DiscoveryUtils] Scanning ${config.protocol} logs for ${wallet} in chunks (Total: ${totalRange} blocks)`);

      while (toBlock > finalBlock) {
        try {
          const logs = await client.getLogs({
            address: config.address,
            event: config.event,
            args: { [config.recipientField]: wallet },
            fromBlock: fromBlock > finalBlock ? fromBlock : finalBlock,
            toBlock: toBlock
          });

          for (const log of logs) {
            const { args } = log;
            const id = (args.id || args.scheduleId).toString();
            results.push({
              id,
              protocol: config.protocol,
              recipient: args.recipient || args.beneficiary,
              token: args.token || config.address, // vHOLI is both token and manager
              amount: (args.amount || args.deposit || '0').toString(),
              start: Number(args.start || args.startTime || 0),
              end: Number(args.end || args.stopTime || 0),
              cliff: Number(args.cliff || args.startTime || 0),
              chainId
            });
          }
        } catch (chunkErr) {
          // If a chunk fails, we logging but continue to next chunk
          console.warn(`[DiscoveryUtils] Chunk scan failed [${fromBlock} - ${toBlock}]:`, chunkErr.message);
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
