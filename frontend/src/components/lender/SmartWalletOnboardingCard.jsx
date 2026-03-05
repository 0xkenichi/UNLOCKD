// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo, useState } from 'react';
import { trackEvent } from '../../utils/analytics.js';
import { submitContact } from '../../utils/api.js';
import AlchemySmartWalletActions from './AlchemySmartWalletActions.jsx';

const FUND_URL = 'https://www.alchemy.com/blog/everyone-onchain-fund';
const ACCOUNT_KIT_DOCS_URL = 'https://www.alchemy.com/docs/wallets';

export default function SmartWalletOnboardingCard({
  walletAddress,
  preferredWalletAddress = '',
  walletSource = 'none',
  onOpenWallet = () => {},
  onSmartWalletChange = () => {},
  onPrefillDeposit = () => {},
  onJumpToDeposit = () => {}
}) {
  const [email, setEmail] = useState('');
  const [capital, setCapital] = useState('');
  const [submitState, setSubmitState] = useState('idle');
  const [message, setMessage] = useState('');

  const accountKitConfigured = useMemo(() => {
    const env = import.meta.env || {};
    return Boolean(env.VITE_ALCHEMY_ACCOUNT_KIT_API_KEY);
  }, []);
  const activeWalletAddress = preferredWalletAddress || walletAddress || '';
  const hasActiveWallet = Boolean(activeWalletAddress);
  const hasCapital = useMemo(() => Number(capital) > 0, [capital]);

  const checklist = useMemo(
    () => [
      {
        id: 'smart-wallet',
        label: accountKitConfigured
          ? 'Alchemy Account Kit configured'
          : 'Alchemy Account Kit env pending',
        done: accountKitConfigured
      },
      {
        id: 'wallet',
        label:
          walletSource === 'smart_wallet'
            ? 'Smart wallet connected for lender profile'
            : 'Wallet connected for lender profile',
        done: hasActiveWallet
      },
      { id: 'funding', label: 'Starter capital target set (USD -> USDC)', done: Boolean(capital) }
    ],
    [accountKitConfigured, capital, hasActiveWallet, walletSource]
  );

  const submitPilotIntent = async () => {
    setSubmitState('saving');
    setMessage('');
    try {
      await submitContact({
        email: email || undefined,
        walletAddress: activeWalletAddress || undefined,
        context: 'alchemy_everyone_onchain_fund_lender_smart_wallet',
        message: `Lender smart-wallet onboarding pilot intent. Target initial liquidity: ${capital || 'unspecified'} USDC. Wallet source: ${walletSource}.`
      });
      trackEvent('lender_smart_wallet_pilot_submitted', {
        hasEmail: Boolean(email),
        hasWallet: hasActiveWallet,
        walletSource,
        capital
      });
      setSubmitState('saved');
      setMessage('Pilot intent saved. This is usable as fund application evidence.');
    } catch (error) {
      setSubmitState('error');
      setMessage(error?.message || 'Unable to save pilot intent.');
    }
  };

  return (
    <div className="holo-card lender-onboarding-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Lender Smart Wallet Onboarding</h3>
          <div className="section-subtitle">
            Web2-friendly lender flow: create wallet, fund USD, deposit liquidity.
          </div>
        </div>
        <span className={`tag ${accountKitConfigured ? 'success' : 'warn'}`}>
          {accountKitConfigured ? 'Account Kit ready' : 'Config pending'}
        </span>
      </div>

      <p className="muted">
        Borrowers can keep existing wallets. Lenders can start fresh, fund directly with USD,
        and provide liquidity against vested tokens.
      </p>

      <div className="card-list">
        {checklist.map((item) => (
          <div key={item.id} className={`pill ${item.done ? 'is-done' : ''}`}>
            {item.done ? '✓' : '•'} {item.label}
          </div>
        ))}
      </div>
      {accountKitConfigured && <AlchemySmartWalletActions onSmartWalletChange={onSmartWalletChange} />}
      {accountKitConfigured && walletSource !== 'smart_wallet' && (
        <p className="muted">
          Smart wallet is the recommended lender path for web2 onboarding.
        </p>
      )}

      <div className="form-grid lender-onboarding-grid">
        <label className="form-field">
          Lender email (optional)
          <input
            className="form-input"
            type="email"
            placeholder="ops@fund.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="form-field">
          Starter capital (USDC)
          <input
            className="form-input"
            inputMode="decimal"
            value={capital}
            onChange={(event) => setCapital(event.target.value)}
            placeholder="Enter target USDC"
          />
        </label>
      </div>

      <div className="inline-actions">
        {!hasActiveWallet ? (
          <button
            className="button"
            type="button"
            onClick={() => {
              if (accountKitConfigured) {
                window.dispatchEvent(new CustomEvent('crdt-open-smart-wallet-auth'));
                return;
              }
              onOpenWallet();
            }}
          >
            {accountKitConfigured ? 'Create smart wallet (recommended)' : 'Connect wallet'}
          </button>
        ) : (
          <button
            className="button"
            type="button"
            disabled={!hasCapital}
            onClick={() => {
              onPrefillDeposit(capital);
              trackEvent('lender_onboarding_continue_to_deposit', {
                walletSource,
                walletAddress: activeWalletAddress
              });
              onJumpToDeposit();
            }}
          >
            Continue to funding + deposit
          </button>
        )}
        <button
          className="button ghost"
          type="button"
          onClick={submitPilotIntent}
          disabled={submitState === 'saving'}
        >
          {submitState === 'saving' ? 'Saving intent...' : 'Save pilot intent'}
        </button>
        <a
          className="button ghost"
          href={ACCOUNT_KIT_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvent('lender_account_kit_docs_open')}
        >
          Account Kit docs
        </a>
        <a
          className="button ghost"
          href={FUND_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvent('lender_fund_page_open')}
        >
          Fund criteria
        </a>
      </div>
      {message && (
        <div className={submitState === 'error' ? 'error-banner' : 'muted'}>
          {message}
        </div>
      )}
    </div>
  );
}
