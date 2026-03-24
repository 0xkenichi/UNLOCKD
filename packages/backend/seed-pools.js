const fetch = require('node-fetch');
async function seedPools() {
  const pools = [
    { name: "USDC Alpha Node", capacity: 5000000000, utilization: 42, apy: 6.5, riskScore: "Low" },
    { name: "Sovereign Yield Pool", capacity: 1200000000, utilization: 15, apy: 8.2, riskScore: "Low" },
    { name: "Institutional Term Node", capacity: 10000000000, utilization: 88, apy: 4.8, riskScore: "Low" }
  ];
  for (const p of pools) {
    try {
      const resp = await fetch('http://localhost:4000/api/admin/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      console.log(`Pool ${p.name}: ${resp.status}`);
    } catch (e) { console.error(e.message); }
  }
}
seedPools();
