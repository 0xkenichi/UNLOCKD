/* eslint-disable no-console */
const REQUIRED_BY_NETWORK = {
  base: ['PRIVATE_KEY', 'USDC_ADDRESS', 'PRICE_FEED_ADDRESS', 'UNISWAP_ROUTER_ADDRESS'],
  baseSepolia: ['PRIVATE_KEY'],
  sepolia: ['PRIVATE_KEY'],
  flowEvm: ['PRIVATE_KEY', 'USDC_ADDRESS', 'PRICE_FEED_ADDRESS', 'UNISWAP_ROUTER_ADDRESS'],
  flowEvmTestnet: ['PRIVATE_KEY']
};

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function mask(value) {
  if (!value) return '(missing)';
  const v = String(value);
  if (v.length <= 8) return '********';
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function main() {
  const network = readArg('--network');
  if (!network) {
    console.error('Missing --network. Example: node scripts/check-deploy-env.js --network baseSepolia');
    process.exit(1);
  }
  const required = REQUIRED_BY_NETWORK[network];
  if (!required) {
    console.error(
      `Unsupported network "${network}". Supported: ${Object.keys(REQUIRED_BY_NETWORK).join(', ')}`
    );
    process.exit(1);
  }

  const missing = [];
  console.log(`Checking deploy env for ${network}...`);
  required.forEach((key) => {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
      console.log(`- ${key}: (missing)`);
    } else {
      console.log(`- ${key}: ${mask(value)}`);
    }
  });

  if (missing.length) {
    console.error('\nMissing required variables:');
    missing.forEach((k) => console.error(`- ${k}`));
    process.exit(1);
  }
  console.log('\nEnvironment looks ready.');
}

main();

