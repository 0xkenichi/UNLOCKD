import { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import {
  ALL_EVM_CHAINS,
  EVM_MAINNET_CHAINS,
  SOLANA_NETWORKS
} from '../../utils/chains.js';
import { useOnchainSession } from '../../utils/onchainSession.js';
import { trackEvent } from '../../utils/analytics.js';
import SolanaWalletCard from '../solana/SolanaWalletCard.jsx';
import OnrampEmbed from '../common/OnrampEmbed.jsx';
import BridgeCard from '../common/BridgeCard.jsx';

const onboardingHeroImage =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'><rect width='320' height='200' fill='%230b0f1a'/><rect x='16' y='16' width='288' height='168' rx='18' fill='%2316242f'/><text x='160' y='104' font-size='16' fill='%23ffffff' text-anchor='middle' dominant-baseline='middle' font-family='Arial'>VESTRA%20Onchain%20UX</text></svg>";

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
        subtitle: 'Seamless onchain borrowing across Base, Arbitrum, Avalanche.',
        content:
          'Borrow against vested tokens with smart accounts, wallet safety, and instant funding.',
        image: onboardingHeroImage
      },
      {
        title: 'Connect & choose chain',
        subtitle: 'Pick EVM or Solana, then connect your wallet.',
        content:
          'Smart accounts with passkeys are supported via Coinbase Smart Wallet.',
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
    <div className="onboarding-backdrop" role="dialog" aria-modal="true">
      <div className="onboarding-modal">
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
                <div className="wallet-grid">
                  <ConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <button
                        className="button"
                        type="button"
                        onClick={() => {
                          trackEvent('evm_connect_open', { variant: 'passkey' });
                          openConnectModal();
                        }}
                      >
                        Passkey Smart Wallet
                      </button>
                    )}
                  </ConnectButton.Custom>
                  <ConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => {
                          trackEvent('evm_connect_open', { variant: 'wallet' });
                          openConnectModal();
                        }}
                      >
                        Connect EVM Wallet
                      </button>
                    )}
                  </ConnectButton.Custom>
                </div>
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
              <SolanaWalletCard />
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
