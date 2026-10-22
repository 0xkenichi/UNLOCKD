// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

const DIGITS = '0123456789'.split('');
const CYCLES = 3;

/**
 * Odometer figure. Each digit is a strip of 0–9 repeated three times; the
 * strip's resting offset (--y) shows the true value, so the markup is correct
 * with no JavaScript and under reduced motion. Digits nearer the right sit in
 * a later cycle, so they travel further when rolled — like a real counter.
 * The roll itself is CSS (`.vx-odo--intro`) or GSAP (scrubbed, landing page).
 */
export default function Odometer({ value, className = '', intro = false, delay = 0 }) {
  const chars = String(value).split('');
  const digitCount = chars.filter((c) => /\d/.test(c)).length;
  let seen = 0;

  return (
    <span className={`vx-odo ${intro ? 'vx-odo--intro' : ''} ${className}`} style={{ '--odo-delay': `${delay}ms` }}>
      <span className="vx-sr">{value}</span>
      <span className="vx-odo__digits" aria-hidden="true">
        {chars.map((ch, i) => {
          if (!/\d/.test(ch)) {
            return (
              <span key={i} className="vx-odo__sep">
                {ch}
              </span>
            );
          }
          const fromRight = digitCount - 1 - seen;
          seen += 1;
          const cycle = fromRight < 2 ? 2 : fromRight < 5 ? 1 : 0;
          const index = cycle * 10 + Number(ch);
          const offset = (-index * 100) / (DIGITS.length * CYCLES);
          return (
            <span key={i} className="vx-odo__col" style={{ '--i': fromRight }}>
              <span className="vx-odo__strip" data-y={offset} style={{ '--y': `${offset}%` }}>
                {Array.from({ length: CYCLES }, (_, c) =>
                  DIGITS.map((d) => <span key={`${c}${d}`}>{d}</span>)
                )}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
