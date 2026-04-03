import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseEnvFile(filePath) {
  const content = readFileSafe(filePath);
  const map = new Map();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    map.set(key, value);
  }
  return map;
}

function hasToken(filePath, token) {
  return readFileSafe(filePath).includes(token);
}

function printResult(status, label, detail = '') {
  const icon = status ? 'PASS' : 'FAIL';
  const line = `${icon} ${label}`;
  console.log(detail ? `${line} - ${detail}` : line);
}

function main() {
  const envPath = path.join(ROOT, '.env');
  const envExamplePath = path.join(ROOT, '.env.example');
  const env = parseEnvFile(envPath);
  const envExample = parseEnvFile(envExamplePath);

  const requiredEnv = [
    'VITE_BACKEND_URL',
    'VITE_ALCHEMY_ACCOUNT_KIT_API_KEY'
  ];
  const recommendedEnv = ['VITE_ALCHEMY_ACCOUNT_KIT_POLICY_ID'];

  let failed = 0;
  console.log('VESTRA Frontend Health Check');
  console.log(`Root: ${ROOT}`);

  const envExists = fs.existsSync(envPath);
  printResult(envExists, '.env present', envPath);
  if (!envExists) failed += 1;

  for (const key of requiredEnv) {
    const value = env.get(key);
    const ok = Boolean(value);
    printResult(ok, `env ${key}`, ok ? 'configured' : 'missing or empty');
    if (!ok) failed += 1;
  }

  for (const key of recommendedEnv) {
    const value = env.get(key);
    const ok = Boolean(value);
    // Advisory only: policy is optional in current runtime wiring.
    printResult(true, `env ${key} (recommended)`, ok ? 'configured' : 'optional, currently empty');
  }

  for (const key of [...requiredEnv, ...recommendedEnv]) {
    const exampleHasKey = envExample.has(key);
    printResult(exampleHasKey, `.env.example ${key}`, exampleHasKey ? 'documented' : 'missing');
    if (!exampleHasKey) failed += 1;
  }

  const mainPath = path.join(SRC, 'main.jsx');
  const lenderPath = path.join(SRC, 'pages', 'Lender.jsx');
  const cardPath = path.join(SRC, 'components', 'lender', 'SmartWalletOnboardingCard.jsx');
  const actionsPath = path.join(SRC, 'components', 'lender', 'AlchemySmartWalletActions.jsx');

  const wiringChecks = [
    [mainPath, 'AlchemyAccountProvider', 'Account Kit provider wiring'],
    [mainPath, 'createAlchemyConfig', 'Account Kit config creation'],
    [mainPath, 'VITE_ALCHEMY_ACCOUNT_KIT_API_KEY', 'Account Kit env gate'],
    [lenderPath, 'walletSource', 'Lender wallet source preference'],
    [cardPath, 'crdt-open-smart-wallet-auth', 'Smart-wallet-first CTA event'],
    [actionsPath, 'useAuthModal', 'Account Kit auth modal hook']
  ];

  for (const [filePath, token, label] of wiringChecks) {
    const ok = hasToken(filePath, token);
    printResult(ok, label, ok ? path.relative(ROOT, filePath) : `missing token: ${token}`);
    if (!ok) failed += 1;
  }

  console.log('');
  if (failed > 0) {
    console.error(`Health check failed with ${failed} issue(s).`);
    process.exit(1);
  }
  console.log('Health check passed. Demo/apply readiness looks good.');
}

main();
