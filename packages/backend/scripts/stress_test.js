const http = require('http');

const BASE_URL = 'http://localhost:4000';
const WALLET = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

async function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runStressTest() {
  console.log(`[stress-test] Starting test on ${BASE_URL}...`);
  
  const iterations = 10;
  const portfolioTasks = [];
  const faucetTasks = [];

  console.log(`[stress-test] Dispatching ${iterations} concurrent portfolio scans...`);
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    portfolioTasks.push(request(`/api/scanner/portfolio/${WALLET}?chain=evm`));
  }

  const portfolioResults = await Promise.allSettled(portfolioTasks);
  const portfolioDuration = Date.now() - startTime;
  
  const portfolioSuccess = portfolioResults.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  console.log(`[stress-test] Portfolio Result: ${portfolioSuccess}/${iterations} success in ${portfolioDuration}ms`);

  console.log(`[stress-test] Dispatching ${iterations} concurrent faucet requests...`);
  const faucetStartTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    faucetTasks.push(request('/api/faucet/usdc', 'POST', { address: WALLET }));
  }

  const faucetResults = await Promise.allSettled(faucetTasks);
  const faucetDuration = Date.now() - faucetStartTime;
  
  const faucetSuccess = faucetResults.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  console.log(`[stress-test] Faucet Result: ${faucetSuccess}/${iterations} success in ${faucetDuration}ms`);

  console.log('[stress-test] Summary:');
  console.log(`- Portfolio Avg: ${portfolioDuration / iterations}ms`);
  console.log(`- Faucet Avg: ${faucetDuration / iterations}ms`);
}

runStressTest().catch(console.error);
