import { VcsSyncService } from '../oracles/VcsSyncService.js';
import 'dotenv/config';
import pino from 'pino';

const logger = pino({ name: 'runVcsCron' });

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
  const rpcUrl = process.env.SEPOLIA_RPC_URL || '';
  const relayerKey = process.env.RELAYER_PRIVATE_KEY || '';
  const loanManager = process.env.LOAN_MANAGER_ADDRESS || '';

  if (!supabaseUrl || !supabaseServiceKey || !rpcUrl || !relayerKey || !loanManager) {
    logger.error('Missing required environment variables for VcsSyncService');
    process.exit(1);
  }

  const sync = new VcsSyncService(supabaseUrl, supabaseServiceKey, rpcUrl, relayerKey, loanManager);

  // Run immediately
  logger.info('Running initial VCS sync pass');
  await sync.processSyncQueue();

  // Then schedule every 30 mins
  const interval = 30 * 60 * 1000;
  setInterval(() => {
    logger.info('Running scheduled VCS sync pass');
    sync.processSyncQueue().catch(err => {
      logger.error({ err }, 'Error during scheduled VCS sync pass');
    });
  }, interval);

  process.on('SIGINT', () => {
    logger.info('Shutting down VCS sync cron...');
    process.exit(0);
  });
}

main().catch(err => {
  logger.error({ err }, 'Fatal error in VCS cron');
  process.exit(1);
});
