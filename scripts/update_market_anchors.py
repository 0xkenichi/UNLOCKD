#!/usr/bin/env python3
"""
Refresh market anchor blocks in tokenomics docs using live/public APIs.

Updates:
- docs/TOKENOMICS_FINAL.md
- docs/private/tokenomics/PERSONAL_TOKENOMICS_PLAYBOOK.md
- docs/private/tokenomics/live_tokenomics_calculator.html
"""

from __future__ import annotations

import datetime as dt
import json
import re
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOKENOMICS_DOC = ROOT / "docs" / "TOKENOMICS_FINAL.md"
PLAYBOOK_DOC = ROOT / "docs" / "private" / "tokenomics" / "PERSONAL_TOKENOMICS_PLAYBOOK.md"
CALCULATOR_HTML = ROOT / "docs" / "private" / "tokenomics" / "live_tokenomics_calculator.html"

ANCHOR_START = "<!-- MARKET_ANCHORS_START -->"
ANCHOR_END = "<!-- MARKET_ANCHORS_END -->"

# Primary, cited constants from source reports.
US_NEEDS_T = 9.139
US_FUNDED_T = 5.450
US_GAP_T = 3.689
GLOBAL_NEED_T = 94.0
GLOBAL_NEED_SDG_T = 97.0
GLOBAL_GAP_T = 18.0


def fetch_json(url: str) -> dict | list:
    with urllib.request.urlopen(url, timeout=20) as response:
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=20) as response:
        return response.read().decode("utf-8", errors="ignore")


def fmt_trillions(value: float) -> str:
    return f"${value:.3f}T"


def fmt_billions(value: float) -> str:
    return f"${value:.2f}B"


def ts_to_date_str(ts: int) -> str:
    return dt.datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d")


def replace_anchor_block(path: Path, replacement_block: str) -> None:
    content = path.read_text(encoding="utf-8")
    pattern = re.compile(
        re.escape(ANCHOR_START) + r".*?" + re.escape(ANCHOR_END),
        flags=re.DOTALL,
    )
    updated = pattern.sub(replacement_block.strip(), content, count=1)
    if updated == content:
        raise RuntimeError(f"Anchor markers not found in {path}")
    path.write_text(updated + ("\n" if not updated.endswith("\n") else ""), encoding="utf-8")


def extract_tokenomist_values() -> tuple[float, float]:
    # Defaults preserve previous validated values if parsing fails.
    annual_unlock_b = 97.43
    weekly_release_b = 1.38
    try:
        text = fetch_text("https://tokenomist.ai/unlocks")
    except Exception:
        return annual_unlock_b, weekly_release_b

    annual_match = re.search(
        r"with \$([0-9]+(?:\.[0-9]+)?)B in total tokens released",
        text,
        flags=re.IGNORECASE,
    )
    if annual_match:
        annual_unlock_b = float(annual_match.group(1))

    weekly_match = re.search(
        r"\$([0-9]+(?:\.[0-9]+)?)B\s*Release this week",
        text,
        flags=re.IGNORECASE,
    )
    if weekly_match:
        weekly_release_b = float(weekly_match.group(1))

    return annual_unlock_b, weekly_release_b


def get_market_data() -> dict[str, float | str]:
    charts = fetch_json("https://api.llama.fi/charts")
    last_chart = charts[-1]
    tvl_b = float(last_chart["totalLiquidityUSD"]) / 1e9
    tvl_date = ts_to_date_str(int(last_chart["date"]))

    stable = fetch_json("https://stablecoins.llama.fi/stablecoincharts/all")
    last_stable = stable[-1]
    stable_b = float(last_stable["totalCirculatingUSD"]["peggedUSD"]) / 1e9
    stable_date = ts_to_date_str(int(last_stable["date"]))

    cg = fetch_json("https://api.coingecko.com/api/v3/global")["data"]
    mcap_t = float(cg["total_market_cap"]["usd"]) / 1e12
    mcap_date = ts_to_date_str(int(cg["updated_at"]))

    annual_unlock_b, weekly_release_b = extract_tokenomist_values()

    return {
        "snapshot_date": min(tvl_date, stable_date, mcap_date),
        "crypto_mcap_t": mcap_t,
        "defi_tvl_b": tvl_b,
        "stablecoins_b": stable_b,
        "annual_unlock_b": annual_unlock_b,
        "weekly_release_b": weekly_release_b,
    }


def aggressive_scenario(annual_unlock_b: float) -> dict[str, float]:
    eligibility_rate = 0.60
    adoption_rate = 0.25
    avg_ltv = 0.45
    capital_velocity = 1.8
    take_rate = 0.012

    addressable_b = annual_unlock_b * eligibility_rate
    onboarded_b = addressable_b * adoption_rate
    credit_capacity_b = onboarded_b * avg_ltv
    annual_loan_volume_b = credit_capacity_b * capital_velocity
    protocol_revenue_m = annual_loan_volume_b * take_rate * 1_000

    return {
        "eligibility_rate": eligibility_rate,
        "adoption_rate": adoption_rate,
        "avg_ltv": avg_ltv,
        "capital_velocity": capital_velocity,
        "take_rate": take_rate,
        "addressable_b": addressable_b,
        "onboarded_b": onboarded_b,
        "credit_capacity_b": credit_capacity_b,
        "annual_loan_volume_b": annual_loan_volume_b,
        "protocol_revenue_m": protocol_revenue_m,
    }


def build_tokenomics_block(data: dict[str, float | str], scenario: dict[str, float]) -> str:
    snapshot = str(data["snapshot_date"])
    return f"""{ANCHOR_START}
## Market Potential Baseline (Data Snapshot, {snapshot})

This section anchors growth assumptions to external market data so expansion targets are auditable.

### Core Market Inputs

- U.S. infrastructure needs (2024-2033): `{fmt_trillions(US_NEEDS_T)}`; funded: `{fmt_trillions(US_FUNDED_T)}`; gap: `{fmt_trillions(US_GAP_T)}`.
- Global infrastructure need to 2040: `${GLOBAL_NEED_T:.0f}T` baseline (`${GLOBAL_NEED_SDG_T:.0f}T` including SDG water/electricity needs), with `${GLOBAL_GAP_T:.0f}T` unfunded if current trends persist.
- Total crypto market cap: `${data["crypto_mcap_t"]:.3f}T` (point-in-time global market value).
- DeFi TVL: `${data["defi_tvl_b"]:.2f}B` (total onchain value actively deployed in protocols).
- Stablecoin circulating value: `${data["stablecoins_b"]:.2f}B` (liquidity base for settlement and lending).
- Token unlock flow proxy: Tokenomist reports `${data["annual_unlock_b"]:.2f}B` of total token releases in 2025, and `${data["weekly_release_b"]:.2f}B` release activity in the current week.

### What This Means For CRDT/UNLOCKD

- Infrastructure has a large structural funding deficit; we target a narrow financing wedge, not the full infrastructure asset base.
- Crypto has enough liquidity depth to support a large collateralized credit layer if risk filters are strict.
- Unlock/vesting flows are already near the `$100B` annual scale, supporting the thesis that "illiquid token value -> credit capacity" is a real market, not a hypothetical.

### Aggressive Scenario (Data-Anchored)

Using token unlock flow as the liquidity entry universe:

- Annual unlock universe: `${data["annual_unlock_b"]:.2f}B`
- Eligibility haircut (quality + liquidity filters): `{scenario["eligibility_rate"] * 100:.0f}%` -> `${scenario["addressable_b"]:.2f}B` addressable
- Onboarding share: `{scenario["adoption_rate"] * 100:.0f}%` -> `${scenario["onboarded_b"]:.2f}B` onboarded collateral
- Average LTV: `{scenario["avg_ltv"] * 100:.0f}%` -> `${scenario["credit_capacity_b"]:.2f}B` credit capacity
- Capital velocity: `{scenario["capital_velocity"]:.1f}x` -> `${scenario["annual_loan_volume_b"]:.2f}B` annual loan volume
- Protocol take rate: `{scenario["take_rate"] * 100:.1f}%` -> `${scenario["protocol_revenue_m"]:.2f}M` annual protocol revenue

Formula chain:

- `AddressableCollateral = UnlockUniverse * EligibilityRate`
- `OnboardedCollateral = AddressableCollateral * AdoptionRate`
- `CreditCapacity = OnboardedCollateral * AvgLTV`
- `AnnualLoanVolume = CreditCapacity * CapitalVelocity`
- `ProtocolRevenue = AnnualLoanVolume * TakeRate`

### Source Links

- ASCE 2025 Report Card (Executive Summary, investment table): `https://infrastructurereportcard.org/wp-content/uploads/2025/03/Executive-Summary-2025-Natl-IRC-WEB.pdf`
- Global Infrastructure Hub outlook release: `https://www.gihub.org/media/global-infrastructure-investment-need-to-reach-usd97-trillion-by-2040/`
- DeFiLlama TVL API (`/charts`): `https://api.llama.fi/charts`
- DeFiLlama stablecoin API (`/stablecoincharts/all`): `https://stablecoins.llama.fi/stablecoincharts/all`
- CoinGecko global market API: `https://api.coingecko.com/api/v3/global`
- Tokenomist unlock dashboard and insights: `https://tokenomist.ai/unlocks`
{ANCHOR_END}"""


def build_playbook_block(data: dict[str, float | str], scenario: dict[str, float]) -> str:
    snapshot = str(data["snapshot_date"])
    combined_liquidity_b = float(data["defi_tvl_b"]) + float(data["stablecoins_b"])
    return f"""{ANCHOR_START}
## 10) Real Market Data Anchors (Snapshot: {snapshot})

Use these as external boundary conditions before changing internal assumptions:

- **U.S. infrastructure funding gap (2024-2033)**: `{fmt_trillions(US_GAP_T)}` gap (`{fmt_trillions(US_NEEDS_T)}` needs vs `{fmt_trillions(US_FUNDED_T)}` funded).
- **Global infrastructure need to 2040**: `${GLOBAL_NEED_T:.0f}T` baseline (`${GLOBAL_NEED_SDG_T:.0f}T` including SDG water/electricity), with `${GLOBAL_GAP_T:.0f}T` unfunded under current trends.
- **Total crypto market cap**: `${data["crypto_mcap_t"]:.3f}T` (CoinGecko global endpoint).
- **DeFi TVL**: `${data["defi_tvl_b"]:.2f}B` (DeFiLlama charts endpoint).
- **Stablecoin circulating supply**: `${data["stablecoins_b"]:.2f}B` (DeFiLlama stablecoin endpoint).
- **Token unlock flow proxy**:
  - 2025 releases across tracked majors: `${data["annual_unlock_b"]:.2f}B` (Tokenomist annual review).
  - Current dashboard signal: `${data["weekly_release_b"]:.2f}B` release this week.

Why this matters for our thesis:

- A `$100B`-scale vested/unlock universe is already observable in market data.
- Stablecoin + DeFi liquidity base (`~${combined_liquidity_b:.2f}B` combined stack, non-additive risk caveat) is large enough to support multi-billion-dollar collateralized loan books if risk controls hold.
- We should model growth as a capture of unlock flow and available liquidity, not as a share of total infrastructure asset value.

Aggressive reference math (for planning, not forecast):

- `UnlockUniverse = ${data["annual_unlock_b"]:.2f}B`
- `EligibilityRate = {scenario["eligibility_rate"] * 100:.0f}%` -> `Addressable = ${scenario["addressable_b"]:.2f}B`
- `AdoptionRate = {scenario["adoption_rate"] * 100:.0f}%` -> `Onboarded = ${scenario["onboarded_b"]:.2f}B`
- `AvgLTV = {scenario["avg_ltv"] * 100:.0f}%` -> `CreditCapacity = ${scenario["credit_capacity_b"]:.2f}B`
- `CapitalVelocity = {scenario["capital_velocity"]:.1f}x` -> `AnnualLoanVolume = ${scenario["annual_loan_volume_b"]:.2f}B`
- `TakeRate = {scenario["take_rate"] * 100:.1f}%` -> `ProtocolRevenue = ${scenario["protocol_revenue_m"]:.2f}M`

Source links:

- `https://infrastructurereportcard.org/wp-content/uploads/2025/03/Executive-Summary-2025-Natl-IRC-WEB.pdf`
- `https://www.gihub.org/media/global-infrastructure-investment-need-to-reach-usd97-trillion-by-2040/`
- `https://api.llama.fi/charts`
- `https://stablecoins.llama.fi/stablecoincharts/all`
- `https://api.coingecko.com/api/v3/global`
- `https://tokenomist.ai/unlocks`
{ANCHOR_END}"""


def build_html_block(data: dict[str, float | str]) -> str:
    snapshot = str(data["snapshot_date"])
    return f"""{ANCHOR_START}
  <div class="card">
    <h2>Market Data Anchors (as of {snapshot})</h2>
    <p class="small">External reference points for setting realistic scenario assumptions.</p>
    <table>
      <thead>
        <tr><th>Metric</th><th>Value</th><th>Source</th></tr>
      </thead>
      <tbody>
        <tr><td>U.S. Infrastructure Funding Gap (2024-2033)</td><td>{fmt_trillions(US_GAP_T)} ({fmt_trillions(US_NEEDS_T)} needs vs {fmt_trillions(US_FUNDED_T)} funded)</td><td>ASCE 2025 Report Card</td></tr>
        <tr><td>Global Infrastructure Need by 2040</td><td>${GLOBAL_NEED_T:.0f}T baseline (${GLOBAL_NEED_SDG_T:.0f}T incl. SDG water/electricity)</td><td>Global Infrastructure Hub</td></tr>
        <tr><td>Total Crypto Market Cap</td><td>${data["crypto_mcap_t"]:.3f}T</td><td>CoinGecko Global API</td></tr>
        <tr><td>Total DeFi TVL</td><td>${data["defi_tvl_b"]:.2f}B</td><td>DeFiLlama Charts API</td></tr>
        <tr><td>Stablecoin Circulating Supply</td><td>${data["stablecoins_b"]:.2f}B</td><td>DeFiLlama Stablecoins API</td></tr>
        <tr><td>Token Unlock Flow Proxy</td><td>${data["annual_unlock_b"]:.2f}B released in 2025; ${data["weekly_release_b"]:.2f}B release this week</td><td>Tokenomist</td></tr>
      </tbody>
    </table>
    <p class="small" style="margin-top:8px;">
      Source URLs:
      <a href="https://infrastructurereportcard.org/wp-content/uploads/2025/03/Executive-Summary-2025-Natl-IRC-WEB.pdf" target="_blank" rel="noopener">ASCE</a>,
      <a href="https://www.gihub.org/media/global-infrastructure-investment-need-to-reach-usd97-trillion-by-2040/" target="_blank" rel="noopener">GI Hub</a>,
      <a href="https://api.coingecko.com/api/v3/global" target="_blank" rel="noopener">CoinGecko</a>,
      <a href="https://api.llama.fi/charts" target="_blank" rel="noopener">DeFiLlama TVL</a>,
      <a href="https://stablecoins.llama.fi/stablecoincharts/all" target="_blank" rel="noopener">DeFiLlama Stablecoins</a>,
      <a href="https://tokenomist.ai/unlocks" target="_blank" rel="noopener">Tokenomist</a>.
    </p>
  </div>
  {ANCHOR_END}"""


def main() -> None:
    data = get_market_data()
    scenario = aggressive_scenario(float(data["annual_unlock_b"]))

    replace_anchor_block(TOKENOMICS_DOC, build_tokenomics_block(data, scenario))
    replace_anchor_block(PLAYBOOK_DOC, build_playbook_block(data, scenario))
    replace_anchor_block(CALCULATOR_HTML, build_html_block(data))

    print(f"Updated market anchors with snapshot: {data['snapshot_date']}")
    print(
        "Values:",
        f"mcap=${data['crypto_mcap_t']:.3f}T",
        f"tvl=${data['defi_tvl_b']:.2f}B",
        f"stable=${data['stablecoins_b']:.2f}B",
        f"unlock_annual=${data['annual_unlock_b']:.2f}B",
        f"unlock_weekly=${data['weekly_release_b']:.2f}B",
    )


if __name__ == "__main__":
    main()
