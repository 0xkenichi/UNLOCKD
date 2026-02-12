import { useEffect, useMemo, useRef, useState } from 'react';
import { useChainId, usePublicClient, useReadContract } from 'wagmi';
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

const inverseNormal = (p) => {
  if (p <= 0 || p >= 1) return 0;
  const a = [
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.357751867269,
    -30.66479806614716,
    2.506628277459239
  ];
  const b = [
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572
  ];
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783
  ];
  const d = [
    0.007784695709041462,
    0.3224671290700398,
    2.445134137142996,
    3.754408661907416
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  const q = p - 0.5;
  const r = q * q;
  return (
    (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
};

const lognormalPricePercentile = (price, sigma, tYears, percentile) => {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(sigma) || tYears <= 0) {
    return 0;
  }
  const z = inverseNormal(percentile);
  const drift = -0.5 * sigma * sigma * tYears;
  const diffusion = sigma * Math.sqrt(tYears) * z;
  return price * Math.exp(drift + diffusion);
};

export default function TokenAssessment({ vestingDetails, ltvBps, onEstimate }) {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const tokenAddr = vestingDetails?.tokenAddress;
  const { data: tokenSymbol } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'symbol',
    query: { enabled: Boolean(tokenAddr) }
  });
  const { data: tokenName } = useReadContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'name',
    query: { enabled: Boolean(tokenAddr) }
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const applyConservativeDefaults = () => {
    setStatus('live');
    setPriceSource('DEX');
    setLivePrice('0.80');
    setPresalePrice('0.45');
    setLaunchPrice('0.60');
    setLiquidity('2000000');
    setVolume('750000');
    setVolatility('35');
    setLockupMonths('6');
    setTgeLockMonths('3');
    setStakingLocked(false);
    setTotalSupply('100000000');
    setCirculatingSupply('25000000');
    setInflationPct('12');
    setReleasePctMonthly('1.5');
    setCliffMonths('3');
    setTrancheCount('6');
    setTrancheIntervalMonths('1');
    setTgeUnlockPct('10');
    setTwapSeconds('3600');
    setPreferTwap(true);
    setShowAdvanced(false);
  };

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

    const structuralHaircut =
      liquidityCut *
      volumeCut *
      tgeCut *
      stakingCut *
      statusCut *
      tokenomicsCut;
    const marketHaircut = volatilityCut * lockupCut;
    const haircut = structuralHaircut * marketHaircut;
    const adjustedPrice = basePrice * haircut;
    const collateralValue = adjustedPrice * quantity;
    const maxLoan = collateralValue * (safeNumber(ltvBps) / 10000);

    const sigma = volatilityPct / 100;
    const tYears = Math.max(effectiveLockMonths, 0) / 12;
    const p1Price = lognormalPricePercentile(basePrice, sigma, tYears, 0.01);
    const p5Price = lognormalPricePercentile(basePrice, sigma, tYears, 0.05);
    const p1AdjPrice = p1Price * structuralHaircut;
    const p5AdjPrice = p5Price * structuralHaircut;
    const p1Collateral = p1AdjPrice * quantity;
    const p5Collateral = p5AdjPrice * quantity;
    const coverageP1 = maxLoan > 0 ? p1Collateral / maxLoan : 0;
    const coverageP5 = maxLoan > 0 ? p5Collateral / maxLoan : 0;

    return {
      basePrice,
      haircut,
      adjustedPrice,
      collateralValue,
      maxLoan,
      effectiveLockMonths,
      p1AdjPrice,
      p5AdjPrice,
      coverageP1,
      coverageP5
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
      haircut: pricing.haircut,
      coverageP1: pricing.coverageP1,
      coverageP5: pricing.coverageP5,
      p1AdjPrice: pricing.p1AdjPrice,
      p5AdjPrice: pricing.p5AdjPrice
    });
  }, [
    onEstimate,
    pricing.adjustedPrice,
    pricing.haircut,
    pricing.maxLoan,
    pricing.coverageP1,
    pricing.coverageP5,
    pricing.p1AdjPrice,
    pricing.p5AdjPrice
  ]);

  const tokenLabel = useMemo(() => {
    if (!tokenAddr) return null;
    if (tokenSymbol || tokenName) {
      const sym = tokenSymbol || tokenName || '—';
      const name = tokenName && tokenName !== tokenSymbol ? tokenName : '';
      return name ? `${sym} (${name})` : String(sym);
    }
    return `${tokenAddr.slice(0, 6)}…${tokenAddr.slice(-4)}`;
  }, [tokenAddr, tokenSymbol, tokenName]);

  const hasVestingData = Boolean(quantity || tokenAddr || vestingDetails?.unlockTime);

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Token Assessment</h3>
          <div className="section-subtitle">
            Simulate pricing inputs and apply risk haircuts.
          </div>
        </div>
        <span className="chip">{priceSource}</span>
      </div>
      {hasVestingData && (
        <div className="stat-row" style={{ marginBottom: 16 }}>
          <div className="stat-card" style={{ minWidth: 200 }}>
            <div className="stat-label">Vesting Token</div>
            <div className="stat-value">{tokenLabel || (tokenAddr ? `${tokenAddr.slice(0, 8)}…` : '—')}</div>
            <div className="stat-delta">{tokenAddr ? `0x…${tokenAddr.slice(-6)}` : 'From Borrow Actions'}</div>
          </div>
          <div className="stat-card" style={{ minWidth: 140 }}>
            <div className="stat-label">Amount</div>
            <div className="stat-value">
              {quantity ? quantity.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
            </div>
            <div className="stat-delta">{tokenSymbol ? tokenSymbol : ''}</div>
          </div>
          <div className="stat-card" style={{ minWidth: 180 }}>
            <div className="stat-label">Unlock</div>
            <div className="stat-value" style={{ fontSize: '0.95rem' }}>
              {unlockLabel !== 'Unknown' ? new Date(Number(vestingDetails?.unlockTime) * 1000).toLocaleDateString() : '—'}
            </div>
            <div className="stat-delta">{vestingDetails?.verified ? 'Verified' : 'Preview'}</div>
          </div>
        </div>
      )}
      {!hasVestingData && (
        <div className="muted" style={{ marginBottom: 16 }}>
          Enter a collateral ID and vesting contract in Borrow Actions, then escrow or use a pre-seeded position.
        </div>
      )}
      <div className="inline-actions">
        <button className="button ghost" type="button" onClick={applyConservativeDefaults}>
          Auto-fill Conservative
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
        </button>
      </div>
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
          Live Price (USD)
          <input
            className="form-input"
            value={livePrice}
            onChange={(event) => setLivePrice(event.target.value)}
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
          Circulating Supply
          <input
            className="form-input"
            value={circulatingSupply}
            onChange={(event) => setCirculatingSupply(event.target.value)}
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
      </div>
      {showAdvanced && (
        <div className="form-grid">
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
          TGE Lock (months)
          <input
            className="form-input"
            value={tgeLockMonths}
            onChange={(event) => setTgeLockMonths(event.target.value)}
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
      )}
      <div className="section-head">
        <div>
          <h3 className="section-title">Price Feeds</h3>
          <div className="section-subtitle">DEX / CEX / Oracle sources</div>
        </div>
        <span className="tag">Live</span>
      </div>
      <div className="inline-actions">
        <button
          className="button ghost"
          type="button"
          onClick={fetchUniswapPrice}
          disabled={isFetchingDex}
        >
          {isFetchingDex ? 'Loading...' : 'Uniswap V3'}
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={fetchDexTerminalPrice}
          disabled={isFetchingDex}
        >
          {isFetchingDex ? 'Loading...' : 'GeckoTerminal'}
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={fetchCoinGeckoPrice}
          disabled={isFetchingCex}
        >
          {isFetchingCex ? 'Loading...' : 'CoinGecko'}
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={fetchMockOraclePrice}
        >
          Mock Oracle
        </button>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Vesting Amount</div>
          <div className="stat-value">
            {quantity ? quantity.toLocaleString() : '—'}
          </div>
          <div className="stat-delta">Unlock: {unlockLabel}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Risk Haircut</div>
          <div className="stat-value">
            {(pricing.haircut * 100).toFixed(1)}%
          </div>
          <div className="stat-delta">
            Effective lock: {pricing.effectiveLockMonths.toFixed(1)} mo
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Adj Price</div>
          <div className="stat-value">${formatUsd(pricing.adjustedPrice)}</div>
          <div className="stat-delta">Base ${formatUsd(pricing.basePrice)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Max Loan</div>
          <div className="stat-value">${formatUsd(pricing.maxLoan)}</div>
          <div className="stat-delta">
            Collateral ${formatUsd(pricing.collateralValue)}
          </div>
        </div>
      </div>
      {poolAddress && <div className="muted">Uniswap Pool: {poolAddress}</div>}
      {feedStatus && <div className="muted">{feedStatus}</div>}
      <div className="muted">{MIN_TWAP_SAMPLE_NOTE}</div>
    </div>
  );
}
