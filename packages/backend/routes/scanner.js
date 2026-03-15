// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
// GET /api/scanner/portfolio/:wallet
// Zapper/Zerion-style multi-chain asset aggregator
// Real APIs: Alchemy (EVM), Helius (Solana), Dune Analytics (DeFi), CoinGecko + Jupiter (prices)

const express = require('express');
const SovereignDataService = require('../lib/SovereignDataService');

const router = express.Router();

// ─── Config ──────────────────────────────────────────────────────────────────
// Alchemy: Both Sepolia (testnet) and Mainnet are supported.
// If you want mainnet, set ALCHEMY_MAINNET_URL in your .env
const ALCHEMY_SEPOLIA_URL = process.env.ALCHEMY_SEPOLIA_URL ||
    (process.env.ALCHEMY_ACCOUNT_KIT_RPC_URL) || '';
const ALCHEMY_MAINNET_URL = process.env.ALCHEMY_MAINNET_URL ||
    (process.env.ALCHEMY_ACCOUNT_KIT_RPC_URL
        ? process.env.ALCHEMY_ACCOUNT_KIT_RPC_URL.replace('sepolia', 'mainnet').replace('-sepolia', '')
        : '');

// Helius is the best free Solana API: https://helius.dev (sign up for free key)
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const HELIUS_BASE = 'https://mainnet.helius-rpc.com';
const HELIUS_REST = 'https://api.helius.xyz/v0';

// Dune Analytics: create an account at dune.com, get a free API key via Settings > API
const DUNE_API_KEY = process.env.DUNE_API_KEY || '';

// Solana public RPC fallback (mainnet)
const SOLANA_MAINNET_RPC = process.env.VITE_SOLANA_MAINNET_RPC ||
    `${HELIUS_BASE}/?api-key=${HELIUS_API_KEY}` ||
    'https://api.mainnet-beta.solana.com';

// Use testnet for EVM when mainnet URL is unavailable
const EVM_RPC = ALCHEMY_MAINNET_URL || ALCHEMY_SEPOLIA_URL;

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
async function getEvmTokenBalances(wallet) {
    if (!EVM_RPC) return [];
    try {
        // 1. Get all ERC-20 token balances
        const res = await safeFetch(EVM_RPC, {
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
            console.warn(`[scanner] Alchemy token balances HTTP ${res.status}`);
            return [];
        }
        const data = await res.json();
        const rawBalances = (data?.result?.tokenBalances || []).filter(
            (t) => t.tokenBalance && t.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000'
        );

        if (!rawBalances.length) return [];

        // 2. Enrich with metadata via alchemy_getTokenMetadata (batched in parallel)
        const enriched = await Promise.allSettled(
            rawBalances.map(async (token) => {
                try {
                    const metaRes = await safeFetch(EVM_RPC, {
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
                    return {
                        chain: 'evm',
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
            })
        );

        return enriched
            .filter((r) => r.status === 'fulfilled' && r.value)
            .map((r) => r.value);
    } catch (err) {
        console.warn('[scanner] EVM token fetch failed:', err.message);
        return [];
    }
}

// ─── EVM: Native ETH balance ──────────────────────────────────────────────────
async function getEvmNativeBalance(wallet) {
    if (!EVM_RPC) return null;
    try {
        const res = await safeFetch(EVM_RPC, {
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
        return {
            chain: 'evm',
            category: 'liquid',
            contractAddress: 'native',
            symbol: 'ETH',
            name: 'Ether',
            decimals: 18,
            balance,
            logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
            priceUsd: 0,
            valueUsd: 0
        };
    } catch (err) {
        console.warn('[scanner] EVM native balance failed:', err.message);
        return null;
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
    if (!DUNE_API_KEY) return null;
    try {
        // Execute query
        const execRes = await safeFetch(`https://api.dune.com/api/v1/query/${queryId}/execute`, {
            method: 'POST',
            headers: {
                'X-Dune-API-Key': DUNE_API_KEY,
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
                { headers: { 'X-Dune-API-Key': DUNE_API_KEY } },
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
    if (!DUNE_API_KEY) return [];

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
    const { wallet } = req.params;
    const { chain = 'all' } = req.query;
    const db = req.app.locals?.db || null;
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

        // 2. EVM scans
        if (chain === 'all' || chain === 'evm') {
            for (const evmWallet of targetWallets.evm) {
                scanTasks.push(
                    Promise.allSettled([
                        getEvmTokenBalances(evmWallet),
                        getEvmNativeBalance(evmWallet),
                        getDuneDefiPositions(evmWallet)
                    ])
                );
            }
        }

        // 3. Solana scans
        if (chain === 'all' || chain === 'solana') {
            for (const solWallet of targetWallets.solana) {
                scanTasks.push(
                    getSolanaBalancesHelius(solWallet).then((tokens) => [
                        { status: 'fulfilled', value: tokens },
                        { status: 'fulfilled', value: null },
                        { status: 'fulfilled', value: [] }
                    ])
                );
            }
        }

        const allResults = await Promise.allSettled(scanTasks);

        const defiPositions = [];
        const vestedPositions = [];

        for (const result of allResults) {
            if (result.status !== 'fulfilled') continue;
            const [tokensResult, nativeResult, defiResult] = result.value || [];

            if (tokensResult?.status === 'fulfilled' && Array.isArray(tokensResult.value)) {
                liquidTokens.push(...tokensResult.value);
            }
            if (nativeResult?.status === 'fulfilled' && nativeResult.value) {
                liquidTokens.push(nativeResult.value);
            }
            if (defiResult?.status === 'fulfilled' && Array.isArray(defiResult.value)) {
                defiPositions.push(...defiResult.value);
            }
        }

        // 4. Sovereign Discovery & Mirroring
        const sovereignTasks = [];
        if (chain === 'all' || chain === 'evm') {
            targetWallets.evm.forEach(w => sovereignTasks.push(SovereignDataService.discoverAndMirror(w, 'evm')));
        }
        if (chain === 'all' || chain === 'solana') {
            targetWallets.solana.forEach(w => sovereignTasks.push(SovereignDataService.discoverAndMirror(w, 'solana')));
        }
        await Promise.allSettled(sovereignTasks);

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

        return res.json({
            ok: true,
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
                defi: defiPositions
            },
            meta: {
                scannedAt: new Date().toISOString(),
                hasDuneData: Boolean(DUNE_API_KEY),
                hasHeliusData: Boolean(HELIUS_API_KEY),
                evmRpc: EVM_RPC ? EVM_RPC.replace(/\/v2\/[^/]+/, '/v2/***') : null
            }
        });
    } catch (err) {
        console.error('[scanner] portfolio error:', err.message, err.stack?.split('\n')[1]);
        return res.status(500).json({ ok: false, error: 'Scanner failed', detail: err.message });
    }
});

module.exports = router;
