# Vestra — DeFi Moonshots Deck

11-slide presentation for the Sui DeFi Moonshots application.

## Export to PDF

### Option 1: Browser (simplest)
1. Open `vestra-moonshots-deck.html` in Chrome, Edge, or Firefox
2. Press `Cmd+P` (Mac) or `Ctrl+P` (Windows)
3. **Destination** → **Save as PDF** (or **Print to PDF**)
4. **More settings** → Enable "Background graphics" for correct colors
5. Save as `vestra-moonshots-deck.pdf` (must be ≤10 MB for Tally upload)

### Option 2: Playwright (automated)
Requires Playwright in `frontend/`. From project root:
```bash
cd frontend && npx playwright install chromium
cd .. && node scripts/export-deck-pdf.js
```
Output: `docs/deck/vestra-moonshots-deck.pdf`

## Slides
1. Title
2. The Problem (illiquidity paradox)
3. Market Opportunity ($300–500B)
4. The Solution (DPV, non-custodial)
5. How It Works (5-step flow)
6. Key Innovations (Moonshots fit)
7. Technical Architecture
8. Business Model & Fee Structure
9. Roadmap
10. Why Vestra for Moonshots
11. Contact

## Navigation
- **Next** → Arrow Right or Space
- **Prev** → Arrow Left
- Or use the on-screen buttons
