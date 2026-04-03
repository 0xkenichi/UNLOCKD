// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  getAccount,
  getAssociatedTokenAddress,
  createApproveInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { apiGet } from '../../utils/api.js';

const formatAddress = (value) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : '';

export default function SolanaRepayDelegate() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [balances, setBalances] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [lastTx, setLastTx] = useState('');

  const owner = useMemo(() => publicKey?.toString() || '', [publicKey]);

  const fetchConfig = useCallback(async () => {
    try {
      setError('');
      const data = await apiGet('/api/solana/repay-config');
      setConfig(data?.config || null);
    } catch (err) {
      setError(err?.message || 'Unable to load repay config.');
    }
  }, []);

  const loadBalances = useCallback(async () => {
    if (!config?.priorityMints?.length || !publicKey) return;
    setIsLoading(true);
    setError('');
    try {
      const results = await Promise.all(
        config.priorityMints.map(async (mint) => {
          try {
            const mintPubKey = new PublicKey(mint);
            const ata = await getAssociatedTokenAddress(
              mintPubKey,
              publicKey,
              false,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            );
            const account = await getAccount(connection, ata);
            return {
              mint,
              ata: ata.toString(),
              amount: account.amount
            };
          } catch {
            return { mint, ata: '', amount: 0n };
          }
        })
      );
      setBalances(results);
    } catch (err) {
      setError(err?.message || 'Unable to fetch balances.');
    } finally {
      setIsLoading(false);
    }
  }, [config?.priorityMints, connection, publicKey]);

  const handleApprove = useCallback(async () => {
    if (!publicKey || !sendTransaction) return;
    if (!config?.authorityPubkey) {
      setError('Missing repay authority. Configure backend first.');
      return;
    }
    const delegate = new PublicKey(config.authorityPubkey);
    const approvals = balances.filter((item) => item.amount > 0n);
    if (!approvals.length) {
      setError('No balances available to approve.');
      return;
    }
    setIsApproving(true);
    setError('');
    setLastTx('');
    try {
      for (const item of approvals) {
        const ata = new PublicKey(item.ata);
        const tx = new Transaction().add(
          createApproveInstruction(
            ata,
            delegate,
            publicKey,
            item.amount,
            [],
            TOKEN_PROGRAM_ID
          )
        );
        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, 'confirmed');
        setLastTx(signature);
      }
    } catch (err) {
      setError(err?.message || 'Approval failed.');
    } finally {
      setIsApproving(false);
    }
  }, [balances, config?.authorityPubkey, connection, publicKey, sendTransaction]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  if (!publicKey) {
    return (
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Auto-Repay Authorization</h3>
            <div className="section-subtitle">
              Connect a Solana wallet to authorize auto-repay.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!config?.enabled) {
    return (
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Auto-Repay Authorization</h3>
            <div className="section-subtitle">
              Auto-repay is currently disabled for this cluster.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Auto-Repay Authorization</h3>
          <div className="section-subtitle">
            Delegate token accounts to the repay authority.
          </div>
        </div>
        <span className="tag">Required</span>
      </div>
      <div className="card-list">
        <div className="pill">Authority: {formatAddress(config.authorityPubkey)}</div>
        <div className="pill">Mode: {config.mode}</div>
        <div className="pill">
          Priority list: {config.priorityMints?.length || 0} mints
        </div>
      </div>
      <div className="inline-actions">
        <button className="button ghost" type="button" onClick={loadBalances} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh Balances'}
        </button>
        <button className="button" type="button" onClick={handleApprove} disabled={isApproving}>
          {isApproving ? 'Approving...' : 'Approve Auto-Repay'}
        </button>
      </div>
      <div className="data-table">
        <div className="table-row header">
          <div>Mint</div>
          <div>ATA</div>
          <div>Balance</div>
        </div>
        {balances.map((item) => (
          <div className="table-row" key={item.mint}>
            <div>{formatAddress(item.mint)}</div>
            <div>{item.ata ? formatAddress(item.ata) : '--'}</div>
            <div>{item.amount ? item.amount.toString() : '0'}</div>
          </div>
        ))}
      </div>
      {lastTx && <div className="muted">Last approval: {formatAddress(lastTx)}</div>}
      {error && <div className="error-banner">{error}</div>}
      <div className="muted">
        Approvals cover current balances. Re-approve if you receive more tokens.
      </div>
    </div>
  );
}
