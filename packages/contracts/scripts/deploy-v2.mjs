#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Deploy and wire the Vestra v2 loan book without Foundry: compile with solc, deploy with ethers.
 *
 *   node scripts/deploy-v2.mjs            # deploy to RPC_URL with PRIVATE_KEY
 *   node scripts/deploy-v2.mjs --dry-run  # the same steps on a local in-process chain (EDR)
 *
 * Environment (same names as script/DeployV2.s.sol):
 *   RPC_URL         JSON-RPC endpoint (Sepolia)                     required unless --dry-run
 *   PRIVATE_KEY     deployer key; keeps every role unless GOVERNOR  required unless --dry-run
 *   SOLC            path to a solc 0.8.20 binary                    required
 *   USDC_ADDRESS    USDC or MockUSDC; deployed fresh if unset and DEPLOY_MOCKS=1
 *   FEE_RECIPIENT   treasury (default: deployer)
 *   GUARDIAN        pause and Ω (default: deployer)
 *   RISK_POSTER     posts σ, volume, drag (default: deployer)
 *   GOVERNOR        final governor (timelock + multisig); if set, every governor and admin role is
 *                   handed over and the deployer renounces them
 *   DEPLOY_MOCKS=1  also deploy MockProjectToken, MockPriceFeed ($1) and MockSablierV2Lockup, list the
 *                   token (σ floor 30%, Ω 100%), post risk (σ 80%, $5M volume, no drag), grant the
 *                   deployer the paydown-buyer role, and stream DEMO_TOKENS (default 100,000) over a
 *                   year to DEMO_RECIPIENT (default: deployer)
 *
 * Writes deployments/v2-<chainId>.json and prints the VITE_/NEXT_PUBLIC_ lines the apps read.
 * Private keys are read from the environment only and never written anywhere.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const dryRun = process.argv.includes('--dry-run');

// ethers 6: from this package if installed, else from the apps in this repo.
function loadEthers() {
  for (const p of ['ethers', join(root, '..', '..', 'frontend-legacy', 'node_modules', 'ethers'), join(root, '..', '..', 'backend', 'node_modules', 'ethers')]) {
    try { return require(p); } catch {}
  }
  throw new Error('ethers 6 not found: npm i ethers in packages/contracts');
}
const ethers = loadEthers();

// ── Compile ──────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.sol')) out.push(p);
  }
  return out;
}

function compile() {
  const solc = process.env.SOLC;
  if (!solc) throw new Error('set SOLC to a solc 0.8.20 binary');
  const files = walk(join(root, 'src')).filter((f) => !f.includes('/anchor/'));
  const sources = Object.fromEntries(files.map((f) => [f.slice(root.length + 1), { urls: [f.slice(root.length + 1)] }]));
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
      remappings: [
        '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/',
        '@chainlink/contracts/=lib/chainlink-brownie-contracts/contracts/',
        'abdk-libraries-solidity/=lib/abdk-libraries-solidity/',
        'forge-std/=lib/forge-std/src/'
      ],
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
    }
  };
  const out = JSON.parse(execFileSync(solc, ['--standard-json', '--base-path', root, '--allow-paths', root], { input: JSON.stringify(input), maxBuffer: 1 << 30, cwd: root }));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'));
  const byName = {};
  for (const contracts of Object.values(out.contracts)) for (const [name, c] of Object.entries(contracts)) byName[name] = { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, size: c.evm.deployedBytecode.object.length / 2 };
  return byName;
}

// ── A minimal ethers provider over EDR, for the dry run ──────────────────────
async function localProvider() {
  const edrPath = process.env.EDR_PATH || join(root, 'node_modules', '@nomicfoundation', 'edr');
  const edr = require(edrPath);
  const ctx = new edr.EdrContext();
  await ctx.registerProviderFactory(edr.L1_CHAIN_TYPE, edr.l1ProviderFactory());
  const key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Hardhat account #0
  const addr = ethers.computeAddress(key);
  const hardfork = edr.l1HardforkToString(edr.SpecId.Cancun);
  const genesis = edr.l1GenesisState(edr.SpecId.Cancun);
  genesis.push({ address: ethers.getBytes(addr), balance: 10_000n * 10n ** 18n });
  const provider = await ctx.createProvider(
    edr.L1_CHAIN_TYPE,
    {
      allowBlocksWithSameTimestamp: true,
      allowUnlimitedContractSize: false,
      bailOnCallFailure: false,
      bailOnTransactionFailure: false,
      blockGasLimit: 30_000_000n,
      chainId: 31337n,
      coinbase: ethers.getBytes('0x0000000000000000000000000000000000000000'),
      genesisState: genesis,
      hardfork,
      minGasPrice: 0n,
      mining: { autoMine: true, memPool: { order: edr.MineOrdering.Priority } },
      networkId: 31337n,
      observability: {},
      ownedAccounts: [key],
      precompileOverrides: []
    },
    { enable: false, decodeConsoleLogInputsCallback: () => [], printLineCallback: () => {} },
    { subscriptionCallback: () => {} },
    edr.ContractDecoder.withContracts({})
  );
  let id = 1;
  const rpc = async (p) => {
    const res = await provider.handleRequest(JSON.stringify({ jsonrpc: '2.0', id: p.id ?? id++, method: p.method, params: p.params ?? [] }));
    const d = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    // EDR answers with the bare result or error; ethers wants the full JSON-RPC envelope back.
    return { jsonrpc: '2.0', id: p.id, ...(d.error ? { error: d.error } : { result: d.result }) };
  };
  // ethers' own transport hook: every JSON-RPC call goes to EDR instead of HTTP.
  const req = new ethers.FetchRequest('http://edr.local/');
  req.getUrlFunc = async (r) => {
    const body = JSON.parse(ethers.toUtf8String(r.body));
    const out = Array.isArray(body) ? await Promise.all(body.map(rpc)) : await rpc(body);
    return { statusCode: 200, statusMessage: 'OK', headers: { 'content-type': 'application/json' }, body: ethers.toUtf8Bytes(JSON.stringify(out)) };
  };
  const jsonRpc = new ethers.JsonRpcProvider(req, { chainId: 31337, name: 'edr' }, { staticNetwork: true, pollingInterval: 50 });
  return { provider: jsonRpc, signer: new ethers.NonceManager(new ethers.Wallet(key, jsonRpc)) };
}

// ── Deploy ───────────────────────────────────────────────────────────────────
async function main() {
  const C = compile();
  let provider, signer;
  if (dryRun) ({ provider, signer } = await localProvider());
  else {
    if (!process.env.RPC_URL || !process.env.PRIVATE_KEY) throw new Error('set RPC_URL and PRIVATE_KEY (or use --dry-run)');
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    signer = new ethers.NonceManager(new ethers.Wallet(process.env.PRIVATE_KEY, provider));
  }
  const deployer = await signer.getAddress();
  const { chainId } = await provider.getNetwork();
  const feeRecipient = process.env.FEE_RECIPIENT || deployer;
  const guardian = process.env.GUARDIAN || deployer;
  const poster = process.env.RISK_POSTER || deployer;
  const finalGovernor = process.env.GOVERNOR || null;
  const mocks = dryRun || process.env.DEPLOY_MOCKS === '1';
  console.log(`deployer ${deployer} on chain ${chainId}${dryRun ? ' (dry run)' : ''}`);

  const deployed = {};
  const deploy = async (name, ...args) => {
    // The test runner deploys oversized contracts; a real chain will not (EIP-170).
    if (C[name].size > 24_576) throw new Error(`${name} is ${C[name].size} bytes, over the 24,576-byte limit`);
    const f = new ethers.ContractFactory(C[name].abi, C[name].bytecode, signer);
    const c = await f.deploy(...args);
    await c.waitForDeployment();
    deployed[name] = await c.getAddress();
    console.log(`${name.padEnd(20)} ${deployed[name]}`);
    return c;
  };
  const tx = async (label, p) => { const r = await (await p).wait(); console.log(`  ${label}`); return r; };

  let usdcAddress = process.env.USDC_ADDRESS;
  if (!usdcAddress) {
    if (!mocks) throw new Error('set USDC_ADDRESS, or DEPLOY_MOCKS=1 to deploy a MockUSDC');
    usdcAddress = (await deploy('MockUSDC')).target;
  }

  const adapter = await deploy('VestingAdapter', deployer);
  const pool = await deploy('LendingPool', usdcAddress, deployer);
  const insurance = await deploy('InsuranceVault', usdcAddress, deployer);
  const engine = await deploy('CreditEngineV2');
  const oracle = await deploy('RiskOracle', deployer);
  const backstop = await deploy('BackstopVault', usdcAddress, deployer);
  const manager = await deploy('LoanManagerV2', usdcAddress, pool.target, adapter.target, engine.target, oracle.target, backstop.target, insurance.target, feeRecipient, deployer);
  await deploy('LoanLensV2', manager.target);

  // One-time wiring.
  await tx('adapter → manager', adapter.setLoanManager(manager.target));
  await tx('pool → manager', pool.setLoanManager(manager.target));
  await tx('insurance → manager', insurance.setLoanManager(manager.target));
  await tx('backstop → manager', backstop.setLoanManager(manager.target));

  const GUARDIAN_ROLE = ethers.id('GUARDIAN_ROLE');
  await tx('guardian on oracle', oracle.grantRole(GUARDIAN_ROLE, guardian));
  await tx('guardian on pool', pool.grantRole(GUARDIAN_ROLE, guardian));
  await tx('guardian on manager', manager.grantRole(GUARDIAN_ROLE, guardian));
  await tx('risk poster', oracle.grantRole(await oracle.RISK_POSTER_ROLE(), poster));

  if (mocks) {
    const token = await deploy('MockProjectToken', 'Vestra Demo Token', 'VDT', 18, ethers.parseUnits('10000000', 18), deployer);
    const feed = await deploy('MockPriceFeed');
    await tx('feed $1.00', feed.setPrice(100_000_000n));
    const sablier = await deploy('MockSablierV2Lockup');
    await tx('whitelist Sablier mock', adapter.setWhitelisted(0, sablier.target, true));
    await tx('list token (σ floor 30%, Ω 100%)', oracle.listToken(token.target, feed.target, 3000, 10_000));
    await tx('post risk (σ 80%, $5M volume, no drag)', oracle.postRisk(token.target, 8000, 5_000_000_000_000n, 10_000));
    await tx('deployer may buy paydowns', manager.grantRole(await manager.PAYDOWN_BUYER_ROLE(), deployer));
    const recipient = process.env.DEMO_RECIPIENT || deployer;
    const amount = ethers.parseUnits(process.env.DEMO_TOKENS || '100000', 18);
    const now = (await provider.getBlock('latest')).timestamp;
    await tx('approve demo tokens', token.approve(sablier.target, amount));
    await tx(`demo stream: ${ethers.formatUnits(amount, 18)} VDT over a year to ${recipient}`, sablier.createStream(recipient, token.target, amount, now, now + 365 * 86400, false));
  }

  if (finalGovernor) {
    const GOV = ethers.id('GOVERNOR_ROLE');
    for (const [name, c] of [['adapter', adapter], ['pool', pool], ['insurance', insurance], ['oracle', oracle], ['backstop', backstop], ['manager', manager]]) {
      const admin = await c.DEFAULT_ADMIN_ROLE();
      await tx(`${name}: governor → ${finalGovernor}`, c.grantRole(GOV, finalGovernor));
      await tx(`${name}: admin → ${finalGovernor}`, c.grantRole(admin, finalGovernor));
      await tx(`${name}: deployer renounces governor`, c.renounceRole(GOV, deployer));
      await tx(`${name}: deployer renounces admin`, c.renounceRole(admin, deployer));
    }
  }

  const record = { chainId: Number(chainId), deployer, deployedAt: new Date().toISOString(), usdc: usdcAddress, ...deployed, dryRun };
  if (!dryRun) {
    mkdirSync(join(root, 'deployments'), { recursive: true });
    writeFileSync(join(root, 'deployments', `v2-${chainId}.json`), JSON.stringify(record, null, 2));
  }
  console.log('\nApp env:');
  for (const [k, v] of Object.entries({ LOAN_MANAGER_V2: deployed.LoanManagerV2, LOAN_LENS_V2: deployed.LoanLensV2, LENDING_POOL_V2: deployed.LendingPool, VESTING_ADAPTER_V2: deployed.VestingAdapter, RISK_ORACLE: deployed.RiskOracle, BACKSTOP_VAULT: deployed.BackstopVault, CREDIT_ENGINE_V2: deployed.CreditEngineV2, USDC: usdcAddress })) {
    console.log(`VITE_${k}_ADDRESS_${chainId}=${v}`);
  }
  return record;
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
