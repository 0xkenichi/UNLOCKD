// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
// GET /api/scanner/portfolio/:wallet
// Zapper/Zerion-style multi-chain asset aggregator
// Real APIs: Alchemy (EVM), Helius (Solana), Dune Analytics (DeFi), CoinGecko + Jupiter (prices)

const express = require('express');
const SovereignDataService = require('../lib/SovereignDataService');
const { mapWithConcurrency } = require('../lib/concurrency');

const router = express.Router();

// Portfolio Cache Implementation (per-wallet, per-chain)
const portfolioCache = new Map();
const portfolioInFlight = new Map();
const PORTFOLIO_TTL_MS = Number(process.env.PORTFOLIO_CACHE_TTL_MS || 120_000); // 2 minutes default

function getPortfolioCacheKey(wallet, chain) {
    return `${wallet.toLowerCase()}:${chain || 'all'}`;
}

const ALCHEMY_KEY = process.env.RPC_URL?.split('/v2/')[1] || 'vFg0i2LwT6-VD2bja4ZB3';

const EVM_CHAINS = [
    { 
        id: 11155111, 
        name: 'Sepolia', 
        rpc: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
    },
    { 
        id: 84532, 
        name: 'Base Sepolia', 
        rpc: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
    },
    { 
        id: 1, 
        name: 'Mainnet', 
        rpc: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
    }
];

const FETCH_TIMEOUT_MS = 12_000;



// ─── AbortController-wrapped fetch ───────────────────────────────────────────
async function safeFetch(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn(`[scanner] fetch timed out (${timeoutMs}ms): ${url.slice(0, 80)}`);
            throw new Error(`Fetch timed out after ${timeoutMs}ms`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ─── EVM: Alchemy Token Balances (real Alchemy API) ───────────────────────────
async function getEvmTokenBalances(wallet, rpcUrl) {
    if (!rpcUrl) return [];
    try {
        // 1. Get all ERC-20 token balances
        const res = await safeFetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'alchemy_getTokenBalances',
                params: [wallet, 'erc20']
            })
        });
        if (!res.ok) {
            console.warn(`[scanner] Alchemy token balances HTTP ${res.status} for ${rpcUrl}`);
            return [];
        }
        const data = await res.json();
        const result = data?.result;
        
        // Handle standard RPC fallback if alchemy_getTokenBalances not supported
        if (!result || !result.tokenBalances) {
            console.log(`[scanner] alchemy_getTokenBalances failed for ${rpcUrl}, falling back to standard scan.`);
            return await getEvmTokenBalancesStandard(wallet, rpcUrl);
        }

        // 2. Limit to top 20 tokens by balance to save API calls
        const sortedBalances = (result.tokenBalances || [])
            .filter((t) => t.tokenBalance && t.tokenBalance !== '0x' && t.tokenBalance !== '0x0')
            .sort((a, b) => {
                try {
                    const bA = BigInt(a.tokenBalance);
                    const bB = BigInt(b.tokenBalance);
                    return bA > bB ? -1 : (bA < bB ? 1 : 0);
                } catch { return 0; }
            })
            .slice(0, 20); // TOP 20 ONLY

        if (!sortedBalances.length) return [];

        // 3. Enrich with metadata via alchemy_getTokenMetadata (batched with low concurrency)
        const enriched = await mapWithConcurrency(
            sortedBalances,
            async (token) => {
                try {
                    const metaRes = await safeFetch(rpcUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'alchemy_getTokenMetadata',
                            params: [token.contractAddress]
                        })
                    }, 8000);
                    if (!metaRes.ok) return null;
                    const metaJson = await metaRes.json();
                    const meta = metaJson?.result || {};
                    const decimals = Number(meta.decimals || 18);
                    let balance = 0;
                    try {
                        balance = Number(BigInt(token.tokenBalance)) / Math.pow(10, decimals);
                    } catch { balance = 0; }
                    if (balance === 0) return null;
                    
                    // Determine chain name from RPC URL
                    const chainName = rpcUrl.includes('base') ? 'base' : (rpcUrl.includes('sepolia') ? 'sepolia' : 'ethereum');
                    
                    return {
                        chain: chainName,
                        category: 'liquid',
                        contractAddress: token.contractAddress.toLowerCase(),
                        symbol: meta.symbol || 'ERC20',
                        name: meta.name || token.contractAddress,
                        decimals,
                        balance,
                        logo: meta.logo || null,
                        priceUsd: 0,
                        valueUsd: 0
                    };
                } catch { return null; }
            },
            2 // LOW CONCURRENCY: 2
        );

        return enriched.filter(Boolean);
    } catch (err) {
        console.warn(`[scanner] EVM token fetch failed for ${rpcUrl}:`, err.message);
        return [];
    }
}

async function getEvmTokenBalancesStandard(wallet, rpcUrl) {
    // Standard ERC20 scanner for non-Alchemy RPCs (e.g. Base Sepolia public RPC)
    // We check a list of "monitored" tokens that are critical for Vestra
    const MONITORED_TOKENS = [
        { address: '0x3dF11e82a5aBe55DE936418Cf89373FDAE1579C8', symbol: 'USDC', name: 'USD Coin (Mock)', decimals: 6 }, // Sepolia
        { address: '0x032ef137119E92e9A7091D57F0C850A2e30f1dEE', symbol: 'USDC', name: 'USDC', decimals: 6 }, // Base Sepolia
        { address: '0xA9d67A08595FCADbB9A4cbF8032f13fFC9837A6d', symbol: 'VEST', name: 'Vestra Token', decimals: 18 }, // Sepolia
        { address: '0x963cBb0Ffd0d1DC9C2bA8e6Ab631E1a5d656c539', symbol: 'VCS', name: 'Vestra Credit Score', decimals: 18 }, // Sovereign ASI VCS (formerly $CRDT)
        { address: '0x3A54192862D1c52C8175d4912f1f778d1E3C2449', symbol: 'ASI', name: 'ASI Token (Sepolia)', decimals: 18 }, // ASI Sepolia
        { address: '0xaea46A60368A7bD060eec7DF8CBa43b7EF41Db85', symbol: 'ASI', name: 'Artificial Superintelligence Alliance', decimals: 18 } // ASI Mainnet (FET)
    ];

    const balances = [];
    const chainName = rpcUrl.includes('base') ? 'base' : (rpcUrl.includes('sepolia') ? 'sepolia' : 'ethereum');

    for (const token of MONITORED_TOKENS) {
        try {
            const res = await safeFetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'eth_call',
                    params: [
                        {
                            to: token.address,
                            data: `0x70a08231000000000000000000000000${wallet.toLowerCase().replace('0x', '')}` // balanceOf(address)
                        },
                        'latest'
                    ]
                })
            }, 5000);

            if (res.ok) {
                const data = await res.json();
                const rawBalance = BigInt(data?.result || '0x0');
                if (rawBalance > 0n) {
                    const balance = Number(rawBalance) / Math.pow(10, token.decimals);
                    balances.push({
                        chain: chainName,
                        category: 'liquid',
                        contractAddress: token.address.toLowerCase(),
                        symbol: token.symbol,
                        name: token.name,
                        decimals: token.decimals,
                        balance,
                        logo: null,
                        priceUsd: 0,
                        valueUsd: 0
                    });
                }
            }
        } catch (err) {
            console.warn(`[scanner] standard balance check failed for ${token.symbol} on ${rpcUrl}:`, err.message);
        }
    }
    return balances;
}

// ─── EVM: Native ETH balance ──────────────────────────────────────────────────
async function getEvmNativeBalance(wallet, rpcUrl) {
    if (!rpcUrl) return null;
    try {
        const res = await safeFetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1,
                method: 'eth_getBalance',
                params: [wallet, 'latest']
            })
        });
        if (!res.ok) return null;
        const data = await res.json();
        const rawWei = BigInt(data?.result || '0x0');
        const balance = Number(rawWei) / 1e18;
        if (balance < 0.0001) return null;
        
        // Determine chain name from RPC URL
        const chainName = rpcUrl.includes('base') ? 'base' : (rpcUrl.includes('sepolia') ? 'sepolia' : 'ethereum');

        return {
            chain: chainName,
            category: 'liquid',
            contractAddress: 'native',
            symbol: 'ETH',
            name: rpcUrl.includes('base') ? 'Base ETH' : 'Ether',
            decimals: 18,
            balance,
            logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
            priceUsd: 0,
            valueUsd: 0
        };
    } catch (err) {
        console.warn(`[scanner] EVM native balance failed for ${rpcUrl}:`, err.message);
        return null;
    }
}

// ─── EVM: Alchemy NFTs (real Alchemy API) ───────────────────────────────────
async function getEvmNfts(wallet, rpcUrl) {
    if (!rpcUrl || !rpcUrl.includes('alchemy')) return [];
    try {
        const res = await safeFetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'alchemy_getNfts',
                params: [wallet]
            })
        });
        if (!res.ok) {
            console.warn(`[scanner] Alchemy NFTs HTTP ${res.status} for ${rpcUrl}`);
            return [];
        }
        const data = await res.json();
        const nfts = data?.result?.ownedNfts || [];
        
        const chainName = rpcUrl.includes('base') ? 'base' : (rpcUrl.includes('sepolia') ? 'sepolia' : 'ethereum');

        return nfts.map(nft => ({
            chain: chainName,
            category: 'nfts',
            contractAddress: nft.contract?.address?.toLowerCase() || 'unknown',
            tokenId: nft.id?.tokenId || '0',
            name: nft.title || nft.metadata?.name || 'Vestra NFT',
            symbol: nft.contract?.symbol || 'NFT',
            description: nft.description || nft.metadata?.description || '',
            image: nft.media?.[0]?.gateway || nft.metadata?.image || null,
            collection: nft.contract?.name || 'Unknown Collection',
            isSpam: nft.spamInfo?.isSpam === 'true'
        })).filter(n => !n.isSpam);
    } catch (err) {
        console.warn(`[scanner] EVM NFT fetch failed for ${rpcUrl}:`, err.message);
        return [];
    }
}

// ─── Solana: Helius DAS API (real token balances + NFTs) ────────────────────────
async function getSolanaBalancesHelius(wallet) {
    // Use Helius DAS getAssetsByOwner if API key is set, otherwise fall back to public RPC
    const tokens = [];

    // 1. SOL native balance via public RPC
    try {
        const rpcUrl = HELIUS_API_KEY
            ? `${HELIUS_BASE}/?api-key=${HELIUS_API_KEY}`
            : 'https://api.mainnet-beta.solana.com';

        const solRes = await safeFetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [wallet] })
        }, 8000);
        if (solRes.ok) {
            const solJson = await solRes.json();
            const lamports = solJson?.result?.value || 0;
            const solBalance = lamports / 1e9;
            if (solBalance > 0.001) {
                tokens.push({
                    chain: 'solana',
                    category: 'liquid',
                    contractAddress: 'native',
                    symbol: 'SOL',
                    name: 'Solana',
                    decimals: 9,
                    balance: solBalance,
                    logo: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
                    priceUsd: 0,
                    valueUsd: 0
                });
            }
        }
    } catch (err) {
        console.warn('[scanner] Solana SOL balance failed:', err.message);
    }

    // 2. SPL tokens via Helius DAS (if api key) or public RPC
    if (HELIUS_API_KEY) {
        try {
            // Helius getTokenAccountsByOwner with parsed info
            const splRes = await safeFetch(`${HELIUS_BASE}/?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 2,
                    method: 'getTokenAccountsByOwner',
                    params: [
                        wallet,
                        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                        { encoding: 'jsonParsed', commitment: 'confirmed' }
                    ]
                })
            }, 8000);
            if (splRes.ok) {
                const splJson = await splRes.json();
                const accounts = splJson?.result?.value || [];
                for (const account of accounts) {
                    const parsed = account?.account?.data?.parsed?.info;
                    if (!parsed) continue;
                    const amount = parsed.tokenAmount?.uiAmount || 0;
                    if (amount < 0.001) continue;
                    const mint = parsed.mint || '';
                    tokens.push({
                        chain: 'solana',
                        category: 'liquid',
                        contractAddress: mint,
                        symbol: mint.slice(0, 6).toUpperCase(),
                        name: `SPL Token`,
                        decimals: parsed.tokenAmount?.decimals || 0,
                        balance: amount,
                        logo: null,
                        priceUsd: 0,
                        valueUsd: 0
                    });
                }
            }
        } catch (err) {
            console.warn('[scanner] Helius SPL token fetch failed:', err.message);
        }

        // 3. Helius enhanced getAssetsByOwner for fungible + NFT assets
        try {
            const dasRes = await safeFetch(`${HELIUS_REST}/assets/by-owner?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerAddress: wallet,
                    page: 1,
                    limit: 100,
                    displayOptions: { showFungible: true, showNativeBalance: false }
                })
            }, 10000);
            if (dasRes.ok) {
                const dasJson = await dasRes.json();
                const items = dasJson?.items || [];
                for (const item of items) {
                    const isFungible = item.interface === 'FungibleToken' || item.interface === 'FungibleAsset';
                    const tokenInfo = item.token_info;
                    if (!isFungible || !tokenInfo) continue;
                    const balance = tokenInfo.balance / Math.pow(10, tokenInfo.decimals || 0);
                    if (balance < 0.001) continue;
                    // Avoid duplicates
                    const exists = tokens.find((t) => t.contractAddress === item.id);
                    if (exists) {
                        // Enrich missing metadata
                        if (!exists.symbol || exists.symbol.length <= 6) {
                            exists.symbol = tokenInfo.symbol || exists.symbol;
                            exists.name = item.content?.metadata?.name || 'SPL Token';
                            exists.logo = item.content?.links?.image || null;
                        }
                        continue;
                    }
                    tokens.push({
                        chain: 'solana',
                        category: 'liquid',
                        contractAddress: item.id,
                        symbol: tokenInfo.symbol || item.id.slice(0, 6).toUpperCase(),
                        name: item.content?.metadata?.name || 'SPL Token',
                        decimals: tokenInfo.decimals || 0,
                        balance,
                        logo: item.content?.links?.image || null,
                        priceUsd: tokenInfo.price_info?.price_per_token || 0,
                        valueUsd: tokenInfo.price_info?.total_price || 0
                    });
                }
            }
        } catch (err) {
            console.warn('[scanner] Helius DAS getAssetsByOwner failed:', err.message);
        }
    } else {
        // Fallback: public RPC SPL tokens
        try {
            const splRes = await safeFetch('https://api.mainnet-beta.solana.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 2,
                    method: 'getTokenAccountsByOwner',
                    params: [
                        wallet,
                        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                        { encoding: 'jsonParsed', commitment: 'confirmed' }
                    ]
                })
            }, 8000);
            if (splRes.ok) {
                const splJson = await splRes.json();
                const accounts = splJson?.result?.value || [];
                for (const account of accounts) {
                    const parsed = account?.account?.data?.parsed?.info;
                    if (!parsed) continue;
                    const amount = parsed.tokenAmount?.uiAmount || 0;
                    if (amount < 0.001) continue;
                    tokens.push({
                        chain: 'solana',
                        category: 'liquid',
                        contractAddress: parsed.mint,
                        symbol: parsed.mint.slice(0, 6).toUpperCase(),
                        name: 'SPL Token',
                        decimals: parsed.tokenAmount?.decimals || 0,
                        balance: amount,
                        logo: null,
                        priceUsd: 0,
                        valueUsd: 0
                    });
                }
            }
        } catch (err) {
            console.warn('[scanner] Public RPC SPL fetch failed:', err.message);
        }
    }

    return tokens;
}

// ─── Jupiter Price API (Solana token prices) ─────────────────────────────────
async function enrichSolanaWithJupiterPrices(tokens) {
    const solTokens = tokens.filter((t) => t.chain === 'solana' && t.priceUsd === 0);
    if (!solTokens.length) return tokens;

    const mints = solTokens
        .map((t) => t.contractAddress)
        .filter((a) => a !== 'native')
        .slice(0, 50); // Jupiter limits

    // SOL price from CoinGecko (below)
    if (!mints.length) return tokens;

    try {
        const ids = mints.join(',');
        const res = await safeFetch(`https://price.jup.ag/v6/price?ids=${ids}`, {}, 8000);
        if (!res.ok) return tokens;
        const data = await res.json();
        const prices = data?.data || {};
        return tokens.map((t) => {
            if (t.chain !== 'solana' || t.priceUsd > 0) return t;
            const priceData = prices[t.contractAddress];
            const priceUsd = priceData?.price || 0;
            return { ...t, priceUsd, valueUsd: priceUsd * t.balance };
        });
    } catch (err) {
        console.warn('[scanner] Jupiter price fetch failed:', err.message);
        return tokens;
    }
}

// ─── CoinGecko price enrichment (EVM tokens + SOL) ───────────────────────────
const CG_CONTRACT_MAP = {
    // Sepolia mock addresses → mainnet equivalents for price lookups
    '0xc9c9083f4794165e9baa920fc9fcbc462864d992': 'usd-coin', // Mock USDC
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'usd-coin',
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 'tether',
    '0x6b175474e89094c44da98b954eedeac495271d0f': 'dai',
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'weth',
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'wrapped-bitcoin',
};

const CG_SYMBOL_MAP = {
    ETH: 'ethereum', WETH: 'weth',
    USDC: 'usd-coin', USDT: 'tether',
    DAI: 'dai', WBTC: 'wrapped-bitcoin',
    SOL: 'solana', LINK: 'chainlink',
    ARB: 'arbitrum', OP: 'optimism',
    MATIC: 'matic-network', AVAX: 'avalanche-2',
    BNB: 'binancecoin', UNI: 'uniswap',
    AAVE: 'aave', COMP: 'compound-governance-token',
    MKR: 'maker', SNX: 'havven',
};

const priceCache = new Map();
const PRICE_TTL_MS = 60_000;

async function enrichWithCoinGeckoPrices(tokens) {
    const geckoIdSet = new Set();

    for (const t of tokens) {
        const byAddr = t.chain === 'evm'
            ? CG_CONTRACT_MAP[t.contractAddress?.toLowerCase()]
            : null;
        const bySym = CG_SYMBOL_MAP[t.symbol?.toUpperCase()];
        const id = byAddr || bySym;
        if (id) geckoIdSet.add(id);
    }

    const geckoIds = [...geckoIdSet];
    if (!geckoIds.length) return tokens;

    const now = Date.now();
    const uncached = geckoIds.filter((id) => {
        const c = priceCache.get(id);
        return !c || now - c.fetchedAt > PRICE_TTL_MS;
    });

    if (uncached.length) {
        try {
            const res = await safeFetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${uncached.join(',')}&vs_currencies=usd`,
                {}, 8000
            );
            if (res.ok) {
                const data = await res.json();
                for (const [id, val] of Object.entries(data)) {
                    priceCache.set(id, { priceUsd: val?.usd || 0, fetchedAt: Date.now() });
                }
            }
        } catch (err) {
            console.warn('[scanner] CoinGecko price fetch failed:', err.message);
        }
    }

    return tokens.map((t) => {
        if (t.priceUsd > 0) return t; // Already enriched (e.g., by Helius DAS)
        const byAddr = t.chain === 'evm'
            ? CG_CONTRACT_MAP[t.contractAddress?.toLowerCase()]
            : null;
        const bySym = CG_SYMBOL_MAP[t.symbol?.toUpperCase()];
        const geckoId = byAddr || bySym;
        const cached = geckoId ? priceCache.get(geckoId) : null;
        const priceUsd = cached?.priceUsd || 0;
        return { ...t, priceUsd, valueUsd: priceUsd * t.balance };
    });
}

// ─── Dune Analytics: EVM DeFi Positions ──────────────────────────────────────
// Uses pre-built Dune queries for Uniswap V3 LP, Aave positions, etc.
// Add DUNE_API_KEY to your .env: https://dune.com/settings/api
//
// Query IDs used:
//   3901750 – Wallet EVM Token Holdings (multi-chain)
//   3888099 – Uniswap V3 Open Positions by wallet
//   3888200 – Aave V3 positions by wallet

const DUNE_QUERIES = {
    // Generic token holdings query (returns token, amount, price, chain)
    tokenHoldings: '3901750',
    // Uniswap V3 LP positions
    uniV3: '3888099',
    // Aave V3 supplied / borrowed
    aaveV3: '3888200',
};

async function executeDuneQuery(queryId, params = {}) {
    if (!process.env.DUNE_API_KEY) return null;
    try {
        // Execute query
        const execRes = await safeFetch(`https://api.dune.com/api/v1/query/${queryId}/execute`, {
            method: 'POST',
            headers: {
                'X-Dune-API-Key': process.env.DUNE_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query_parameters: params, performance: 'medium' })
        }, 15_000);
        if (!execRes.ok) {
            console.warn(`[scanner] Dune execute ${queryId} HTTP ${execRes.status}`);
            return null;
        }
        const execJson = await execRes.json();
        const executionId = execJson?.execution_id;
        if (!executionId) return null;

        // Poll for results (max 20s)
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
            const statusRes = await safeFetch(
                `https://api.dune.com/api/v1/execution/${executionId}/results`,
                { headers: { 'X-Dune-API-Key': process.env.DUNE_API_KEY } },
                10_000
            );
            if (!statusRes.ok) break;
            const statusJson = await statusRes.json();
            if (statusJson?.is_execution_finished || statusJson?.state === 'QUERY_STATE_COMPLETED') {
                return statusJson?.result?.rows || [];
            }
            if (statusJson?.state === 'QUERY_STATE_FAILED') {
                console.warn(`[scanner] Dune query ${queryId} failed`);
                return null;
            }
            await new Promise((r) => setTimeout(r, 2000));
        }
        return null;
    } catch (err) {
        console.warn(`[scanner] Dune query ${queryId} error:`, err.message);
        return null;
    }
}

async function getDuneDefiPositions(wallet) {
    if (!process.env.DUNE_API_KEY) return [];

    const defiPositions = [];

    // Fetch Uniswap V3 LP positions and Aave V3 positions concurrently
    const [uniRows, aaveRows] = await Promise.allSettled([
        executeDuneQuery(DUNE_QUERIES.uniV3, { wallet_address: wallet.toLowerCase() }),
        executeDuneQuery(DUNE_QUERIES.aaveV3, { wallet_address: wallet.toLowerCase() })
    ]);

    // Uniswap V3 positions
    const uniData = uniRows.status === 'fulfilled' ? uniRows.value || [] : [];
    for (const row of uniData) {
        defiPositions.push({
            chain: 'evm',
            category: 'defi',
            protocol: 'Uniswap V3',
            type: 'LP Position',
            tokenId: String(row.token_id || ''),
            token0: row.token0_symbol || 'TOKEN0',
            token1: row.token1_symbol || 'TOKEN1',
            liquidity: Number(row.liquidity || 0),
            valueUsd: Number(row.position_value_usd || 0),
            inRange: Boolean(row.in_range),
            feeTier: row.fee_tier || '',
            description: `${row.token0_symbol}/${row.token1_symbol} LP (${row.fee_tier})`
        });
    }

    // Aave V3 positions
    const aaveData = aaveRows.status === 'fulfilled' ? aaveRows.value || [] : [];
    for (const row of aaveData) {
        defiPositions.push({
            chain: 'evm',
            category: 'defi',
            protocol: 'Aave V3',
            type: row.position_type || 'Supply',
            symbol: row.symbol || '',
            balance: Number(row.amount || 0),
            valueUsd: Number(row.value_usd || 0),
            apy: Number(row.apy || 0),
            description: `${row.position_type} ${row.symbol} @ ${(Number(row.apy || 0) * 100).toFixed(2)}% APY`
        });
    }

    return defiPositions;
}

// ─── Vestra Vested Contracts (from on-chain indexer DB) ─────────────────────
function getSovereignAssets(db, wallet) {
    try {
        if (!db) return [];
        const normalizedWallet = String(wallet || '').toLowerCase().trim();
        const assets = [];

        // 1. Vesting Sources
        const vestingRows = db.prepare(`
            SELECT id, chain_id, vesting_contract, protocol, stream_id, last_synced_at
            FROM vesting_sources
            WHERE LOWER(lockup_address) = ?
        `).all(normalizedWallet);

        assets.push(...vestingRows.map((row) => ({
            chain: row.chain_id || 'evm',
            category: 'vested',
            protocol: row.protocol || 'Vestra',
            contractAddress: row.vesting_contract,
            streamId: row.stream_id,
            symbol: 'VEST',
            name: `${row.protocol || 'Vestra'} Vesting Stream`,
            balance: 0,
            valueUsd: 0,
            lastSynced: row.last_synced_at,
            description: `Sovereign tracked vesting via ${row.protocol}`
        })));

        // 2. Staked Sources
        const stakedRows = db.prepare(`
            SELECT id, chain_id, staking_contract, protocol, amount, last_synced_at
            FROM staked_sources
            WHERE LOWER(wallet_address) = ?
        `).all(normalizedWallet);

        assets.push(...stakedRows.map((row) => ({
            chain: row.chain_id || 'evm',
            category: 'staked',
            protocol: row.protocol,
            contractAddress: row.staking_contract,
            amount: row.amount || '0',
            symbol: 'STAKE',
            name: `${row.protocol} Staked Position`,
            balance: row.amount || 0,
            valueUsd: 0, // Calculated downstream or mirrored
            lastSynced: row.last_synced_at
        })));
        
        // 3. Locked Sources
        const lockedRows = db.prepare(`
            SELECT id, chain_id, lock_contract, protocol, asset_address, amount, last_synced_at, metadata
            FROM locked_sources
            WHERE LOWER(lock_contract) = ? OR LOWER(asset_address) = ?
        `).all(normalizedWallet, normalizedWallet);

        assets.push(...lockedRows.map((row) => {
            let metadata = {};
            try { metadata = row.metadata ? JSON.parse(row.metadata) : {}; } catch { /* noop */ }
            
            return {
                chain: row.chain_id || 'evm',
                category: 'locked',
                protocol: row.protocol,
                contractAddress: row.lock_contract,
                assetAddress: row.asset_address,
                amount: row.amount || '0',
                symbol: metadata.symbol || 'LOCK',
                name: metadata.name || `${row.protocol} Locked Asset`,
                decimals: metadata.decimals || 18,
                balance: row.amount || 0,
                valueUsd: 0,
                lastSynced: row.last_synced_at
            };
        }));

        return assets;
    } catch (err) {
        console.warn('[scanner] sovereign assets query failed:', err.message);
        return [];
    }
}

// ─── Safe linked wallet resolver (direct SQLite only — Supabase bypassed) ────
// We query SQLite directly via the `db` handle from req.app.locals rather than
// going through persistence.js (whose Supabase path may throw if tables are missing).
function resolveLinkedWalletsDirect(wallet, chainType, db) {
    const wallets = { evm: new Set(), solana: new Set() };

    if (chainType === 'solana') {
        wallets.solana.add(wallet);
    } else {
        wallets.evm.add(wallet);
    }

    // Only attempt linked-wallet lookup when we have a local SQLite handle
    if (!db || typeof db.prepare !== 'function') return wallets;

    try {
        // Find the user associated with this wallet
        let userId = null;
        if (chainType === 'evm') {
            const row = db.prepare('SELECT id FROM app_users WHERE LOWER(wallet_address) = ?').get(wallet.toLowerCase());
            userId = row?.id;
        } else {
            const row = db.prepare(
                `SELECT user_id FROM user_wallet_links WHERE chain_type = 'solana' AND LOWER(wallet_address) = ? LIMIT 1`
            ).get(wallet.toLowerCase());
            userId = row?.user_id;
        }

        if (!userId) return wallets;

        // Get all linked wallets for this user
        const links = db.prepare(
            `SELECT chain_type, wallet_address FROM user_wallet_links WHERE user_id = ?`
        ).all(userId);

        for (const link of links) {
            if (link.chain_type === 'evm' && link.wallet_address) wallets.evm.add(link.wallet_address);
            if (link.chain_type === 'solana' && link.wallet_address) wallets.solana.add(link.wallet_address);
        }
    } catch (err) {
        // Table doesn't exist yet or SQLite not ready — ignore and use primary wallet only
        console.warn('[scanner] linked wallet SQLite lookup skipped:', err.message);
    }

    return wallets;
}



// ─── Route handler ────────────────────────────────────────────────────────────
router.get('/portfolio/:wallet', async (req, res) => {
    // Apply expensiveLimiter if available on app.locals
    const expensiveLimiter = req.app.get('expensiveLimiter');
    if (expensiveLimiter) {
        return expensiveLimiter(req, res, () => handlePortfolio(req, res));
    }
    return handlePortfolio(req, res);
});

async function handlePortfolio(req, res) {
    const { wallet } = req.params;
    const { chain = 'all', refresh = 'false' } = req.query;
    const db = req.app.locals?.db || null;

    const cacheKey = getPortfolioCacheKey(wallet, chain);
    const cached = portfolioCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PORTFOLIO_TTL_MS && refresh !== 'true') {
        return res.json({ ok: true, ...cached.data, cached: true });
    }

    // Deduplicate in-flight requests
    if (portfolioInFlight.has(cacheKey)) {
        try {
            const result = await portfolioInFlight.get(cacheKey);
            return res.json({ ok: true, ...result, cached: true });
        } catch (err) {
            return res.status(500).json({ ok: false, error: 'Scanner failed (in-flight)', detail: err.message });
        }
    }

    let resolveInFlight, rejectInFlight;
    const inFlightPromise = new Promise((resolve, reject) => {
        resolveInFlight = resolve;
        rejectInFlight = reject;
    });
    portfolioInFlight.set(cacheKey, inFlightPromise);

    // We lazy-require persistence so a DB outage doesn't crash the scanner import
    let persistence = null;
    try { persistence = require('../persistence'); } catch { /* noop */ }

    if (!wallet || wallet.length < 8) {
        return res.status(400).json({ ok: false, error: 'Invalid wallet address' });
    }

    const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet);
    const isEvm = /^0x[0-9a-fA-F]{40}$/.test(wallet);

    if (!isSolana && !isEvm) {
        return res.status(400).json({ ok: false, error: 'Unrecognized wallet address format' });
    }

    try {
        const initialChainType = isSolana ? 'solana' : 'evm';

        // 1. Resolve linked wallets via direct SQLite (no Supabase — never crashes)
        const targetWallets = resolveLinkedWalletsDirect(wallet, initialChainType, db);

        const liquidTokens = [];
        const scanTasks = [];

        // 2. EVM scans (Iterate over all supported chains)
        if (chain === 'all' || chain === 'evm') {
            for (const evmWallet of targetWallets.evm) {
                for (const chainCfg of EVM_CHAINS) {
                    scanTasks.push(
                        Promise.allSettled([
                            getEvmTokenBalances(evmWallet, chainCfg.rpc),
                            getEvmNativeBalance(evmWallet, chainCfg.rpc),
                            chainCfg.id === 1 ? getDuneDefiPositions(evmWallet) : Promise.resolve([]), // Only mainnet for Dune defi
                            getEvmNfts(evmWallet, chainCfg.rpc)
                        ])
                    );
                }
            }
        }

        // 3. Solana scans
        if (chain === 'all' || chain === 'solana') {
            for (const solWallet of targetWallets.solana) {
                scanTasks.push(
                    getSolanaBalancesHelius(solWallet).then((tokens) => [
                        { status: 'fulfilled', value: tokens },
                        { status: 'fulfilled', value: null },
                        { status: 'fulfilled', value: [] },
                        { status: 'fulfilled', value: [] }
                    ])
                );
            }
        }

        const allResults = await Promise.allSettled(scanTasks);

        const defiPositions = [];
        const vestedPositions = [];
        const nftPositions = [];

        for (const result of allResults) {
            if (result.status !== 'fulfilled') continue;
            const [tokensResult, nativeResult, defiResult, nftsResult] = result.value || [];

            if (tokensResult?.status === 'fulfilled' && Array.isArray(tokensResult.value)) {
                liquidTokens.push(...tokensResult.value);
            }
            if (nativeResult?.status === 'fulfilled' && nativeResult.value) {
                liquidTokens.push(nativeResult.value);
            }
            if (defiResult?.status === 'fulfilled' && Array.isArray(defiResult.value)) {
                defiPositions.push(...defiResult.value);
            }
            if (nftsResult?.status === 'fulfilled' && Array.isArray(nftsResult.value)) {
                nftPositions.push(...nftsResult.value);
            }
        }

        // 4. Sovereign Discovery & Mirroring (Fire and forget if needed, but we await settled for completeness)
        const sovereignTasks = [];
        const wrapDiscovery = (w, c) => SovereignDataService.discoverAndMirror(w, c)
            .catch(e => console.error(`[scanner] discovery failed for ${w}:`, e.message));

        if (chain === 'all' || chain === 'evm') {
            targetWallets.evm.forEach(w => sovereignTasks.push(wrapDiscovery(w, 'evm')));
        }
        if (chain === 'all' || chain === 'solana') {
            targetWallets.solana.forEach(w => sovereignTasks.push(wrapDiscovery(w, 'solana')));
        }
        
        // We set a hard timeout for sovereign discovery to prevent hanging the whole scanner
        await Promise.race([
            Promise.allSettled(sovereignTasks),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Sovereign discovery timeout')), 10000))
        ]).catch(e => console.warn('[scanner] sovereign discovery timed out or failed partially:', e.message));

        // 5. Assets from mirrored Sovereign DB
        if (chain === 'all' || chain === 'evm') {
            for (const evmWallet of targetWallets.evm) {
                const assets = getSovereignAssets(db, evmWallet);
                vestedPositions.push(...assets);
            }
        }
        if (chain === 'all' || chain === 'solana') {
            for (const solWallet of targetWallets.solana) {
                const assets = getSovereignAssets(db, solWallet);
                vestedPositions.push(...assets);
            }
        }

        // 5. Price enrichment (CoinGecko for EVM, Jupiter for Solana)
        let enriched = liquidTokens;
        enriched = await enrichWithCoinGeckoPrices(enriched);
        enriched = await enrichSolanaWithJupiterPrices(enriched);

        // 6. Summary calculations
        const totalLiquidUsd = enriched.reduce((acc, t) => acc + (t.valueUsd || 0), 0);
        const totalDefiUsd = defiPositions.reduce((acc, d) => acc + (d.valueUsd || 0), 0);
        const totalNetWorthUsd = totalLiquidUsd + totalDefiUsd;

        const chainBreakdown = {};
        for (const t of enriched) {
            chainBreakdown[t.chain] = (chainBreakdown[t.chain] || 0) + (t.valueUsd || 0);
        }
        for (const d of defiPositions) {
            chainBreakdown[d.chain] = (chainBreakdown[d.chain] || 0) + (d.valueUsd || 0);
        }

        const linkedWallets = {
            evm: [...targetWallets.evm],
            solana: [...targetWallets.solana]
        };

        const result = {
            wallet,
            linkedWallets,
            summary: {
                totalNetWorthUsd,
                totalLiquidUsd,
                totalDefiUsd,
                chainBreakdown
            },
            assets: {
                liquid: enriched,
                vested: vestedPositions,
                defi: defiPositions,
                nfts: nftPositions
            },
            meta: {
                scannedAt: new Date().toISOString(),
                hasDuneData: Boolean(process.env.DUNE_API_KEY),
                hasHeliusData: Boolean(process.env.HELIUS_API_KEY),
                evmRpc: EVM_CHAINS[0]?.rpc ? EVM_CHAINS[0].rpc.replace(/\/v2\/[^/]+/, '/v2/***') : null
            }
        };

        // Store in cache
        portfolioCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        // Resolve in-flight deduplication
        if (resolveInFlight) resolveInFlight(result);
        portfolioInFlight.delete(cacheKey);

        // Trim cache if too large
        if (portfolioCache.size > 1000) {
            const oldest = portfolioCache.keys().next().value;
            portfolioCache.delete(oldest);
        }

        return res.json({
            ok: true,
            ...result
        });
    } catch (err) {
        if (rejectInFlight) rejectInFlight(err);
        portfolioInFlight.delete(cacheKey);
        console.error('[scanner] portfolio error:', err.message, err.stack?.split('\n')[1]);
        return res.status(500).json({ ok: false, error: 'Scanner failed', detail: err.message });
    }
}

module.exports = router;
