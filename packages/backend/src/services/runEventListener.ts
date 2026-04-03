import { startLoanService } from './loanService';
import 'dotenv/config';
import pino from 'pino';

const logger = pino({ name: 'runEventListener' });

async function main() {
  try {
    await startLoanService();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to start loanService');
    process.exit(1);
  }

  process.on('SIGINT', () => {
    logger.info('Shutting down event listener...');
    process.exit(0);
  });
}

main();
