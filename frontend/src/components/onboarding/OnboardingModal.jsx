import { useEffect, useMemo, useState } from 'react';

const steps = [
  {
    title: 'Welcome to CRDT',
    content:
      'Borrow against vested or locked tokens without selling early or transferring custody.',
    image: 'https://via.placeholder.com/320x200?text=CRDT+Vault',
  },
  {
    title: 'How it works',
    content:
      'Escrow claim rights, receive USDC, and repay anytime. At unlock, settlement is automatic.',
    riskWarning:
      'If token prices drop sharply, collateral may be seized and liquidated at unlock.',
  },
  {
    title: 'Ready to start?',
    content: 'Connect your wallet to see limits. Testnet only; no real funds at risk.',
    final: true,
  },
];

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);

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

  const step = useMemo(() => steps[stepIndex], [stepIndex]);

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
          <span className="chip">Onboarding</span>
        </div>
        {step.image && (
          <img
            src={step.image}
            alt="Onboarding visual"
            className="onboarding-image"
          />
        )}
        <p className="onboarding-text">{step.content}</p>
        {step.riskWarning && (
          <p className="onboarding-risk">Risk warning: {step.riskWarning}</p>
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
