import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { dDPVFeed } from '../feeds/vesting.js';
import { getConsensusPrice } from '../consensus/oracle.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

connection.on('error', (err) => {
  console.warn('[Queue] Redis connection error:', err.message);
});

export const oracleQueue = new Queue('oracle-requests', { connection: connection as any });

const worker = new Worker('oracle-requests', async job => {
  const { chain, token, vestingId, quantity } = job.data;
  
  console.log(`Processing job ${job.id} for ${token} on ${chain}`);
  
  const vestedData = await dDPVFeed({ chain, token, vestingId });
  const price = await getConsensusPrice(token);
  
  // Calculate dDPV
  // This would then be sent to the Omega Watcher via gRPC
  return { price, vestedData };
}, { connection: connection as any });

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});
