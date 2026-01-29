import { useEffect, useMemo, useRef, useState } from 'react';
import { useChainId, usePublicClient } from 'wagmi';
import { formatValue } from '../../utils/format.js';
import {
  erc20Abi,
  getContractAddress,
  mockPriceFeedAbi
} from '../../utils/contracts.js';

const STATUS_OPTIONS = [
  { value: 'live', label: 'Live & trading' },
  { value: 'presale', label: 'Presale' },
  { value: 'estimate', label: 'Pre-launch estimate' },
  { value: 'unknown', label: 'Unknown' }
];

const PRICE_SOURCES = ['DEX', 'CEX', 'Oracle', 'Manual'];
const UNISWAP_V3_SUBGRAPH =
  'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const GECKO_TERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const USDC_MAINNET = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MIN_TWAP_SAMPLE_NOTE =
  'TWAP uses Uniswap V3 pool observe when available.';
const UNISWAP_POOL_ABI = [
  {
    name: 'observe',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'secondsAgos', type: 'uint32[]' }],
    outputs: [
      { name: 'tickCumulatives', type: 'int56[]' },
      { name: 'secondsPerLiquidityCumulativeX128s', type: 'uint160[]' }
    ]
  }
];

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatUsd = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : '0.00';

export default function TokenAssessment({ vestingDetails, ltvBps, onEstimate }) {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState('live');
  const [priceSource, setPriceSource] = useState('DEX');
  const [livePrice, setLivePrice] = useState('0.80');
  const [presalePrice, setPresalePrice] = useState('0.45');
  const [launchPrice, setLaunchPrice] = useState('0.60');
  const [liquidity, setLiquidity] = useState('2000000');
  const [volume, setVolume] = useState('750000');
  const [volatility, setVolatility] = useState('35');
  const [lockupMonths, setLockupMonths] = useState('6');
  const [tgeLockMonths, setTgeLockMonths] = useState('3');
  const [stakingLocked, setStakingLocked] = useState(false);
  const [tokenAddress, setTokenAddress] = useState('');
  const [totalSupply, setTotalSupply] = useState('100000000');
  const [circulatingSupply, setCirculatingSupply] = useState('25000000');
  const [inflationPct, setInflationPct] = useState('12');
  const [releasePctMonthly, setReleasePctMonthly] = useState('1.5');
  const [cliffMonths, setCliffMonths] = useState('3');
  const [trancheCount, setTrancheCount] = useState('6');
  const [trancheIntervalMonths, setTrancheIntervalMonths] = useState('1');
  const [tgeUnlockPct, setTgeUnlockPct] = useState('10');
  const [feedStatus, setFeedStatus] = useState('');
  const [isFetchingDex, setIsFetchingDex] = useState(false);
  const [isFetchingCex, setIsFetchingCex] = useState(false);
  const [twapSeconds, setTwapSeconds] = useState('3600');
  const [preferTwap, setPreferTwap] = useState(true);
  const [poolAddress, setPoolAddress] = useState('');
  const loadedKey = useRef('');

  const quantity = useMemo(() => {
    if (!vestingDetails?.quantity || vestingDetails?.tokenDecimals == null) {
      return 0;
    }
    const formatted = formatValue(
      vestingDetails.quantity,
      Number(vestingDetails.tokenDecimals)
    );
    const parsed = Number(formatted);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [vestingDetails]);

  const unlockLabel = useMemo(() => {
    if (!vestingDetails?.unlockTime) return 'Unknown';
    const date = new Date(Number(vestingDetails.unlockTime) * 1000);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  }, [vestingDetails]);

  useEffect(() => {
    if (vestingDetails?.tokenAddress) {
      setTokenAddress(vestingDetails.tokenAddress);
    }
  }, [vestingDetails]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tokenAddress) return;
    const key = `assessment:${chainId}:${tokenAddress.toLowerCase()}`;
    if (loadedKey.current === key) return;
    const raw = window.localStorage.getItem(key);
    loadedKey.current = key;
    if (!raw) return;
    try {
      const stored = JSON.parse(raw);
      if (!stored || typeof stored !== 'object') return;
      if (stored.status) setStatus(stored.status);
      if (stored.priceSource) setPriceSource(stored.priceSource);
      if (stored.livePrice) setLivePrice(stored.livePrice);
      if (stored.presalePrice) setPresalePrice(stored.presalePrice);
      if (stored.launchPrice) setLaunchPrice(stored.launchPrice);
      if (stored.liquidity) setLiquidity(stored.liquidity);
      if (stored.volume) setVolume(stored.volume);
      if (stored.volatility) setVolatility(stored.volatility);
      if (stored.lockupMonths) setLockupMonths(stored.lockupMonths);
      if (stored.tgeLockMonths) setTgeLockMonths(stored.tgeLockMonths);
      if (stored.stakingLocked !== undefined) {
        setStakingLocked(Boolean(stored.stakingLocked));
      }
      if (stored.totalSupply) setTotalSupply(stored.totalSupply);
      if (stored.circulatingSupply) setCirculatingSupply(stored.circulatingSupply);
      if (stored.inflationPct) setInflationPct(stored.inflationPct);
      if (stored.releasePctMonthly) setReleasePctMonthly(stored.releasePctMonthly);
      if (stored.cliffMonths) setCliffMonths(stored.cliffMonths);
      if (stored.trancheCount) setTrancheCount(stored.trancheCount);
      if (stored.trancheIntervalMonths) {
        setTrancheIntervalMonths(stored.trancheIntervalMonths);
      }
      if (stored.tgeUnlockPct) setTgeUnlockPct(stored.tgeUnlockPct);
      if (stored.twapSeconds) setTwapSeconds(stored.twapSeconds);
      if (stored.preferTwap !== undefined) {
        setPreferTwap(Boolean(stored.preferTwap));
      }
    } catch {
      // ignore malformed storage
    }
  }, [chainId, tokenAddress]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tokenAddress) return;
    const key = `assessment:${chainId}:${tokenAddress.toLowerCase()}`;
    const payload = {
      status,
      priceSource,
      livePrice,
      presalePrice,
      launchPrice,
      liquidity,
      volume,
      volatility,
      lockupMonths,
      tgeLockMonths,
      stakingLocked,
      totalSupply,
      circulatingSupply,
      inflationPct,
      releasePctMonthly,
      cliffMonths,
      trancheCount,
      trancheIntervalMonths,
      tgeUnlockPct,
      twapSeconds,
      preferTwap
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, [
    chainId,
    tokenAddress,
    status,
    priceSource,
    livePrice,
    presalePrice,
    launchPrice,
    liquidity,
    volume,
    volatility,
    lockupMonths,
    tgeLockMonths,
    stakingLocked,
    totalSupply,
    circulatingSupply,
    inflationPct,
    releasePctMonthly,
    cliffMonths,
    trancheCount,
    trancheIntervalMonths,
    tgeUnlockPct,
    twapSeconds,
    preferTwap
  ]);

  const fetchMockOraclePrice = async () => {
    const mockAddress = getContractAddress(chainId, 'mockPriceFeed');
    if (!mockAddress) {
      setFeedStatus('Mock oracle not configured for this chain.');
      return;
    }
    if (!publicClient) {
      setFeedStatus('Wallet client unavailable.');
      return;
    }
    setFeedStatus('Fetching mock oracle price...');
    try {
      const [decimals, roundData] = await Promise.all([
        publicClient.readContract({
          address: mockAddress,
          abi: mockPriceFeedAbi,
          functionName: 'decimals'
        }),
        publicClient.readContract({
          address: mockAddress,
          abi: mockPriceFeedAbi,
          functionName: 'latestRoundData'
        })
      ]);
      const price = Number(roundData[1]) / 10 ** Number(decimals);
      if (!Number.isFinite(price)) {
        setFeedStatus('Mock oracle returned invalid price.');
        return;
      }
      setLivePrice(String(price));
      setPriceSource('Oracle');
      setFeedStatus('Mock oracle price loaded.');
    } catch (error) {
      setFeedStatus('Mock oracle fetch failed.');
    }
  };

  const spotPriceForToken = (pool, token) => {
    const token0 = pool.token0.id.toLowerCase();
    const token1 = pool.token1.id.toLowerCase();
    if (token0 === token) return Number(pool.token0Price);
    if (token1 === token) return Number(pool.token1Price);
    return 0;
  };

  const twapPriceForToken = async (pool, token) => {
    if (!publicClient) return 0;
    const secondsAgo = Math.max(60, safeNumber(twapSeconds));
    const [tickCumulatives] = await publicClient.readContract({
      address: pool.id,
      abi: UNISWAP_POOL_ABI,
      functionName: 'observe',
      args: [[secondsAgo, 0]]
    });
    const tickDelta = Number(tickCumulatives[1] - tickCumulatives[0]);
    const avgTick = tickDelta / secondsAgo;
    const token0Decimals = await publicClient.readContract({
      address: pool.token0.id,
      abi: erc20Abi,
      functionName: 'decimals'
    });
    const token1Decimals = await publicClient.readContract({
      address: pool.token1.id,
      abi: erc20Abi,
      functionName: 'decimals'
    });
    const ratio = Math.pow(1.0001, avgTick);
    const decimalsAdj = Math.pow(
      10,
      Number(token0Decimals) - Number(token1Decimals)
    );
    const priceToken1PerToken0 = ratio * decimalsAdj;
    const token0 = pool.token0.id.toLowerCase();
    const token1 = pool.token1.id.toLowerCase();
    if (token0 === token) return priceToken1PerToken0;
    if (token1 === token) return 1 / priceToken1PerToken0;
    return 0;
  };

  const fetchCoinGeckoPrice = async () => {
    if (!tokenAddress) {
      setFeedStatus('Enter a token address to fetch.');
      return;
    }
    if (![1, 8453].includes(chainId)) {
      setFeedStatus('CoinGecko supports mainnet/Base contract prices only.');
      return;
    }
    setIsFetchingCex(true);
    setFeedStatus('Fetching CoinGecko price...');
    try {
      const platform = chainId === 8453 ? 'base' : 'ethereum';
      const url = `${COINGECKO_BASE}/simple/token_price/${platform}?contract_addresses=${tokenAddress}&vs_currencies=usd`;
      const response = await fetch(url);
      const data = await response.json();
      const price = data?.[tokenAddress.toLowerCase()]?.usd;
      if (!price) {
        setFeedStatus('CoinGecko: no price found for this address.');
      } else {
        setLivePrice(String(price));
        setPriceSource('CEX');
        setFeedStatus('CoinGecko price loaded.');
      }
    } catch (error) {
      setFeedStatus('CoinGecko fetch failed.');
    } finally {
      setIsFetchingCex(false);
    }
  };

  const fetchUniswapPrice = async () => {
    if (!tokenAddress) {
      setFeedStatus('Enter a token address to fetch.');
      return;
    }
    if (chainId !== 1) {
      setFeedStatus('Uniswap V3 TWAP requires Ethereum mainnet.');
      return;
    }
    setIsFetchingDex(true);
    setFeedStatus('Fetching Uniswap V3 pool...');
    try {
      const token = tokenAddress.toLowerCase();
      const usdc = USDC_MAINNET;
      const weth = WETH_MAINNET.toLowerCase();
      const query = {
        query: `query pools($token: String!, $usdc: String!, $weth: String!) {
          direct: pools(first: 1, orderBy: volumeUSD, orderDirection: desc, where: {
            token0_in: [$token, $usdc],
            token1_in: [$token, $usdc]
          }) {
            id
            token0 { id }
            token1 { id }
            token0Price
            token1Price
            volumeUSD
          }
          tokenWeth: pools(first: 1, orderBy: volumeUSD, orderDirection: desc, where: {
            token0_in: [$token, $weth],
            token1_in: [$token, $weth]
          }) {
            id
            token0 { id }
            token1 { id }
            token0Price
            token1Price
            volumeUSD
          }
          wethUsdc: pools(first: 1, orderBy: volumeUSD, orderDirection: desc, where: {
            token0_in: [$weth, $usdc],
            token1_in: [$weth, $usdc]
          }) {
            id
            token0 { id }
            token1 { id }
            token0Price
            token1Price
            volumeUSD
          }
        }`,
        variables: { token, usdc, weth }
      };
      const response = await fetch(UNISWAP_V3_SUBGRAPH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });
      const result = await response.json();
      const direct = result?.data?.direct?.[0];
      const tokenWeth = result?.data?.tokenWeth?.[0];
      const wethUsdc = result?.data?.wethUsdc?.[0];

      const updateFromPool = async (pool, label) => {
        setPoolAddress(pool.id);
        const price = preferTwap
          ? await twapPriceForToken(pool, token)
          : spotPriceForToken(pool, token);
        if (!Number.isFinite(price) || price <= 0) {
          setFeedStatus(`Uniswap V3: invalid ${label} price.`);
          return false;
        }
        setLivePrice(String(price));
        setPriceSource('DEX');
        setFeedStatus(`Uniswap V3 ${label} loaded.`);
        return true;
      };

      if (direct) {
        setFeedStatus('Fetching Uniswap V3 price...');
        await updateFromPool(direct, preferTwap ? 'TWAP' : 'spot');
        return;
      }

      if (tokenWeth && wethUsdc) {
        setFeedStatus('Fetching Uniswap V3 multi-hop price...');
        const tokenToWeth = preferTwap
          ? await twapPriceForToken(tokenWeth, token)
          : spotPriceForToken(tokenWeth, token);
        const wethToUsdc = preferTwap
          ? await twapPriceForToken(wethUsdc, weth)
          : spotPriceForToken(wethUsdc, weth);
        const price = tokenToWeth * wethToUsdc;
        if (!Number.isFinite(price) || price <= 0) {
          setFeedStatus('Uniswap V3: invalid multi-hop price.');
          return;
        }
        setLivePrice(String(price));
        setPriceSource('DEX');
        setPoolAddress(`${tokenWeth.id} + ${wethUsdc.id}`);
        setFeedStatus(`Uniswap V3 multi-hop ${preferTwap ? 'TWAP' : 'spot'} loaded.`);
        return;
      }

      setFeedStatus('Uniswap V3: no pools found for token/USDC or token/WETH.');
    } catch (error) {
      setFeedStatus('Uniswap V3 fetch failed.');
    } finally {
      setIsFetchingDex(false);
    }
  };

  const fetchDexTerminalPrice = async () => {
    if (!tokenAddress) {
      setFeedStatus('Enter a token address to fetch.');
      return;
    }
    const network =
      chainId === 8453 ? 'base' : chainId === 1 ? 'eth' : null;
    if (!network) {
      setFeedStatus('GeckoTerminal supports mainnet/Base tokens only.');
      return;
    }
    setIsFetchingDex(true);
    setFeedStatus('Fetching GeckoTerminal DEX price...');
    try {
      const url = `${GECKO_TERMINAL_BASE}/simple/networks/${network}/token_price/${tokenAddress}`;
      const response = await fetch(url);
      const data = await response.json();
      const price = data?.data?.attributes?.token_prices?.[tokenAddress.toLowerCase()];
      if (!price) {
        setFeedStatus('GeckoTerminal: no DEX price found.');
      } else {
        setLivePrice(String(price));
        setPriceSource('DEX');
        setFeedStatus('GeckoTerminal price loaded.');
      }
    } catch (error) {
      setFeedStatus('GeckoTerminal fetch failed.');
    } finally {
      setIsFetchingDex(false);
    }
  };

  const pricing = useMemo(() => {
    const live = safeNumber(livePrice);
    const presale = safeNumber(presalePrice);
    const launch = safeNumber(launchPrice);

    let basePrice = 0;
    if (status === 'live') {
      basePrice = live;
    } else if (status === 'presale') {
      basePrice = presale || launch || 0;
    } else if (status === 'estimate') {
      basePrice = launch || presale || 0;
    } else {
      basePrice = 0;
    }

    const liquidityUsd = safeNumber(liquidity);
    const volumeUsd = safeNumber(volume);
    const volatilityPct = safeNumber(volatility);
    const lockMonths = safeNumber(lockupMonths);
    const tgeMonths = safeNumber(tgeLockMonths);
    const cliff = safeNumber(cliffMonths);
    const tranches = Math.max(1, safeNumber(trancheCount));
    const trancheInterval = safeNumber(trancheIntervalMonths);
    const tgeUnlock = safeNumber(tgeUnlockPct);
    const total = safeNumber(totalSupply);
    const circulating = safeNumber(circulatingSupply);
    const inflation = safeNumber(inflationPct);
    const releaseMonthly = safeNumber(releasePctMonthly);

    const trancheSpan = (tranches - 1) * trancheInterval;
    const trancheWeighted = cliff + trancheSpan / 2;
    const scheduleMonths = lockMonths > 0 ? lockMonths : trancheWeighted;
    const effectiveLockMonths = Math.max(scheduleMonths, trancheWeighted);

    let liquidityCut = 1;
    if (status !== 'live') {
      liquidityCut = 0.6;
    } else if (liquidityUsd < 1_000_000) {
      liquidityCut = 0.5;
    } else if (liquidityUsd < 5_000_000) {
      liquidityCut = 0.7;
    } else if (liquidityUsd < 10_000_000) {
      liquidityCut = 0.85;
    } else {
      liquidityCut = 0.92;
    }

    let volumeCut = 1;
    if (status !== 'live') {
      volumeCut = 0.85;
    } else if (volumeUsd < 500_000) {
      volumeCut = 0.6;
    } else if (volumeUsd < 2_000_000) {
      volumeCut = 0.75;
    } else {
      volumeCut = 0.9;
    }

    let volatilityCut = 1;
    if (volatilityPct > 80) {
      volatilityCut = 0.6;
    } else if (volatilityPct > 50) {
      volatilityCut = 0.75;
    } else if (volatilityPct > 25) {
      volatilityCut = 0.85;
    } else {
      volatilityCut = 0.95;
    }

    let lockupCut = 1;
    if (effectiveLockMonths > 24) {
      lockupCut = 0.5;
    } else if (effectiveLockMonths > 12) {
      lockupCut = 0.65;
    } else if (effectiveLockMonths > 6) {
      lockupCut = 0.75;
    } else if (effectiveLockMonths > 3) {
      lockupCut = 0.85;
    } else {
      lockupCut = 0.95;
    }

    const tgeCut = tgeMonths > 0 ? 0.9 : 1;
    const stakingCut = stakingLocked ? 0.9 : 1;

    let statusCut = 1;
    if (status === 'presale') statusCut = 0.6;
    if (status === 'estimate') statusCut = 0.5;
    if (status === 'unknown') statusCut = 0.35;

    let tokenomicsCut = 1;
    if (total > 0 && circulating > 0) {
      const floatPct = circulating / total;
      if (floatPct < 0.1) tokenomicsCut *= 0.6;
      else if (floatPct < 0.2) tokenomicsCut *= 0.75;
      else if (floatPct < 0.4) tokenomicsCut *= 0.85;
    }
    if (inflation > 25) tokenomicsCut *= 0.7;
    else if (inflation > 15) tokenomicsCut *= 0.85;
    if (releaseMonthly > 3) tokenomicsCut *= 0.85;
    if (tgeUnlock > 25) tokenomicsCut *= 0.85;

    const haircut =
      liquidityCut *
      volumeCut *
      volatilityCut *
      lockupCut *
      tgeCut *
      stakingCut *
      statusCut *
      tokenomicsCut;
    const adjustedPrice = basePrice * haircut;
    const collateralValue = adjustedPrice * quantity;
    const maxLoan = collateralValue * (safeNumber(ltvBps) / 10000);

    return {
      basePrice,
      haircut,
      adjustedPrice,
      collateralValue,
      maxLoan,
      effectiveLockMonths
    };
  }, [
    livePrice,
    presalePrice,
    launchPrice,
    liquidity,
    volume,
    volatility,
    lockupMonths,
    tgeLockMonths,
    cliffMonths,
    trancheCount,
    trancheIntervalMonths,
    tgeUnlockPct,
    totalSupply,
    circulatingSupply,
    inflationPct,
    releasePctMonthly,
    stakingLocked,
    status,
    quantity,
    ltvBps
  ]);

  useEffect(() => {
    if (!onEstimate) return;
    onEstimate({
      maxLoan: pricing.maxLoan,
      adjustedPrice: pricing.adjustedPrice,
      haircut: pricing.haircut
    });
  }, [onEstimate, pricing.adjustedPrice, pricing.haircut, pricing.maxLoan]);

  return (
    <div className="holo-card">
      <h3 className="holo-title">Token Assessment</h3>
      <p className="muted">
        Simulate pricing inputs and apply risk haircuts to estimate loan value.
      </p>
      <div className="form-grid">
        <label className="form-field">
          Token Address
          <input
            className="form-input"
            value={tokenAddress}
            onChange={(event) => setTokenAddress(event.target.value)}
            placeholder="0x..."
          />
        </label>
        <label className="form-field">
          Token Status
          <select
            className="form-input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Price Source
          <select
            className="form-input"
            value={priceSource}
            onChange={(event) => setPriceSource(event.target.value)}
          >
            {PRICE_SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Uniswap V3
          <button
            className="button"
            type="button"
            onClick={fetchUniswapPrice}
            disabled={isFetchingDex}
          >
            {isFetchingDex ? 'Loading...' : 'Fetch DEX'}
          </button>
        </label>
        <label className="form-field">
          TWAP (seconds)
          <input
            className="form-input"
            value={twapSeconds}
            onChange={(event) => setTwapSeconds(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="form-field">
          Prefer TWAP
          <input
            type="checkbox"
            className="form-checkbox"
            checked={preferTwap}
            onChange={(event) => setPreferTwap(event.target.checked)}
          />
        </label>
        <label className="form-field">
          CoinGecko
          <button
            className="button"
            type="button"
            onClick={fetchCoinGeckoPrice}
            disabled={isFetchingCex}
          >
            {isFetchingCex ? 'Loading...' : 'Fetch CEX'}
          </button>
        </label>
        <label className="form-field">
          DEX (alt)
          <button
            className="button"
            type="button"
            onClick={fetchDexTerminalPrice}
            disabled={isFetchingDex}
          >
            {isFetchingDex ? 'Loading...' : 'GeckoTerminal'}
          </button>
        </label>
        <label className="form-field">
          Mock Oracle
          <button
            className="button"
            type="button"
            onClick={fetchMockOraclePrice}
          >
            Testnet Price
          </button>
        </label>
        <label className="form-field">
          Live Price (USD)
          <input
            className="form-input"
            value={livePrice}
            onChange={(event) => setLivePrice(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Presale Price (USD)
          <input
            className="form-input"
            value={presalePrice}
            onChange={(event) => setPresalePrice(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Expected Launch (USD)
          <input
            className="form-input"
            value={launchPrice}
            onChange={(event) => setLaunchPrice(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          DEX Liquidity (USD)
          <input
            className="form-input"
            value={liquidity}
            onChange={(event) => setLiquidity(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          24h Volume (USD)
          <input
            className="form-input"
            value={volume}
            onChange={(event) => setVolume(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Volatility (0-100)
          <input
            className="form-input"
            value={volatility}
            onChange={(event) => setVolatility(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Total Supply
          <input
            className="form-input"
            value={totalSupply}
            onChange={(event) => setTotalSupply(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Circulating Supply
          <input
            className="form-input"
            value={circulatingSupply}
            onChange={(event) => setCirculatingSupply(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Inflation (%/yr)
          <input
            className="form-input"
            value={inflationPct}
            onChange={(event) => setInflationPct(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Release (%/mo)
          <input
            className="form-input"
            value={releasePctMonthly}
            onChange={(event) => setReleasePctMonthly(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Lockup (months)
          <input
            className="form-input"
            value={lockupMonths}
            onChange={(event) => setLockupMonths(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="form-field">
          TGE Lock (months)
          <input
            className="form-input"
            value={tgeLockMonths}
            onChange={(event) => setTgeLockMonths(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="form-field">
          Cliff (months)
          <input
            className="form-input"
            value={cliffMonths}
            onChange={(event) => setCliffMonths(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="form-field">
          Tranches
          <input
            className="form-input"
            value={trancheCount}
            onChange={(event) => setTrancheCount(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="form-field">
          Tranche Interval (mo)
          <input
            className="form-input"
            value={trancheIntervalMonths}
            onChange={(event) => setTrancheIntervalMonths(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="form-field">
          TGE Unlock (%)
          <input
            className="form-input"
            value={tgeUnlockPct}
            onChange={(event) => setTgeUnlockPct(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Staking Locked
          <input
            type="checkbox"
            className="form-checkbox"
            checked={stakingLocked}
            onChange={(event) => setStakingLocked(event.target.checked)}
          />
        </label>
      </div>
      <div className="stack">
        <div className="pill">
          Vesting Amount: {quantity ? quantity.toLocaleString() : '—'}
        </div>
        <div className="pill">Unlock: {unlockLabel}</div>
        <div className="pill">
          Effective Lock: {pricing.effectiveLockMonths.toFixed(1)} months
        </div>
        <div className="pill">Base Price: ${formatUsd(pricing.basePrice)}</div>
        <div className="pill">Haircut: {(pricing.haircut * 100).toFixed(1)}%</div>
        <div className="pill">
          Risk-Adjusted Price: ${formatUsd(pricing.adjustedPrice)}
        </div>
        <div className="pill">
          Collateral Value: ${formatUsd(pricing.collateralValue)}
        </div>
        <div className="pill">
          Max Loan @ LTV: ${formatUsd(pricing.maxLoan)}
        </div>
        {poolAddress && (
          <div className="muted">Uniswap Pool: {poolAddress}</div>
        )}
        {feedStatus && <div className="muted">{feedStatus}</div>}
        <div className="muted">{MIN_TWAP_SAMPLE_NOTE}</div>
        <div className="muted">Source: {priceSource}</div>
      </div>
    </div>
  );
}
