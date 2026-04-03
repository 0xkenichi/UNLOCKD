const fetch = require('node-fetch');

async function testVcsCache() {
    const address = "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae"; // Vitalik's address
    const baseUrl = "http://localhost:3000/api/profile/vcs-input";
    
    console.log(`[TEST] Fetching VCS input for ${address}...`);
    const start1 = Date.now();
    const res1 = await fetch(`${baseUrl}?address=${address}`);
    const data1 = await res1.json();
    const end1 = Date.now();
    console.log(`[TEST] Request 1 took ${end1 - start1}ms`);
    console.log(`[TEST] Data Sample:`, JSON.stringify(data1, null, 2).slice(0, 500));

    console.log(`\n[TEST] Fetching again (should hit cache)...`);
    const start2 = Date.now();
    const res2 = await fetch(`${baseUrl}?address=${address}`);
    const data2 = await res2.json();
    const end2 = Date.now();
    console.log(`[TEST] Request 2 took ${end2 - start2}ms`);
    
    if (end2 - start2 < 200) {
        console.log(`[PASS] Cache hit detected (<200ms)`);
    } else {
        console.log(`[FAIL] Cache hit too slow (${end2 - start2}ms)`);
    }
}

testVcsCache().catch(console.error);
