# Risk Committee Charter

The Vestra Risk Committee is responsible for the manual oversight of parameters that the AI Watcher (Omega) cannot yet automate.

## Responsibilities
1.  **Ticker Listing Review**: Approving new collateral types and assigning them to Tiers (1, 2, or 3).
2.  **Emergency Stop**: Ability to pause `createLoan` functions for specific assets during system-wide failures.
3.  **Parameter Tuning**: Manual adjustment of the base risk-free rate ($r$) and the volatility floors ($\sigma$).
4.  **Strategic Recourse Review**: Oversighting the auction of high-value default claims ($1M+).

## Governance & Voting
- The Risk Committee is a 5-of-7 Multi-sig.
- Members include Protocol Founders, Lead Risk Officers, and 3rd-party Security Auditors.
- A **veto** by the Risk Committee can override an Omega-driven LTV adjustment if it detects an "edge-case" that the neural network has not yet encountered.
