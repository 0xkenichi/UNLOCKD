// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { StreamClient } from '@streamflow/stream';
import { useAccount, useChainId, useSignTypedData } from 'wagmi';
import { useOnchainSession } from '../../utils/onchainSession.js';
import { apiGet, apiPost, fetchVestedContracts } from '../../utils/api.js';
import { getContractAddress } from '../../utils/contracts.js';
import { makeRelayerAuth } from '../../utils/privacy.js';

const steps = [
  {
    id: 'overview',
    title: 'Privacy upgrade',
    subtitle:
      'One-time setup to reduce linkability (recommended for founders, institutions, and top holders).'
  },
  {
    id: 'evm',
    title: 'EVM setup',
    subtitle: 'Prepare claim-rights collateral so loans do not expose your address in events.'
  },
  {
    id: 'solana',
    title: 'Solana setup',
    subtitle: 'Prepare Streamflow vesting so Vestra actions are not tied to the recipient wallet.'
  }
];

export default function PrivacyUpgradeWizard({ enabled }) {
  const { session } = useOnchainSession();
  const { connection } = useConnection();
  const solanaWallet = useWallet();
  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const [stepId, setStepId] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [solanaVault, setSolanaVault] = useState('');
  const [solanaStreams, setSolanaStreams] = useState([]);
  const [selectedStream, setSelectedStream] = useState('');

  const [sablierLockup, setSablierLockup] = useState('');
  const [sablierStreamId, setSablierStreamId] = useState('');
  const [sablierWrapper, setSablierWrapper] = useState('');
  const [sablierApproveTx, setSablierApproveTx] = useState('');

  const step = useMemo(() => steps.find((s) => s.id === stepId) || steps[0], [stepId]);

  if (!enabled) return null;

  const hasEvm = Boolean(session?.walletAddress);
  const hasSolana = Boolean(session?.solanaWalletAddress);

  const handleFetchSolanaVault = async () => {
    setBusy(true);
    setMessage('');
    try {
      const data = await apiGet('/api/privacy/solana/vault');
      if (data?.vaultPubkey) setSolanaVault(String(data.vaultPubkey));
      setMessage(
        data?.vaultPubkey
          ? `Solana privacy vault: ${data.vaultPubkey}`
          : 'Solana vault unavailable.'
      );
    } catch (error) {
      setMessage(error?.message || 'Failed to load Solana privacy vault.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!enabled || stepId !== 'solana' || !hasSolana) return () => { };
    (async () => {
      try {
        const items = await fetchVestedContracts({
          chain: 'solana',
          walletAddress: session.solanaWalletAddress,
          // For the upgrade wizard we can use the public filter so the user can
          // select streams before they transfer recipient to a new vault.
          privacyMode: false
        });
        if (!active) return;
        setSolanaStreams(Array.isArray(items) ? items : []);
      } catch {
        if (!active) return;
        setSolanaStreams([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, stepId, hasSolana, session?.solanaWalletAddress]);

  const handleTransferStream = async () => {
    const streamId = selectedStream || '';
    const newRecipient = String(solanaVault || '').trim();
    if (!streamId) {
      setMessage('Select a Streamflow vesting stream first.');
      return;
    }
    if (!newRecipient) {
      setMessage('Enter a new recipient (privacy vault) address.');
      return;
    }
    if (!solanaWallet?.publicKey || !solanaWallet?.signTransaction) {
      setMessage('Connect Phantom to sign the transfer transaction.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const rpcUrl = connection?.rpcEndpoint || 'https://api.mainnet-beta.solana.com';
      if (!StreamClient) {
        throw new Error('Streamflow client unavailable (check @streamflow/stream export)');
      }
      const client = new StreamClient(rpcUrl);
      await client.transfer(
        { id: streamId, newRecipient },
        { invoker: solanaWallet, isNative: false }
      );
      setMessage(`Transferred stream ${streamId.slice(0, 6)}… to recipient ${newRecipient.slice(0, 6)}…`);
    } catch (error) {
      setMessage(error?.message || 'Failed to transfer stream.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartEvmRelayer = async () => {
    setBusy(true);
    setMessage('');
    try {
      const data = await apiPost('/api/privacy/evm/register', {});
      setMessage(data?.vaultAddress ? `EVM private vault registered: ${data.vaultAddress}` : 'OK');
    } catch (error) {
      setMessage(error?.message || 'Failed to register EVM private vault.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeploySablierWrapper = async () => {
    setBusy(true);
    setMessage('');
    setSablierWrapper('');
    setSablierApproveTx('');
    try {
      const loanManager = getContractAddress(chainId, 'loanManager');
      if (!loanManager) throw new Error('Unsupported network (no LoanManager address).');
      if (!address || !signTypedDataAsync) throw new Error('EVM wallet signature unavailable.');
      const vaultResp = await apiGet('/api/privacy/evm/vault');
      const vaultAddress = vaultResp?.vaultAddress || '';
      if (!vaultAddress) throw new Error('No private vault registered. Run Privacy Upgrade first.');

      const payload = {
        lockupAddress: String(sablierLockup || '').trim(),
        streamId: String(sablierStreamId || '').trim()
      };
      if (!payload.lockupAddress || !payload.streamId) {
        throw new Error('Lockup address and stream id required.');
      }

      const auth = makeRelayerAuth({
        chainId,
        verifyingContract: loanManager,
        user: address,
        vault: vaultAddress,
        action: 'deploy-sablier-wrapper',
        payload
      });
      const signature = await signTypedDataAsync(auth.typedData);
      const result = await apiPost('/api/privacy/evm/wrappers/sablier/deploy', {
        ...payload,
        signature,
        nonce: auth.nonce,
        issuedAt: auth.issuedAt,
        expiresAt: auth.expiresAt,
        payloadHash: auth.payloadHash
      });
      const wrapper = String(result?.wrapperAddress || '').trim();
      if (!wrapper) throw new Error('Wrapper deployment returned no address.');
      setSablierWrapper(wrapper);
      setMessage(`Sablier wrapper deployed: ${wrapper}`);
    } catch (error) {
      setMessage(error?.message || 'Failed to deploy wrapper.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveSablierOperator = async () => {
    setMessage('');
    setSablierApproveTx('');
    try {
      const lockup = String(sablierLockup || '').trim();
      const wrapper = String(sablierWrapper || '').trim();
      const streamId = sablierStreamId ? BigInt(sablierStreamId) : 0n;
      if (!lockup || !wrapper || streamId <= 0n) {
        throw new Error('Lockup address, wrapper address, and stream id are required.');
      }
      if (!window?.ethereum) {
        throw new Error('EVM provider missing (connect wallet).');
      }
      const ethersMod = await import('ethers');
      const provider = new ethersMod.ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethersMod.ethers.Contract(
        lockup,
        ['function setApproved(uint256 streamId,address operator,bool isApproved)'],
        signer
      );
      const tx = await contract.setApproved(streamId, wrapper, true);
      setSablierApproveTx(tx.hash);
      setMessage(`Approval submitted: ${tx.hash.slice(0, 10)}…`);
    } catch (error) {
      setMessage(error?.message || 'Failed to approve wrapper.');
    }
  };

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">{step.title}</h3>
          <div className="section-subtitle">{step.subtitle}</div>
        </div>
        <div className="inline-actions">
          {steps.map((s) => (
            <button
              key={s.id}
              className={`button ${s.id === stepId ? '' : 'ghost'}`}
              type="button"
              onClick={() => setStepId(s.id)}
            >
              {s.id === 'overview' ? 'Overview' : s.id.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {stepId === 'overview' ? (
        <div className="card-list">
          <div className="pill">
            Private mode is optional, but advised to reduce backlash and coordinated attention.
          </div>
          <div className="pill">
            Premium guarantee requires relayed execution and compatible vesting standards.
          </div>
          <div className="pill">
            If your vesting cannot be migrated (fixed-beneficiary), Vestra will show a “partial privacy”
            warning and fall back to best-effort protections.
          </div>
        </div>
      ) : null}

      {stepId === 'evm' ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="muted">
            Active EVM identity: {hasEvm ? session.walletAddress : 'Not connected'}
          </div>
          <button className="button" type="button" disabled={busy || !hasEvm} onClick={handleStartEvmRelayer}>
            {busy ? 'Working…' : 'Register private vault (EVM)'}
          </button>
          <div className="muted" style={{ fontSize: 12 }}>
            This registers an opt-in private vault for relayed execution. Your address is not emitted in
            private-loan events.
          </div>

          <div className="holo-card" style={{ marginTop: 10 }}>
            <div className="section-head">
              <div>
                <h4 className="section-title">Upgrade existing vesting (Sablier v2)</h4>
                <div className="section-subtitle">
                  Partial privacy: loans won&apos;t expose your wallet, but the underlying stream may still.
                </div>
              </div>
              <span className="tag">Wrapper</span>
            </div>
            <div className="form-grid">
              <label className="form-field">
                Lockup contract
                <input
                  className="form-input"
                  value={sablierLockup}
                  onChange={(e) => setSablierLockup(e.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label className="form-field">
                Stream ID
                <input
                  className="form-input"
                  value={sablierStreamId}
                  onChange={(e) => setSablierStreamId(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 1"
                />
              </label>
            </div>
            <div className="inline-actions" style={{ marginTop: 10 }}>
              <button
                className="button ghost"
                type="button"
                disabled={busy || !hasEvm}
                onClick={handleDeploySablierWrapper}
              >
                {busy ? 'Working…' : 'Deploy wrapper to vault'}
              </button>
              <button
                className="button ghost"
                type="button"
                disabled={busy || !sablierWrapper}
                onClick={handleApproveSablierOperator}
              >
                Approve wrapper as operator
              </button>
            </div>
            {sablierWrapper ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Wrapper: <code>{sablierWrapper}</code>
              </div>
            ) : null}
            {sablierApproveTx ? (
              <div className="muted" style={{ marginTop: 6 }}>
                Approval tx: <code>{sablierApproveTx}</code>
              </div>
            ) : null}
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              After approval, use the wrapper address as the Vesting Contract in Borrow (manual mode) and create a private loan.
            </div>
          </div>
        </div>
      ) : null}

      {stepId === 'solana' ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="muted">
            Active Solana identity: {hasSolana ? session.solanaWalletAddress : 'Not connected'}
          </div>
          <label className="form-field">
            Privacy vault recipient
            <input
              className="form-input"
              value={solanaVault}
              onChange={(e) => setSolanaVault(e.target.value)}
              placeholder="Paste new recipient public key (Base58)"
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Recommended: use a fresh Solana address you control (a separate Phantom account) to reduce linkability.
            </div>
          </label>
          <label className="form-field">
            Streamflow vesting stream
            <select
              className="form-select"
              value={selectedStream}
              onChange={(e) => setSelectedStream(e.target.value)}
            >
              <option value="">Select a stream</option>
              {solanaStreams.map((item) => (
                <option key={item.streamId || item.loanId} value={String(item.streamId || item.loanId || '')}>
                  {(item.tokenSymbol || 'Token').toString()} · {String(item.streamId || item.loanId).slice(0, 6)}… · unlock{' '}
                  {item.unlockTime ? new Date(Number(item.unlockTime) * 1000).toLocaleDateString() : '--'}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={handleFetchSolanaVault}
          >
            {busy ? 'Working…' : 'Get Solana privacy vault'}
          </button>
          <button
            className="button ghost"
            type="button"
            disabled={busy}
            onClick={handleTransferStream}
          >
            {busy ? 'Working…' : 'Transfer stream to privacy vault'}
          </button>
          <div className="muted" style={{ fontSize: 12 }}>
            In premium private mode, Streamflow positions are transferred or reassigned to a vault so
            future Vestra actions are not tied to your recipient wallet.
          </div>
        </div>
      ) : null}

      {message ? <div className="pill" style={{ marginTop: 12 }}>{message}</div> : null}
    </div>
  );
}

