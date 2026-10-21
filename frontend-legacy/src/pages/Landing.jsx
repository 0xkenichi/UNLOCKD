// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Guilloche from '../components/landing/Guilloche.jsx';
import Seal from '../components/landing/Seal.jsx';
import '../styles/landing.css';

/*
 * Every figure on this page is derived from the protocol's actual parameters
 * (packages/contracts: ValuationEngine, LoanManager) and the worked example in
 * whitepaper v4.1 §2. No invented statistics, testimonials or partner logos.
 */
const EXAMPLE = (() => {
  const quantity = 100_000;
  const price = 1;
  const years = 1;
  const rate = 0.05; // rank II discount rate
  const sigma = 0.6;
  const ltv = 0.35; // rank II
  const fee = 0.005;
  const pv = quantity * price * Math.exp(-rate * years) * (1 - sigma / 2);
  const maxCredit = pv * ltv;
  return { quantity, pv, maxCredit, received: maxCredit * (1 - fee) };
})();

const usd = (v) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RANKS = [
  { rank: 'I', name: 'Flagship', ltv: '50%', threshold: '65%', discount: '2%' },
  { rank: 'II', name: 'Premium', ltv: '35%', threshold: '50%', discount: '5%' },
  { rank: 'III', name: 'Standard', ltv: '20%', threshold: '35%', discount: '10%' }
];

const ARTICLES = [
  {
    numeral: 'I',
    title: 'Escrow',
    body:
      'You deposit the vesting stream itself — the NFT that represents it — into the VestingAdapter contract. No person or company holds it. Only streams that cannot be cancelled by their sender are admitted, so the collateral cannot be clawed back mid-loan.'
  },
  {
    numeral: 'II',
    title: 'Valuation',
    body:
      'The ValuationEngine prices what the locked tokens are worth today: the lowest of spot, time-weighted and smoothed price, discounted for the time until unlock and for volatility. The result sets the most you can borrow.'
  },
  {
    numeral: 'III',
    title: 'Credit',
    body:
      'USDC is drawn from an ERC-4626 lending pool funded by lenders. The rate floats with how much of the pool is in use. A one-time 0.5% origination fee is the only charge beyond interest.'
  },
  {
    numeral: 'IV',
    title: 'Settlement',
    body:
      'Repay at any time and the stream returns to you, together with anything that vested while it was held. If a loan becomes unsafe or passes maturity, the stream is sold by open Dutch auction; anything above the debt is yours to claim.'
  }
];

const PRINCIPLES = [
  {
    title: 'Non-recourse',
    body: 'The escrowed stream is the only collateral. The protocol has no claim on anything else in your wallet.'
  },
  {
    title: 'No discretionary seizure',
    body:
      'Risk controls can stop new credit against a token. They can never make an existing loan liquidatable or block a liquidation.'
  },
  {
    title: 'Losses are shared in the open',
    body:
      'A shortfall is met first by the insurance reserve, then by all lenders pro rata. A loan entering liquidation is marked down at once, so no lender exits at par ahead of others.'
  },
  {
    title: 'No promised yield',
    body: 'Lenders earn what borrowers pay, net of a 10% reserve. There are no emissions, no boosted rates, no points.'
  }
];

const FAQ = [
  {
    q: 'How is this different from selling OTC?',
    a: 'OTC buyers of locked tokens typically demand a steep discount and take your upside with them. Borrowing against the stream keeps the tokens yours: repay, and every unlock is still yours.'
  },
  {
    q: 'What happens if the token price falls?',
    a: 'Each loan has a liquidation threshold above its maximum loan-to-value. If the debt rises above that share of the collateral’s value, anyone may start a Dutch auction of the stream. You can still repay the full debt during the auction to cancel it.'
  },
  {
    q: 'Which vesting contracts are supported?',
    a: 'Sablier v2 Lockup streams that are not cancelable, Streamflow EVM wrappers, and ERC-721 vesting claims individually approved by governance. Each supported contract is assigned a risk rank before it can be used.'
  },
  {
    q: 'Is it audited? Is it live?',
    a: 'Not yet. The contracts have been rebuilt, reviewed internally and covered by tests, and an independent audit is required before mainnet. Until then, Vestra runs on testnet only.'
  },
  {
    q: 'Can I borrow against tokens that have not launched?',
    a: 'In limited form. Pre-TGE prices are underwriting judgements, not market prices, so they carry a mandatory 90% haircut and a per-loan cap.'
  }
];

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const items = root.querySelectorAll('.vx-reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

function Masthead() {
  return (
    <header className="lx-masthead">
      <div className="lx-wrap lx-masthead__row">
        <Link to="/" className="lx-wordmark" aria-label="Vestra Protocol home">
          <span className="lx-wordmark__name">Vestra</span>
          <span className="lx-wordmark__sub">Vesting Credit</span>
        </Link>
        <nav className="lx-nav" aria-label="Primary">
          <a href="#method">Method</a>
          <a href="#valuation">Valuation</a>
          <a href="#lenders">Lenders</a>
          <a href="#principles">Principles</a>
          <Link to="/docs">Documents</Link>
        </nav>
        <Link to="/borrow" className="button lx-masthead__cta">
          Open the app
        </Link>
      </div>
    </header>
  );
}

function Instrument() {
  return (
    <figure className="lx-instrument vx-certificate">
      <div className="lx-instrument__head">
        <span className="vx-eyebrow">Vesting credit note</span>
        <span className="vx-serial">No. 0001 · Specimen</span>
      </div>
      <div className="lx-instrument__amount">
        <span className="lx-instrument__label">Credit available</span>
        <span className="vx-figure lx-instrument__figure">{usd(EXAMPLE.maxCredit)}</span>
      </div>
      <dl className="lx-instrument__terms">
        <div>
          <dt>Collateral</dt>
          <dd>100,000 tokens, unlocking in 12 months</dd>
        </div>
        <div>
          <dt>Present value</dt>
          <dd className="mono">{usd(EXAMPLE.pv)}</dd>
        </div>
        <div>
          <dt>Rank · max LTV</dt>
          <dd>II · 35%</dd>
        </div>
        <div>
          <dt>You receive</dt>
          <dd className="mono">{usd(EXAMPLE.received)}</dd>
        </div>
      </dl>
      <figcaption className="lx-instrument__foot">
        <span>Specimen. Token at $1.00, volatility 60%. Whitepaper v4.1, §2.</span>
        <Seal size={64} />
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const rootRef = useReveal();
  const [open, setOpen] = useState(0);

  return (
    <div className="lx" ref={rootRef}>
      <Masthead />

      {/* Hero */}
      <section className="lx-hero" aria-labelledby="lx-hero-title">
        <Guilloche className="lx-hero__guilloche" size={760} />
        <div className="lx-wrap lx-hero__grid">
          <div className="lx-hero__copy">
            <p className="vx-eyebrow">Credit against vesting tokens</p>
            <h1 id="lx-hero-title" className="lx-hero__title">
              Liquidity for what you have <em>already earned.</em>
            </h1>
            <p className="lx-hero__lede">
              Borrow USDC against your vesting stream without selling a single token. The stream is held by a contract,
              not a company, and it comes back to you — with everything that vested — the day you repay.
            </p>
            <div className="lx-hero__actions">
              <button type="button" className="button" onClick={() => navigate('/borrow')}>
                Value my vesting
              </button>
              <button type="button" className="button ghost" onClick={() => navigate('/lender')}>
                Lend USDC
              </button>
            </div>
            <p className="lx-hero__status">
              <span className="lx-dot" aria-hidden="true" /> Testnet · Contracts not yet audited
            </p>
          </div>
          <Instrument />
        </div>
      </section>

      {/* Preface */}
      <section className="lx-section lx-preface">
        <div className="lx-wrap lx-preface__grid vx-reveal">
          <p className="lx-preface__drop">
            Vesting aligns the people who build a network with its future. It also leaves them wealthy on paper and
            short of cash for years. The usual ways out — selling locked allocations to OTC desks at a steep discount,
            or selling the day the tokens unlock — give up the very upside the vesting was meant to protect.
          </p>
          <p className="lx-preface__aside">
            Vestra is a third way: a loan secured only by the stream itself, priced conservatively, settled in the open.
          </p>
        </div>
      </section>

      {/* Method */}
      <section id="method" className="lx-section" aria-labelledby="lx-method-title">
        <div className="lx-wrap">
          <div className="lx-section__head vx-reveal">
            <p className="vx-eyebrow">The method</p>
            <h2 id="lx-method-title">Four articles. Nothing hidden between them.</h2>
          </div>
          <ol className="lx-articles">
            {ARTICLES.map((a) => (
              <li key={a.numeral} className="lx-article vx-reveal">
                <span className="lx-article__numeral" aria-hidden="true">
                  {a.numeral}
                </span>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Valuation */}
      <section id="valuation" className="lx-section lx-valuation" aria-labelledby="lx-val-title">
        <div className="lx-wrap lx-valuation__grid">
          <div className="vx-reveal">
            <p className="vx-eyebrow">The valuation</p>
            <h2 id="lx-val-title">A price for time, set down in full.</h2>
            <p className="lx-muted-copy">
              Collateral that cannot be sold today is worth less than the same tokens unlocked. The engine says by how
              much, with every term public and every parameter bounded in the contract.
            </p>
          </div>
          <div className="lx-formula vx-certificate vx-reveal">
            <p className="lx-formula__eq" aria-label="pv equals Q times P times e to the minus r T times one minus sigma over two times omega">
              <var>pv</var> = <var>Q</var> · <var>P</var> · <var>e</var>
              <sup>−rT</sup> · (1 − <var>σ</var>⁄2) · <var>Ω</var>
            </p>
            <dl className="lx-formula__terms">
              <div>
                <dt>Q</dt>
                <dd>Tokens still locked in the stream, read from the stream — never from you.</dd>
              </div>
              <div>
                <dt>P</dt>
                <dd>The lowest of spot, time-weighted average and smoothed price. Stale prices are refused.</dd>
              </div>
              <div>
                <dt>
                  e<sup>−rT</sup>
                </dt>
                <dd>Discount for the time T until unlock, at a rate fixed by the stream’s rank.</dd>
              </div>
              <div>
                <dt>1 − σ⁄2</dt>
                <dd>Volatility haircut, bounded so it can never exceed half the value.</dd>
              </div>
              <div>
                <dt>Ω</dt>
                <dd>A risk control between 0 and 1. It can only reduce new credit; it never touches open loans.</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="lx-wrap">
          <div className="lx-ranks-wrap vx-reveal">
            <div className="lx-ranks__caption">
              <span className="vx-eyebrow">Admission ranks</span>
              <p>
                Collateral is admitted, not merely accepted. Each vesting contract is reviewed and ranked by governance
                before a single loan can be written against it.
              </p>
            </div>
            <table className="lx-ranks">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Class</th>
                  <th scope="col">Max LTV</th>
                  <th scope="col">Liquidation at</th>
                  <th scope="col">Time discount</th>
                </tr>
              </thead>
              <tbody>
                {RANKS.map((r) => (
                  <tr key={r.rank}>
                    <th scope="row" className="lx-ranks__rank">
                      {r.rank}
                    </th>
                    <td>{r.name}</td>
                    <td className="mono">{r.ltv}</td>
                    <td className="mono">{r.threshold}</td>
                    <td className="mono">{r.discount} / yr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Lenders */}
      <section id="lenders" className="lx-section" aria-labelledby="lx-lend-title">
        <div className="lx-wrap lx-lenders">
          <div className="vx-reveal">
            <p className="vx-eyebrow">For lenders</p>
            <h2 id="lx-lend-title">One pool. Plain accounting.</h2>
            <p className="lx-muted-copy">
              Deposit USDC into a standard ERC-4626 vault. Interest accrues into the share price every second, not when
              it happens to be paid. Withdraw whatever is not lent out, whenever you like — pausing the protocol never
              locks withdrawals.
            </p>
            <button type="button" className="button ghost" onClick={() => navigate('/lender')}>
              View the pool
            </button>
          </div>
          <ol className="lx-waterfall vx-reveal" aria-label="Order in which a loss is absorbed">
            <li>
              <span className="vx-serial">01</span>
              <div>
                <strong>Auction proceeds</strong>
                <p>The stream is sold; proceeds repay the loan first.</p>
              </div>
            </li>
            <li>
              <span className="vx-serial">02</span>
              <div>
                <strong>Insurance reserve</strong>
                <p>Funded by 10% of all interest. It can pay only the pool — no one can withdraw it.</p>
              </div>
            </li>
            <li>
              <span className="vx-serial">03</span>
              <div>
                <strong>All lenders, pro rata</strong>
                <p>Any remaining shortfall lowers the share price for every lender equally.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Principles */}
      <section id="principles" className="lx-section lx-principles" aria-labelledby="lx-pr-title">
        <div className="lx-wrap">
          <div className="lx-section__head vx-reveal">
            <p className="vx-eyebrow">Principles</p>
            <h2 id="lx-pr-title">What Vestra will not do.</h2>
          </div>
          <div className="lx-principles__grid">
            {PRINCIPLES.map((p) => (
              <article key={p.title} className="lx-principle vx-reveal">
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="lx-section" aria-labelledby="lx-faq-title">
        <div className="lx-wrap lx-faq">
          <div className="vx-reveal">
            <p className="vx-eyebrow">Questions</p>
            <h2 id="lx-faq-title">Asked, and answered plainly.</h2>
          </div>
          <div className="lx-faq__list vx-reveal">
            {FAQ.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q} className={`lx-faq__item ${isOpen ? 'is-open' : ''}`}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`lx-faq-${i}`}
                      onClick={() => setOpen(isOpen ? -1 : i)}
                    >
                      <span>{item.q}</span>
                      <span className="lx-faq__mark" aria-hidden="true">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                  </h3>
                  <div id={`lx-faq-${i}`} role="region" hidden={!isOpen}>
                    <p>{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="lx-section lx-close">
        <div className="lx-wrap lx-close__inner vx-reveal">
          <Seal size={96} />
          <h2>Keep the tokens. Use the time.</h2>
          <div className="lx-hero__actions">
            <button type="button" className="button" onClick={() => navigate('/borrow')}>
              Value my vesting
            </button>
            <button type="button" className="button ghost" onClick={() => navigate('/docs')}>
              Read the documents
            </button>
          </div>
        </div>
      </section>

      <footer className="lx-colophon">
        <div className="lx-wrap lx-colophon__grid">
          <div>
            <span className="lx-wordmark__name">Vestra</span>
            <p className="lx-colophon__fine">
              Credit against vesting tokens. Testnet. Not financial advice. Borrowing against volatile collateral can
              result in the loss of that collateral.
            </p>
          </div>
          <nav aria-label="Footer">
            <Link to="/docs">Documents</Link>
            <Link to="/about">About</Link>
            <Link to="/governance">Governance</Link>
            <a href="https://github.com/0xkenichi/UNLOCKD" target="_blank" rel="noreferrer">
              Source
            </a>
          </nav>
          <p className="lx-colophon__fine lx-colophon__set">
            Set in Instrument Serif, Inter Tight and IBM Plex Mono. Contracts licensed BSL 1.1.
          </p>
        </div>
      </footer>
    </div>
  );
}
