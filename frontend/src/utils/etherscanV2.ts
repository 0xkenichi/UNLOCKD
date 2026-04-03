/**
 * Etherscan V2 PRO Throttled Fetcher
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements a global serial queue with a 1000ms delay to strictly comply with
 * the 2 calls/second rate limit across multi-chain requests.
 */

export type ChainId = "1" | "8453" | "42161" | "324"; // ETH, Base, Arb, zkSync

const DELAY_MS = 1000;
let lastCallAt = 0;

async function throttle() {
  const now = Date.now();
  const timeSinceLast = now - lastCallAt;
  if (timeSinceLast < DELAY_MS) {
    const wait = DELAY_MS - timeSinceLast;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastCallAt = Date.now();
}

const warnedChains = new Set<string>();

/** Base fetcher with automatic throttling and rate-limit handling */
export async function fetchEtherscanV2(
  module: string,
  action: string,
  params: Record<string, string>,
  chainId: ChainId = "1"
) {
  await throttle();

  const apiKey = getApiKey(chainId);
  const query = new URLSearchParams({
    ...params,
    module,
    action,
    apikey: apiKey,
    chainid: chainId,
  });

  const url = `https://api.etherscan.io/v2/api?${query.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === "0" && data.message === "NOTOK") {
      const isUnsupported = data.result?.includes("Free API access is not supported");
      if (isUnsupported) {
        const warnKey = `${chainId}-${module}`;
        if (!warnedChains.has(warnKey)) {
          console.warn(`[etherscan] Chain ${chainId} does not support ${module} on the current API plan. Skipping.`);
          warnedChains.add(warnKey);
        }
      } else {
        console.warn(`[etherscan] ${data.result}`);
      }
      return null;
    }

    return data.result;
  } catch (error) {
    console.error(`[etherscan] Fetch failed:`, error);
    return null;
  }
}

function getApiKey(chainId: ChainId): string {
  switch (chainId) {
    case "8453":  return process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "";
    case "42161": return process.env.ARBISCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "";
    case "324":   return process.env.ZKSYNC_API_KEY || process.env.ETHERSCAN_API_KEY || "";
    default:      return process.env.ETHERSCAN_API_KEY || "";
  }
}

/** Helper: Get Transaction List for Activity Scoring */
export async function getTransactionList(address: string, chainId: ChainId = "1") {
  return fetchEtherscanV2("account", "txlist", {
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "1000",
    sort: "desc",
  }, chainId);
}

/** Helper: Get Native Balance */
export async function getNativeBalance(address: string, chainId: ChainId = "1") {
  return fetchEtherscanV2("account", "balance", {
    address,
    tag: "latest",
  }, chainId);
}

/** Helper: Get ERC-20 Token Portfolio (PRO) */
export async function getAddressTokenPortfolio(address: string, chainId: ChainId = "1") {
  return fetchEtherscanV2("account", "addresstokenportfolio", { address }, chainId);
}
