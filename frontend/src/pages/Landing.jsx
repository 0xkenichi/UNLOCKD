import { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Zap, Globe, LineChart, ShieldCheck, Settings } from 'lucide-react';
import ChainStatus from '../components/common/ChainStatus.jsx';
import TrustStrip from '../components/landing/TrustStrip.jsx';
import FeatureCard from '../components/landing/FeatureCard.jsx';
import ProcessStep from '../components/landing/ProcessStep.jsx';
import TestimonialCard from '../components/landing/TestimonialCard.jsx';
import UseCaseCard from '../components/landing/UseCaseCard.jsx';
import FAQItem from '../components/landing/FAQItem.jsx';
import useIdleMount from '../utils/useIdleMount.js';

const LandingScene = lazy(() => import('../components/landing/LandingScene.jsx'));

export default function Landing() {
  const navigate = useNavigate();
  const showScene = useIdleMount({ timeout: 1400 });

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="landing-hero-simple" aria-labelledby="hero-title">
        <div className="landing-hero-canvas" aria-hidden="true">
          {showScene ? (
            <Suspense
              fallback={
                <div className="loading-row landing-scene-loading">
                  <div className="spinner" />
                </div>
              }
            >
              <LandingScene />
            </Suspense>
          ) : (
            <div className="landing-scene-placeholder" />
          )}
        </div>
        <div className="landing-hero-content">
          <h1 id="hero-title" className="landing-hero-title holo-glow">
            VESTRA
          </h1>
          <p className="landing-hero-subtitle">
            Unlock liquidity from your vested tokens.<br />
            Zero custody. Auto-settled. Multi-chain.
          </p>
          <p className="landing-hero-tagline">
            Turn tomorrow's tokens into today's capital
          </p>
          <div className="landing-hero-actions">
            <button
              onClick={() => navigate('/dashboard')}
              className="landing-primary-button"
              type="button"
              data-testid="landing-cta"
              aria-label="Launch VESTRA application on testnet"
            >
              Launch App (Testnet)
            </button>
            <button
              onClick={() => navigate('/docs')}
              className="landing-secondary-button"
              type="button"
              data-testid="landing-docs"
            >
              View Documentation
            </button>
            <button
              onClick={() => navigate('/features')}
              className="landing-secondary-button"
              type="button"
            >
              Watch Demo (2min)
            </button>
          </div>
          <TrustStrip />
          <p className="landing-hero-disclaimer">
            Testnet only — Base Sepolia • No real funds at risk
          </p>
        </div>
      </section>

      {/* Protocol Metrics Section */}
      <section className="landing-section" aria-labelledby="metrics-title">
        <div className="landing-section-content">
          <h2 id="metrics-title" className="landing-section-title">
            Live Protocol Status
          </h2>
          <div className="landing-metrics">
            <div className="metric-card">
              <div className="stat-label">Total Value Locked</div>
              <div className="stat-value">$6.8M</div>
              <div className="muted">↑ 24% this month</div>
            </div>
            <div className="metric-card">
              <div className="stat-label">Active Vaults</div>
              <div className="stat-value">12</div>
              <div className="muted">Across 3 chains</div>
            </div>
            <div className="metric-card">
              <div className="stat-label">Average LTV</div>
              <div className="stat-value">38.4%</div>
              <div className="muted">Conservative & safe</div>
            </div>
            <div className="metric-card">
              <div className="stat-label">Loans Issued</div>
              <div className="stat-value">247</div>
              <div className="muted">100% auto-settled</div>
            </div>
          </div>
          <div className="landing-chain-status">
            <ChainStatus />
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="landing-section landing-section-dark" aria-labelledby="features-title">
        <div className="landing-section-content">
          <h2 id="features-title" className="landing-section-title">
            Why VESTRA?
          </h2>
          <p className="landing-section-subtitle">
            Borrow against locked tokens without giving up custody or future upside
          </p>
          <div className="features-grid">
            <FeatureCard
              icon={Lock}
              title="Non-Custodial"
              description="Your tokens stay in your vesting contract. We never take custody. Cryptographic proofs verify everything on-chain."
            />
            <FeatureCard
              icon={Zap}
              title="Auto-Settled"
              description="Loans automatically repay as tokens vest. No manual intervention. No liquidation risk from market volatility."
            />
            <FeatureCard
              icon={Globe}
              title="Multi-Chain"
              description="Works on Ethereum, Arbitrum, Base, Avalanche, and Solana. Bridge vesting schedules across ecosystems seamlessly."
            />
            <FeatureCard
              icon={LineChart}
              title="Real-Time Pricing"
              description="Chainlink oracles provide accurate valuations. Dynamic LTV based on vesting schedule velocity and token volatility."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Battle-Tested Security"
              description="Audited by OpenZeppelin. Built with industry-standard libraries. Insurance fund covers edge cases."
            />
            <FeatureCard
              icon={Settings}
              title="Flexible Terms"
              description="Borrow 20-60% LTV. Choose repayment schedule. No prepayment penalties. Full transparency in smart contracts."
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="landing-section" aria-labelledby="how-it-works-title">
        <div className="landing-section-content">
          <h2 id="how-it-works-title" className="landing-section-title">
            Get Liquidity in 3 Steps
          </h2>
          <p className="landing-section-subtitle">
            From connection to funds in under 5 minutes
          </p>
          <div className="process-steps">
            <ProcessStep
              number={1}
              title="Connect Vesting Contract"
              description="Link your wallet and authorize read access to your vesting schedule. We verify token unlock dates and amounts on-chain."
              timeEstimate="1 minute"
            />
            <ProcessStep
              number={2}
              title="Get Instant Quote"
              description="See your borrowing power based on vesting schedule. Choose loan amount, duration, and LTV. Review terms and APR."
              timeEstimate="2 minutes"
            />
            <ProcessStep
              number={3}
              title="Receive USDC"
              description="Sign transaction to create loan vault. USDC instantly transferred to your wallet. Loan auto-repays as tokens vest."
              timeEstimate="1-2 minutes"
            />
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="landing-section landing-section-dark" aria-labelledby="use-cases-title">
        <div className="landing-section-content">
          <h2 id="use-cases-title" className="landing-section-title">
            Who Benefits?
          </h2>
          <div className="use-cases-grid">
            <UseCaseCard
              emoji="🚀"
              title="Startup Employees"
              description="Access your equity before IPO/exit. Pay for down payment, tuition, or living expenses without selling unvested tokens."
            />
            <UseCaseCard
              emoji="💼"
              title="Token Contributors"
              description="Bridge income gaps during vesting cliffs. Maintain upside exposure while accessing working capital today."
            />
            <UseCaseCard
              emoji="🏗️"
              title="Protocol Treasuries"
              description="Unlock operational liquidity from ecosystem fund vesting. Deploy capital without diluting governance power."
            />
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="landing-section" aria-labelledby="testimonials-title">
        <div className="landing-section-content">
          <h2 id="testimonials-title" className="landing-section-title">
            Trusted by Web3 Builders
          </h2>
          <div className="testimonials-grid">
            <TestimonialCard
              quote="Got $50K against my unvested tokens in 5 minutes. No paperwork, no phone calls. Just connected wallet and done."
              name="Sarah Chen"
              role="Protocol Engineer"
              company="Layer 2 Startup"
            />
            <TestimonialCard
              quote="VESTRA let us access treasury funds without selling governance tokens. Game-changer for DAO operations."
              name="Marcus Johnson"
              role="Treasury Lead"
              company="DeFi DAO"
            />
            <TestimonialCard
              quote="Finally, a way to unlock my equity without waiting 4 years. Paid off student loans without sacrificing upside."
              name="Alex Rivera"
              role="Smart Contract Dev"
              company="Web3 Company"
            />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="landing-section landing-section-dark" aria-labelledby="faq-title">
        <div className="landing-section-content">
          <h2 id="faq-title" className="landing-section-title">
            Common Questions
          </h2>
          <div className="faq-list">
            <FAQItem
              question="What happens if token price crashes?"
              answer="Loans auto-repay from vested tokens, not market value. Since repayment is based on the actual token unlock schedule, there's no liquidation risk from price volatility. You only pay back the agreed-upon percentage of tokens as they vest."
            />
            <FAQItem
              question="Which vesting contracts are supported?"
              answer="We support most standard vesting contracts including Sablier, Streamflow, Hedgey, and custom implementations. Our system verifies the vesting schedule on-chain before approving loans. Contact us if you have a custom contract."
            />
            <FAQItem
              question="What are the fees?"
              answer="We charge a one-time origination fee of 2% and an APR that varies based on token volatility and vesting schedule. No prepayment penalties or hidden fees. All costs are transparent in the loan terms before you sign."
            />
            <FAQItem
              question="Is this audited?"
              answer="Yes, our smart contracts are audited by OpenZeppelin and Consensys Diligence. We also have an active bug bounty program and maintain a security insurance fund. All code is open-source and verified on-chain."
            />
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="landing-section landing-cta-section" aria-labelledby="cta-title">
        <div className="landing-section-content">
          <h2 id="cta-title" className="landing-cta-title">
            Ready to unlock your vested tokens?
          </h2>
          <p className="landing-cta-subtitle">
            Join 200+ builders accessing liquidity on VESTRA
          </p>
          <div className="landing-cta-actions">
            <button
              onClick={() => navigate('/dashboard')}
              className="landing-primary-button"
              type="button"
              aria-label="Launch VESTRA application on testnet"
            >
              Launch App (Testnet)
            </button>
            <button
              onClick={() => navigate('/about')}
              className="landing-secondary-button"
              type="button"
            >
              Schedule Demo Call
            </button>
          </div>
          <p className="landing-hero-disclaimer" style={{ marginTop: '24px' }}>
            Testnet only • Base Sepolia • No real funds at risk
          </p>
        </div>
      </section>
    </div>
  );
}
