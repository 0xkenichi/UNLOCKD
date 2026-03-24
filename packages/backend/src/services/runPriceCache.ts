import { PriceHistoryCache } from '../oracles/PriceHistoryCache.js';
import 'dotenv/config';
import pino from 'pino';

const logger = pino({ name: 'runPriceCache' });

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing SUPABASE variables');
    process.exit(1);
  }

  const cache = new PriceHistoryCache(redisUrl, supabaseUrl, supabaseServiceKey);
  await cache.start();

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await cache.stop();
    process.exit(0);
  });
}

main().catch(err => {
  logger.error({ err }, 'Fatal error in price cache');
  process.exit(1);
});
