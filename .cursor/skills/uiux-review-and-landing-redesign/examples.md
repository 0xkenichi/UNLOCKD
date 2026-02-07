# Examples

## Example output format

```markdown
Wireframe: docs/landing-wireframes/lofi-landing-v2.html

Design review summary (counts):
- Critical: 1
- High: 4
- Medium: 6
- Low: 3

Top issues:
1) Critical: Primary CTA is below the fold on mobile.
2) High: Contrast between hero text and background fails AA.
3) High: Navigation labels are inconsistent across sections.

Roadmap:
- Fix CTA placement and contrast in hero (same sprint)
- Normalize spacing and typography scale across sections
- Simplify navigation and reduce cognitive load in feature list

Code changes:
- Updated `frontend/src/pages/Landing.jsx` layout and hierarchy
- Added `frontend/src/components/landing/TrustStrip.jsx`
- Updated `frontend/src/styles.css` for spacing scale and CTA styles
```

## Example wireframe (low fidelity, Markdown)

```text
[Hero / value prop] [reuse]
 - H1: "Borrow against vesting assets"
 - Subhead: "Unlock liquidity without selling"
 - Primary CTA: "Start borrowing"
 - Secondary CTA: "See how it works"

[Trust strip] [new]
 - 3 logos
 - "Audited" badge

[Problem / Solution] [reuse]
 - 3 cards: Speed, Security, Transparency

[How it works] [reuse]
 - Step 1: Connect wallet
 - Step 2: Verify assets
 - Step 3: Borrow

[Proof] [new]
 - 2 testimonials

[FAQ] [reuse]
 - 4 items

[Final CTA] [reuse]
 - H2 + Primary CTA
```
