// scripts/test-tokenomist-api.js
require('dotenv').config({ path: 'packages/backend/.env' });
const { fetch } = require('undici');

const TOKENOMIST_API_URL = 'https://api.tokenomist.ai/v2';
const tokenomistKey = process.env.TOKENOMIST_API_KEY;

async function main() {
  console.log('Testing Tokenomist API key:', tokenomistKey ? 'Present' : 'Missing');
  if (!tokenomistKey) process.exit(1);

  console.log('Fetching token list...');
  try {
    let listResp;
    for (let i = 0; i < 3; i++) {
        try {
            listResp = await fetch(`${TOKENOMIST_API_URL}/token/list`, {
                headers: { 'x-api-key': tokenomistKey }
            });
            if (listResp.ok) break;
        } catch (e) {
            console.log(`Retry ${i+1} failed...`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    if (!listResp || !listResp.ok) {
        console.log('Final retry failed.');
        return;
    }
    console.log('Response status:', listResp.status);
    const data = await listResp.json();
    const tokens = Array.isArray(data) ? data : (data.data || []);
    console.log('Data count:', tokens.length);
    if (tokens.length > 0) {
      const firstId = tokens[0].id;
      console.log(`Fetching allocations for ${firstId}...`);
      const allocResp = await fetch(`${TOKENOMIST_API_URL}/token/allocations/${firstId}`, {
        headers: { 'x-api-key': tokenomistKey }
      });
      const allocData = await allocResp.json();
      console.log('Allocations structure:', JSON.stringify(allocData).slice(0, 500));
      
      console.log(`Fetching investors for ${firstId}...`);
      const invResp = await fetch(`${TOKENOMIST_API_URL}/token/investors/${firstId}`, {
        headers: { 'x-api-key': tokenomistKey }
      });
      const invData = await invResp.json();
      console.log('Investors structure:', JSON.stringify(invData).slice(0, 500));
    }
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

main();
