// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import {
  ALL_EVM_CHAINS,
  EVM_MAINNET_CHAINS,
  SOLANA_NETWORKS
} from '../../utils/chains.js';
import { useOnchainSession } from '../../utils/onchainSession.js';
import { trackEvent } from '../../utils/analytics.js';
import LazySolanaWalletCard from '../solana/LazySolanaWalletCard.jsx';
import LazyEvmConnectButtons from '../common/LazyEvmConnectButtons.jsx';
import OnrampEmbed from '../common/OnrampEmbed.jsx';
import BridgeCard from '../common/BridgeCard.jsx';

const onboardingHeroImage =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'><defs><linearGradient id='grad' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' style='stop-color:%2358a6ff;stop-opacity:0.9'/><stop offset='100%' style='stop-color:%231a6fda;stop-opacity:1'/></linearGradient></defs><rect width='320' height='200' fill='%230a0e14'/><rect x='16' y='16' width='288' height='168' rx='12' fill='%23161b22' opacity='0.95'/><circle cx='160' cy='90' r='36' fill='url(%23grad)' opacity='0.2'/><text x='160' y='104' font-size='18' fill='%2358a6ff' text-anchor='middle' dominant-baseline='middle' font-family='monospace' font-weight='600'>VESTRA</text><text x='160' y='130' font-size='11' fill='%238b949e' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>Vesting Credit Protocol</text></svg>";

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { session, setSession } = useOnchainSession();

  useEffect(() => {
    const seen = localStorage.getItem('crdt-onboarding-seen');
    if (seen) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    const handleReset = () => {
      localStorage.removeItem('crdt-onboarding-seen');
      setStepIndex(0);
      setIsOpen(true);
    };
    window.addEventListener('crdt-onboarding-reset', handleReset);
    return () => window.removeEventListener('crdt-onboarding-reset', handleReset);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const steps = useMemo(
    () => [
      {
        title: 'Welcome to VESTRA',
        subtitle: 'Seamless onchain borrowing across Flow EVM, Base, Arbitrum, Avalanche.',
        content:
          'Borrow against vested tokens with non-custodial security, DPV valuation, and auto-settlement.',
        image: onboardingHeroImage
      },
      {
        title: 'Connect & choose chain',
        subtitle: 'Pick EVM or Solana, then connect your wallet.',
        content:
          'Use a browser wallet to connect your EVM address.',
        action: 'connect'
      },
      {
        title: 'Fund your wallet',
        subtitle: 'Onramp or bridge USDC to the target chain.',
        content: 'Set up gas and USDC before you borrow or repay.',
        action: 'fund'
      }
    ],
    []
  );
  const step = useMemo(() => steps[stepIndex], [stepIndex, steps]);

  const handleChainType = (type) => {
    setSession({ chainType: type });
    trackEvent('onboarding_chain_type', { type });
  };

  const handleSelectChain = (chain) => {
    setSession({ evmChainId: chain.id });
    if (chainId !== chain.id) {
      switchChain({ chainId: chain.id });
    }
    trackEvent('onboarding_chain_select', { chainId: chain.id });
  };

  const handleClose = () => {
    localStorage.setItem('crdt-onboarding-seen', 'true');
    setIsOpen(false);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div className="onboarding-modal" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <div className="section-title">{step.title}</div>
            <div className="section-subtitle">
              Step {stepIndex + 1} of {steps.length}
            </div>
          </div>
          <div className="inline-actions">
            <span className="chip">Onboarding</span>
            <button
              className="button ghost"
              type="button"
              onClick={handleClose}
              aria-label="Close onboarding"
            >
              Skip
            </button>
          </div>
        </div>
        {step.image && (
          <img
            src={step.image}
            alt="Onboarding visual"
            className="onboarding-image"
          />
        )}
        <p className="onboarding-text">{step.content}</p>
        {step.subtitle && <p className="muted">{step.subtitle}</p>}
        {step.action === 'connect' && (
          <div className="stack">
            <div className="segmented">
              <button
                className={`button ghost ${session.chainType === 'evm' ? 'active' : ''}`}
                type="button"
                onClick={() => handleChainType('evm')}
              >
                EVM (Base/Arbitrum/Avalanche)
              </button>
              <button
                className={`button ghost ${session.chainType === 'solana' ? 'active' : ''}`}
                type="button"
                onClick={() => handleChainType('solana')}
              >
                Solana
              </button>
            </div>
            {session.chainType === 'evm' ? (
              <div className="holo-card">
                <div className="section-head">
                  <div>
                    <h3 className="section-title">EVM Wallet</h3>
                    <div className="section-subtitle">
                      Connect an EVM wallet or smart account.
                    </div>
                  </div>
                  <span className={`tag ${address ? 'success' : ''}`}>
                    {address ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <LazyEvmConnectButtons />
                <div className="chain-picker">
                  {EVM_MAINNET_CHAINS.map((chain) => (
                    <button
                      key={chain.id}
                      className={`pill ${session.evmChainId === chain.id ? 'active' : ''}`}
                      onClick={() => handleSelectChain(chain)}
                      type="button"
                    >
                      {chain.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <LazySolanaWalletCard />
            )}
          </div>
        )}
        {step.action === 'fund' && (
          <div className="stack">
            <OnrampEmbed
              address={address}
              chainLabel={
                ALL_EVM_CHAINS.find((chain) => chain.id === session.evmChainId)?.name
              }
            />
            <BridgeCard
              chainLabel={
                ALL_EVM_CHAINS.find((chain) => chain.id === session.evmChainId)?.name
              }
            />
            <div className="holo-card">
              <div className="section-head">
                <div>
                  <h3 className="section-title">Solana Onramp</h3>
                  <div className="section-subtitle">
                    Send USDC to your Solana wallet if using Solana.
                  </div>
                </div>
                <span className="tag">Solana</span>
              </div>
              <div className="muted">
                Use exchanges or Solana-friendly onramps to fund USDC on
                {` ${SOLANA_NETWORKS[0].name}`}.
              </div>
            </div>
          </div>
        )}
        <div className="onboarding-actions">
          {stepIndex > 0 ? (
            <button
              className="onboarding-button secondary"
              onClick={() => setStepIndex(stepIndex - 1)}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {stepIndex < steps.length - 1 ? (
            <button
              className="onboarding-button"
              onClick={() => setStepIndex(stepIndex + 1)}
            >
              Next
            </button>
          ) : (
            <button className="onboarding-button" onClick={handleClose}>
              Start Exploring
            </button>
          )}
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: `${((stepIndex + 1) / steps.length) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}
