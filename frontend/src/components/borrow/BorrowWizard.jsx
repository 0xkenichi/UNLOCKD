import { useState } from 'react';

const steps = [
  {
    title: 'Escrow Vault',
    description: 'Attach your vesting contract and verify unlock schedule.',
    cta: 'Escrow Position'
  },
  {
    title: 'Valuation',
    description: 'Lock conservative PV + LTV from oracle risk curves.',
    cta: 'Lock Valuation'
  },
  {
    title: 'Terms',
    description: 'Confirm borrow amount and interest rate.',
    cta: 'Review Terms'
  },
  {
    title: 'Confirm',
    description: 'Mint loan proof and receive USDC.',
    cta: 'Create Loan'
  }
];

export default function BorrowWizard() {
  const [activeStep, setActiveStep] = useState(0);
  const progress = ((activeStep + 1) / steps.length) * 100;

  const handleCta = () => {
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  return (
    <div className="wizard">
      <div className="wizard-steps">
        {steps.map((step, index) => (
          <button
            key={step.title}
            className={`wizard-step ${index === activeStep ? 'active' : ''}`}
            onClick={() => setActiveStep(index)}
          >
            <span className="wizard-index">{index + 1}</span>
            <span>{step.title}</span>
          </button>
        ))}
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">{steps[activeStep].title}</h3>
              <div className="section-subtitle">
                Step {activeStep + 1} of {steps.length}
              </div>
            </div>
            <span className="chip">{steps[activeStep].cta}</span>
          </div>
          <div className="progress-meta">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="muted">{steps[activeStep].description}</p>
          <button className="button" type="button" onClick={handleCta}>
            {steps[activeStep].cta}
          </button>
        </div>
        <div className="holo-card">
          <h3 className="section-title">Checklist</h3>
          <ul className="list-plain">
            <li>Verify vesting contract</li>
            <li>Confirm unlock timestamp</li>
            <li>Review conservative LTV</li>
            <li>Accept settlement terms</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
