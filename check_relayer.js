const { ethers } = require('ethers');
require('dotenv').config({ path: './packages/backend/.env' });

async function check() {
    const rpcUrl = process.env.RPC_URL;
    const pk = process.env.EVM_RELAYER_PRIVATE_KEY;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(pk, provider);
    
    console.log('Relayer Address:', wallet.address);
    const balance = await provider.getBalance(wallet.address);
    console.log('Balance:', ethers.formatEther(balance), 'ETH');
    
    const usdcAddr = process.env.NEXT_USDC_ADDRESS || '0x3dF11e82a5aBe55DE936418Cf89373FDAE1579C8';
    const usdc = new ethers.Contract(usdcAddr, [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function balanceOf(address) view returns (uint256)',
        'function mint(address,uint256)'
    ], provider);
    
    try {
        console.log('USDC Address:', usdcAddr);
        console.log('USDC Symbol:', await usdc.symbol());
        console.log('Relayer USDC Balance:', await usdc.balanceOf(wallet.address));
    } catch (e) {
        console.log('USDC Check failed:', e.message);
    }
}

check();
