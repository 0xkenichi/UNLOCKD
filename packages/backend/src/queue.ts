import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { dDPVFeed } from '../feeds/vesting.js';
import { getConsensusPrice } from '../consensus/oracle.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

connection.on('error', (err) => {
  console.warn('[Queue] Redis connection error:', err.message);
});

export const oracleQueue = new Queue('oracle-requests', { connection: connection as any });

const worker = new Worker('oracle-requests', async (job: any) => {
  console.log(`Processing job ${job.id} for ${job.name}`);

  if (job.name === 'lending-position-update') {
    const { type, user, amount, depositType, lockDays, txHash, timestamp } = job.data;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    if (type === 'DEPOSIT') {
      await supabase.from('lending_positions').upsert({
        wallet_address: user.toLowerCase(),
        deposit_amount: amount,
        shares_minted: amount, // Placeholder
        deposit_timestamp: timestamp,
        tx_hash: txHash,
        withdrawal_penalty_mode: depositType,
        lock_days: lockDays
      }, { onConflict: 'tx_hash' });
    } else if (type === 'WITHDRAW') {
      // Logic for withdrawal (e.g., decrementing principal or marking withdrawn)
      console.log(`Withdrawal for ${user}: ${amount} USDC`);
    }
    return { status: 'synced' };
  }
  
  const { chain, token, vestingId, quantity } = job.data;
  
  const vestedData = await dDPVFeed({ chain, token, vestingId });
  const price = await getConsensusPrice(token);
  
  return { price, vestedData };
}, { connection: connection as any });

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});

