/**
 * Sync hardhat-deploy contract addresses into `frontend/src/utils/contracts.js`.
 *
 * Usage:
 *   node scripts/sync-frontend-contracts.js --network baseSepolia
 *   node scripts/sync-frontend-contracts.js --network base
 *   node scripts/sync-frontend-contracts.js --network flowEvmTestnet
 *   node scripts/sync-frontend-contracts.js --network flowEvm
 *
 * This updates only the default address map (env overrides still take precedence).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function loadDeploymentAddress(deploymentsDir, name) {
  const filePath = path.join(deploymentsDir, `${name}.json`);
  if (!fileExists(filePath)) return null;
  const json = readJson(filePath);
  const addr = json && typeof json.address === 'string' ? json.address : null;
  return addr && addr.startsWith('0x') ? addr : null;
}

function updateContractsBlock(source, blockKey, updates) {
  const anchor = `  [${blockKey}.id]: {`;
  const start = source.indexOf(anchor);
  if (start === -1) {
    throw new Error(`Cannot find contracts block for ${blockKey} (missing: ${anchor})`);
  }

  // Find block end by scanning braces from the first '{' after the anchor.
  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) throw new Error(`Malformed block for ${blockKey}: '{' not found`);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`Malformed block for ${blockKey}: '}' not found`);

  const before = source.slice(0, braceStart);
  const block = source.slice(braceStart, end + 1);
  const after = source.slice(end + 1);

  let nextBlock = block;
  for (const [key, value] of Object.entries(updates)) {
    if (!value) continue;
    // Replace `key: '...'` inside this block.
    const re = new RegExp(`(\\b${key}\\b\\s*:\\s*)'[^']*'`);
    if (!re.test(nextBlock)) {
      console.warn(`[sync] warning: key not found in ${blockKey} block: ${key}`);
      continue;
    }
    nextBlock = nextBlock.replace(re, `$1'${value}'`);
  }

  return `${before}${nextBlock}${after}`;
}

async function main() {
  const network = readArg('--network');
  if (!network) {
    console.error('Missing --network (expected: sepolia | baseSepolia | base | flowEvmTestnet | flowEvm)');
    process.exit(1);
  }

  const blockKey =
    network === 'sepolia'
      ? 'sepolia'
      : network === 'baseSepolia'
        ? 'baseSepolia'
        : network === 'base'
          ? 'base'
          : network === 'flowEvmTestnet'
            ? 'flowEvmTestnet'
            : network === 'flowEvm'
              ? 'flowEvm'
              : null;
  if (!blockKey) {
    console.error(
      `Unsupported network: ${network}. Supported: sepolia, baseSepolia, base, flowEvmTestnet, flowEvm.`
    );
    process.exit(1);
  }

  const deploymentsDir = path.join(ROOT, 'deployments', network);
  if (!fileExists(deploymentsDir)) {
    console.error(`Deployments dir not found: ${deploymentsDir}`);
    process.exit(1);
  }

  const updates = {
    valuationEngine: loadDeploymentAddress(deploymentsDir, 'ValuationEngine'),
    loanManager: loadDeploymentAddress(deploymentsDir, 'LoanManager'),
    lendingPool: loadDeploymentAddress(deploymentsDir, 'LendingPool'),
    vestingAdapter: loadDeploymentAddress(deploymentsDir, 'VestingAdapter'),
    termVault: loadDeploymentAddress(deploymentsDir, 'TermVault'),
    usdc: loadDeploymentAddress(deploymentsDir, 'MockUSDC'),
    testnetPriceFeed: loadDeploymentAddress(deploymentsDir, 'MockPriceFeed')
  };

  const targetPath = path.join(ROOT, 'frontend', 'src', 'utils', 'contracts.js');
  const source = fs.readFileSync(targetPath, 'utf8');
  const next = updateContractsBlock(source, blockKey, updates);
  if (next === source) {
    console.log('[sync] no changes to apply');
    return;
  }
  fs.writeFileSync(targetPath, next, 'utf8');
  console.log(`[sync] updated ${targetPath} from deployments/${network}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

