// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useNavigate } from 'react-router-dom';
import Seal from '../components/landing/Seal.jsx';
import '../styles/pages.css';

const FACTS = [
  {
    label: 'Collateral',
    value: 'Vesting streams',
    note: 'Sablier v2 Lockup (non-cancelable), Streamflow EVM, governance-approved ERC-721 claims.'
  },
  { label: 'Loans', value: 'Non-recourse', note: 'The escrowed stream is the only collateral.' },
  { label: 'Lending pool', value: 'ERC-4626', note: 'Floating rate; interest accrues into the share price.' },
  { label: 'Stage', value: 'Testnet', note: 'Independent audit required before mainnet.' }
];

const STATUS = [
  {
    date: 'Oct 2026',
    title: 'Core contracts rebuilt',
    body: 'A single LoanManager, an ERC-4626 lending pool, a fixed vesting adapter, valuation engine and insurance vault, covered by 35 tests including regressions for every finding of an internal adversarial review.'
  },
  {
    date: 'Oct 2026',
    title: 'Whitepaper v4.1',
    body: 'Rewritten to describe exactly what the contracts do. Mechanisms that are not built — AI-driven risk signals, staged tranche auctions — are labelled as roadmap.'
  },
  {
    date: 'Next',
    title: 'Independent audit',
    body: 'An external audit of the core contracts, published in full, before any mainnet deployment.'
  }
];

export default function About() {
  const navigate = useNavigate();

  return (
    <div className="stack px-page">
      <header className="page-header px-hero">
        <div>
          <p className="vx-eyebrow">The protocol</p>
          <h1 className="page-title">
            A credit market for time that has <em>not yet passed.</em>
          </h1>
          <p className="page-subtitle">
            Vestra lets people who hold vesting tokens borrow against them before they unlock — without selling, and
            without handing the tokens to anyone. It is built to be legible: every rule is in a contract, and every
            parameter is public.
          </p>
          <div className="inline-actions">
            <button className="button" type="button" onClick={() => navigate('/docs?doc=whitepaper')}>
              Read the whitepaper
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/hiring')}>
              Join the build
            </button>
          </div>
        </div>
        <Seal size={132} className="px-hero__seal" />
      </header>

      <dl className="px-facts">
        {FACTS.map((f) => (
          <div key={f.label} className="px-fact">
            <dt className="stat-label">{f.label}</dt>
            <dd>
              <span className="stat-value">{f.value}</span>
              <span className="px-fact__note">{f.note}</span>
            </dd>
          </div>
        ))}
      </dl>

      <section className="px-split">
        <div>
          <p className="vx-eyebrow">Why it exists</p>
          <h2 className="section-title">Paper wealth, real obligations.</h2>
        </div>
        <div className="px-prose">
          <p>
            Vesting is how networks keep the people who build them aligned with their future. It also means those
            people often hold most of their net worth in tokens they cannot touch for years, while rent, payroll and
            taxes arrive on schedule.
          </p>
          <p>
            Today the choices are poor: sell the locked allocation to an OTC desk at a steep discount, or wait and sell
            on unlock day alongside everyone else. Both give away the upside the vesting was meant to protect.
          </p>
          <p>
            Vestra offers a loan instead — secured only by the stream itself, priced conservatively for the time left
            to unlock, and settled by open auction if it ever goes wrong.
          </p>
        </div>
      </section>

      <section className="px-split">
        <div>
          <p className="vx-eyebrow">Where it stands</p>
          <h2 className="section-title">The record, as it is.</h2>
        </div>
        <ol className="px-record">
          {STATUS.map((s) => (
            <li key={s.title}>
              <span className="vx-serial">{s.date}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="vx-certificate px-join">
        <h2 className="section-title">Join the build</h2>
        <p className="muted">
          A small team, working in the open. If careful credit infrastructure is the kind of work you want to do, we
          would like to hear from you.
        </p>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/hiring')}>
            View open roles
          </button>
          <a href="https://tally.so/r/vestra-apply" target="_blank" rel="noopener noreferrer" className="button ghost">
            Apply
          </a>
        </div>
      </section>
    </div>
  );
}
