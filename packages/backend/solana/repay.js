// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const fs = require('fs');
const path = require('path');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const {
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount
} = require('@solana/spl-token');

const getCluster = () =>
  process.env.SOLANA_REPAY_CLUSTER || process.env.SOLANA_CLUSTER || 'mainnet';

const getEnvByCluster = (base) => {
  const cluster = getCluster().toUpperCase();
  return process.env[`${base}_${cluster}`] || process.env[base] || '';
};

const parseKeypair = () => {
  const raw =
    process.env.SOLANA_REPAY_AUTHORITY_KEYPAIR ||
    process.env.SOLANA_REPAY_AUTHORITY ||
    '';
  if (!raw) return null;
  if (raw.endsWith('.json')) {
    const filePath = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
    const contents = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(contents);
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
  if (raw.trim().startsWith('[')) {
    const parsed = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    if (decoded.trim().startsWith('[')) {
      const parsed = JSON.parse(decoded);
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }
  } catch {
    return null;
  }
  return null;
};

const getRepayConfig = () => {
  const enabled = process.env.SOLANA_REPAY_ENABLED === 'true';
  const rpcUrl =
    process.env.SOLANA_REPAY_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    'https://api.mainnet-beta.solana.com';
  const jupiterBaseUrl =
    process.env.SOLANA_JUPITER_BASE_URL || 'https://quote-api.jup.ag';
  const jupiterSlippageBps = Number(process.env.SOLANA_JUPITER_SLIPPAGE_BPS || 50);
  const treasury = getEnvByCluster('SOLANA_REPAY_TREASURY');
  const usdcMint = getEnvByCluster('SOLANA_USDC_MINT');
  const priorityRaw = getEnvByCluster('SOLANA_REPAY_MINTS');
  const priorityMints = priorityRaw
    ? priorityRaw.split(',').map((mint) => mint.trim()).filter(Boolean)
    : [];
  const mode = process.env.SOLANA_REPAY_MODE || 'usdc-only';
  const authority = parseKeypair();
  return {
    enabled,
    rpcUrl,
    cluster: getCluster(),
    treasury,
    usdcMint,
    priorityMints,
    mode,
    jupiterBaseUrl,
    jupiterSlippageBps,
    authorityPubkey: authority ? authority.publicKey.toString() : ''
  };
};

const getConnection = (rpcUrl) => new Connection(rpcUrl, 'confirmed');

const getTokenBalance = async (connection, owner, mint) => {
  try {
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(owner)
    );
    const account = await getAccount(connection, ata);
    return {
      ata,
      amount: account.amount
    };
  } catch (error) {
    return { ata: null, amount: 0n };
  }
};

const buildRepayPlan = async ({ owner, maxUsdc }) => {
  const config = getRepayConfig();
  const connection = getConnection(config.rpcUrl);
  const ownerKey = new PublicKey(owner);

  const plan = [];
  for (const mint of config.priorityMints) {
    const { ata, amount } = await getTokenBalance(connection, ownerKey, mint);
    plan.push({
      mint,
      ata: ata ? ata.toString() : '',
      balance: amount.toString()
    });
  }

  return {
    ...config,
    owner: ownerKey.toString(),
    maxUsdc: maxUsdc ? maxUsdc.toString() : '0',
    plan
  };
};

const getJupiterQuote = async ({
  baseUrl,
  inputMint,
  outputMint,
  amount,
  slippageBps
}) => {
  const url = new URL(`${baseUrl}/quote`);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount.toString());
  url.searchParams.set('slippageBps', String(slippageBps));
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Jupiter quote failed: ${response.status}`);
  }
  return response.json();
};

const executeJupiterSwap = async ({
  baseUrl,
  connection,
  authority,
  quote
}) => {
  const response = await fetch(`${baseUrl}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPublicKey: authority.publicKey.toString(),
      wrapAndUnwrapSol: true,
      quoteResponse: quote
    })
  });
  if (!response.ok) {
    throw new Error(`Jupiter swap failed: ${response.status}`);
  }
  const data = await response.json();
  const raw = Buffer.from(data.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(raw);
  tx.sign([authority]);
  const signature = await connection.sendTransaction(tx);
  await connection.confirmTransaction(signature, 'confirmed');
  return { signature };
};

const executeRepaySweep = async ({ owner, maxUsdc }) => {
  const config = getRepayConfig();
  if (!config.enabled) {
    return { ok: false, error: 'repay disabled', config };
  }
  const authority = parseKeypair();
  if (!authority) {
    return { ok: false, error: 'missing repay authority', config };
  }
  if (!config.treasury || !config.usdcMint) {
    return { ok: false, error: 'missing treasury or USDC mint', config };
  }

  const connection = getConnection(config.rpcUrl);
  const ownerKey = new PublicKey(owner);
  const treasuryKey = new PublicKey(config.treasury);
  const usdcMintKey = new PublicKey(config.usdcMint);

  const treasuryUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    usdcMintKey,
    treasuryKey
  );

  let remaining = maxUsdc ? BigInt(maxUsdc) : 0n;
  const transfers = [];

  for (const mint of config.priorityMints) {
    const mintKey = new PublicKey(mint);
    const { ata, amount } = await getTokenBalance(connection, ownerKey, mint);
    if (!ata || amount === 0n) continue;

    const isUsdc = mintKey.equals(usdcMintKey);
    if (!isUsdc && config.mode === 'usdc-only') {
      continue;
    }

    if (remaining > 0n && isUsdc && amount === 0n) {
      continue;
    }

    const transferAmount = remaining > 0n && isUsdc ? (amount > remaining ? remaining : amount) : amount;
    if (transferAmount === 0n) continue;

    const treasuryAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      mintKey,
      treasuryKey
    );

    const tx = new Transaction().add(
      createTransferInstruction(
        ata,
        treasuryAta.address,
        authority.publicKey,
        transferAmount
      )
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: 'confirmed'
    });

    transfers.push({
      mint,
      amount: transferAmount.toString(),
      signature
    });

    if (!isUsdc && config.mode === 'swap') {
      const quote = await getJupiterQuote({
        baseUrl: config.jupiterBaseUrl,
        inputMint: mintKey.toString(),
        outputMint: usdcMintKey.toString(),
        amount: transferAmount,
        slippageBps: config.jupiterSlippageBps
      });
      const swap = await executeJupiterSwap({
        baseUrl: config.jupiterBaseUrl,
        connection,
        authority,
        quote
      });
      transfers.push({
        mint,
        amount: transferAmount.toString(),
        signature: swap.signature,
        swap: true
      });
    }

    if (isUsdc && remaining > 0n) {
      remaining = remaining > transferAmount ? remaining - transferAmount : 0n;
      if (remaining === 0n) {
        break;
      }
    }
  }

  return {
    ok: true,
    owner: ownerKey.toString(),
    remaining: remaining.toString(),
    transfers,
    config
  };
};

module.exports = {
  getRepayConfig,
  buildRepayPlan,
  executeRepaySweep
};
