const persistence = require('../packages/backend/persistence');

async function check() {
  try {
    // persistence.js usually initializes itself, but might need process.env.DATABASE_URL
    // We already saw in server.js that it just works if imported.
    // The error was "Cannot read properties of null (reading 'prepare')" which means sqlite var is null.
    // This happens if process.env.USE_SUPABASE === 'true' (which it isn't) OR it hasn't run the IIFE properly.
    
    // Let's just try to list pools and handle the error gracefully.
    const pools = await persistence.listPools();
    console.log(`Pool count: ${pools.length}`);
    if (pools.length > 0) {
      console.log('Pool names:', pools.map(p => p.name).join(', '));
    } else {
      console.log('No pools found in database.');
    }
  } catch (err) {
    console.error('Check failed:', err.message);
    console.log('Stack:', err.stack);
  }
}

check();
