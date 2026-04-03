const wallet = "0x39Ecf94ed35451A67006dcCE4A467aecdfAB6940".toLowerCase();
async function sync() {
  const loads = [
    { wallet, amount: "5000", apyBps: 1100, durationDays: 30 },
    { wallet, amount: "10", apyBps: 1100, durationDays: 30 },
    { wallet, amount: "1023456", apyBps: 1200, durationDays: 90 }
  ];
  console.log("Syncing old deposits...");
  for (const p of loads) {
    try {
        const res = await fetch('http://127.0.0.1:4000/api/lend/deposit', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p)
        });
        const data = await res.json();
        console.log(`Synced ${p.amount} USDC: ${res.status} - ${JSON.stringify(data)}`);
    } catch (e) {
        console.log(`Failed for ${p.amount}:`, e.message);
    }
  }
}
sync();
