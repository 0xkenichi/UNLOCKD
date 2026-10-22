// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';
import { hypotrochoid } from './Guilloche.jsx';
import Odometer from './Odometer.jsx';

/*
 * "Life of a loan": a sticky stage beside four articles. The stage is a
 * complete static diagram (what reduced-motion visitors and the pre-JS render
 * see). src/motion/landingMotion.js turns it into a scroll-driven sequence:
 * the stream flows into escrow, the valuation assembles, credit is drawn from
 * the pool, and repayment returns the stream.
 *
 * Geometry is in a 640 × 560 viewBox; HTML labels are positioned in % of it.
 */

const VAULT = { x: 330, y: 300, r: 96 };
const BORROWER = { x: 72, y: 300 };

const STREAMS = [-2, -1, 0, 1, 2].map(
  (k) => `M${BORROWER.x + 10} ${BORROWER.y} C150 ${300 + k * 36}, 176 ${300 + k * 30}, ${VAULT.x - VAULT.r} ${300 + k * 10}`
);
const CREDIT = `M448 470 C336 470, 156 474, ${BORROWER.x + 4} ${BORROWER.y + 12}`;
const RETURN = `M262 232 C214 168, 128 176, ${BORROWER.x + 6} ${BORROWER.y - 12}`;
const LIMIT = `M${VAULT.x + VAULT.r} 300 C492 300, 530 336, 530 420`;
const SHACKLE_CLOSED = 'M323 298 L323 290 A7 7 0 0 1 337 290 L337 298';
const SHACKLE_OPEN = 'M323 287 L323 281 A7 7 0 0 1 337 281 L337 298';

const pct = (x, y) => ({ left: `${(x / 640) * 100}%`, top: `${(y / 560) * 100}%` });

export default function LifeOfALoan({ articles, example }) {
  const rosette = useMemo(
    () =>
      [0, 1, 2].map((c) => hypotrochoid(100, 7, 38, 520, (c / 3) * ((Math.PI * 2) / (100 / 7)))),
    []
  );
  const usd = (v) =>
    v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const terms = [
    { sym: 'Q', val: example.quantity.toLocaleString('en-US') },
    { sym: 'P', val: usd(example.price) },
    { sym: <>e<sup>−rT</sup></>, val: Math.exp(-example.rate * example.years).toFixed(4) },
    { sym: <>1 − σ⁄2</>, val: (1 - example.sigma / 2).toFixed(2) },
    { sym: 'Ω', val: '1' }
  ];

  return (
    <div className="lx-life">
      <div className="lx-life__stage-wrap">
        <figure className="lx-life__stage" aria-label="Diagram: a vesting stream held in escrow, valued, borrowed against and returned on repayment">
          <svg className="lx-life__svg" viewBox="0 0 640 560" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id="lx-vault-clip">
                <circle cx={VAULT.x} cy={VAULT.y} r={VAULT.r - 7} />
              </clipPath>
              <clipPath id="lx-pool-clip">
                <rect x="449" y="421" width="162" height="86" />
              </clipPath>
            </defs>

            {/* Lending pool */}
            <g className="lx-life__pool" data-part="pool">
              <rect className="lx-stroke" x="448" y="420" width="164" height="88" />
              <g clipPath="url(#lx-pool-clip)">
                <g className="lx-life__pool-level" data-part="pool-level">
                  {[436, 448, 460, 472, 484, 496].map((y) => (
                    <line key={y} className="lx-stroke lx-stroke--faint" x1="452" x2="608" y1={y} y2={y} />
                  ))}
                  <rect className="lx-life__pool-fill" x="448" y="430" width="164" height="90" />
                </g>
              </g>
            </g>

            {/* Valuation sets the credit limit */}
            <path className="lx-stroke lx-stroke--dash" data-part="limit" d={LIMIT} />

            {/* Credit drawn from the pool to the borrower (and repaid along the same line) */}
            <path className="lx-stroke lx-stroke--accent" data-part="credit" d={CREDIT} />

            {/* Stream returned to the borrower on repayment */}
            <path className="lx-stroke lx-stroke--accent" data-part="return" d={RETURN} />

            {/* The vesting stream flowing into escrow */}
            <g data-part="streams">
              {STREAMS.map((d, i) => (
                <path key={i} className="lx-stroke lx-stroke--stream" d={d} />
              ))}
            </g>

            {/* Escrow vault */}
            <g data-part="vault">
              <g clipPath="url(#lx-vault-clip)">
                <rect
                  className="lx-life__fill"
                  data-part="fill"
                  x={VAULT.x - VAULT.r}
                  y={VAULT.y - VAULT.r}
                  width={VAULT.r * 2}
                  height={VAULT.r * 2}
                />
              </g>
              <circle className="lx-stroke lx-stroke--strong" data-part="ring" cx={VAULT.x} cy={VAULT.y} r={VAULT.r} />
              <circle className="lx-stroke" data-part="ring" cx={VAULT.x} cy={VAULT.y} r={VAULT.r - 6} />
              <g transform={`translate(${VAULT.x} ${VAULT.y}) scale(0.6)`}>
                <g className="lx-life__rosette" data-part="rosette">
                  {rosette.map((d, i) => (
                    <path key={i} className="lx-stroke lx-stroke--faint" d={d} />
                  ))}
                </g>
              </g>
              <circle className="lx-life__lock-bg" cx={VAULT.x} cy={VAULT.y + 2} r="26" />
              <path className="lx-stroke lx-stroke--lock" data-part="shackle" d={SHACKLE_CLOSED} data-open={SHACKLE_OPEN} />
              <rect className="lx-life__lock" x="316" y="297" width="28" height="20" rx="2" />
            </g>

            {/* Borrower */}
            <g data-part="borrower">
              <circle className="lx-stroke" cx={BORROWER.x} cy={BORROWER.y} r="14" />
              <circle className="lx-life__dot" cx={BORROWER.x} cy={BORROWER.y} r="5" />
            </g>
          </svg>
          <canvas className="lx-life__canvas" aria-hidden="true" />

          {/* Labels (HTML so they stay legible at phone widths) */}
          <div className="lx-life__formula" data-part="formula">
            <div className="lx-life__terms">
              <span className="lx-life__op lx-life__pv">pv =</span>
              {terms.map((t, i) => (
                <span key={i} className="lx-life__term-wrap">
                  {i > 0 && <span className="lx-life__op">·</span>}
                  <span className="lx-life__term" data-part="term">
                    <span className="lx-life__sym">{t.sym}</span>
                    <span className="lx-life__val">{t.val}</span>
                  </span>
                </span>
              ))}
            </div>
            <div className="lx-life__result" data-part="pv">
              <span className="lx-life__tag">Present value</span>
              <Odometer value={usd(example.pv)} className="lx-life__pv-figure" />
            </div>
          </div>

          <span className="lx-life__label lx-life__label--center" style={pct(34, 300)} data-part="label-borrower">
            You
          </span>
          <span className="lx-life__label lx-life__label--center" style={pct(VAULT.x, 186)} data-part="label-vault">
            Escrow · VestingAdapter
          </span>
          <span className="lx-life__label lx-life__label--block" style={pct(84, 196)} data-part="label-stream">
            {example.quantity.toLocaleString('en-US')} tokens
            <br />
            unlocking in {example.years * 12} months
          </span>
          <span className="lx-life__label lx-life__label--center" style={pct(530, 528)} data-part="label-pool">
            Lending pool · USDC
          </span>
          <div className="lx-life__credit" style={pct(132, 516)} data-part="label-credit">
            <span className="lx-life__tag">Credit · {Math.round(example.ltv * 100)}% of pv</span>
            <Odometer value={usd(example.maxCredit)} className="lx-life__credit-figure" />
            <span className="lx-life__fine">
              {usd(example.received)} received after the {example.fee * 100}% fee
            </span>
          </div>
          <span className="lx-life__label lx-life__label--accent" style={pct(118, 150)} data-part="label-return">
            Repaid · stream returned
          </span>
        </figure>
      </div>

      <ol className="lx-life__acts">
        {articles.map((a, i) => (
          <li key={a.numeral} className="lx-act" data-act={i}>
            <span className="lx-act__numeral" aria-hidden="true">
              {a.numeral}
            </span>
            <h3 className="lx-act__title">{a.title}</h3>
            <p>{a.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
