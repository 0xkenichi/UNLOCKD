import { LoanEventListener } from '../oracles/LoanEventListener.js';
import 'dotenv/config';
import pino from 'pino';

const logger = pino({ name: 'runEventListener' });

function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
  const loanManager = process.env.LOAN_MANAGER_ADDRESS || '';
  const lendingPool = process.env.LENDING_POOL_ADDRESS || '';

  if (!rpcUrl || !supabaseUrl || !supabaseServiceKey || !loanManager || !lendingPool) {
    logger.error('Missing required environment variables for LoanEventListener');
    process.exit(1);
  }

  const listener = new LoanEventListener(rpcUrl, supabaseUrl, supabaseServiceKey, loanManager, lendingPool);
  listener.start();

  process.on('SIGINT', () => {
    logger.info('Shutting down event listener...');
    process.exit(0);
  });
}

main();
