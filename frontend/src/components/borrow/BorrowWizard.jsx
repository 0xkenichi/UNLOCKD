// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

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
    description: 'Confirm borrow amount, interest, and repayment waterfall.',
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
  const shouldReduceMotion = useReducedMotion();

  const cardVariants = useMemo(
    () => ({
      initial: { opacity: 0, y: shouldReduceMotion ? 0 : 12, scale: shouldReduceMotion ? 1 : 0.99 },
      animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
      exit: { opacity: 0, y: shouldReduceMotion ? 0 : -12, scale: shouldReduceMotion ? 1 : 0.99, transition: { duration: 0.24 } }
    }),
    [shouldReduceMotion]
  );

  const handleCta = () => {
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  return (
    <div className="wizard">
      <div className="wizard-steps">
        {steps.map((step, index) => (
          <motion.button
            key={step.title}
            className={`wizard-step ${index === activeStep ? 'active' : ''}`}
            onClick={() => setActiveStep(index)}
            whileHover={{ y: shouldReduceMotion ? 0 : -2, scale: shouldReduceMotion ? 1 : 1.01 }}
            whileTap={{ scale: shouldReduceMotion ? 1 : 0.99 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            <span className="wizard-index">{index + 1}</span>
            <span>{step.title}</span>
          </motion.button>
        ))}
      </div>
      <div className="grid-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={steps[activeStep].title}
            className="holo-card"
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
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

            {activeStep === 3 && (
              <div className="legal-notice" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.85rem' }}>
                <label style={{ display: 'flex', gap: '10px', cursor: 'pointer', alignItems: 'flex-start' }}>
                  <input type="checkbox" style={{ marginTop: '3px' }} defaultChecked />
                  <span>
                    I accept the <a href="/legal/terms" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Vestra Protocol Terms & Conditions</a>.
                    I acknowledge this loan is legally binding under the Cayman Islands Foundation framework.
                  </span>
                </label>
              </div>
            )}

            <motion.button
              className="button"
              type="button"
              onClick={handleCta}
              whileTap={{ scale: shouldReduceMotion ? 1 : 0.98 }}
              whileHover={{ y: shouldReduceMotion ? 0 : -2 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            >
              {steps[activeStep].cta}
            </motion.button>
          </motion.div>
        </AnimatePresence>
        <motion.div
          className="holo-card"
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <h3 className="section-title">Checklist</h3>
          <ul className="list-plain">
            <li>Verify vesting contract</li>
            <li>Confirm unlock timestamp</li>
            <li>Review conservative LTV</li>
            <li>Accept settlement terms</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
