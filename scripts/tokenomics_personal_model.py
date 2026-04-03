#!/usr/bin/env python3
"""Generate private tokenomics charts and data for personal analysis."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


TOTAL_SUPPLY = 1_000_000_000
MONTHS = np.arange(0, 61)  # 0..60 (5 years)


ALLOCATIONS = {
    "Treasury": 0.30,
    "Team": 0.20,
    "Protocol liquidity reserve": 0.20,
    "Community sale": 0.15,
    "Presale": 0.07,
    "VC / investors": 0.05,
    "Airdrop": 0.03,
}


def token_amount(pct: float) -> float:
    return TOTAL_SUPPLY * pct


def linear_vest(month: np.ndarray, cliff: int, duration: int, total_tokens: float) -> np.ndarray:
    vested = np.zeros_like(month, dtype=float)
    after_cliff = np.maximum(month - cliff, 0)
    vested = np.minimum(after_cliff / duration, 1.0) * total_tokens
    return vested


def tge_plus_linear(month: np.ndarray, tge_pct: float, duration: int, total_tokens: float) -> np.ndarray:
    tge_tokens = total_tokens * tge_pct
    remaining = total_tokens - tge_tokens
    linear = np.minimum(month / duration, 1.0) * remaining
    return tge_tokens + linear


def staged_airdrop(month: np.ndarray, total_tokens: float) -> np.ndarray:
    # Assumption for personal model:
    # 20% claimable at TGE, +30% at month 6, +50% at month 12.
    out = np.zeros_like(month, dtype=float)
    out += np.where(month >= 0, total_tokens * 0.20, 0)
    out += np.where(month >= 6, total_tokens * 0.30, 0)
    out += np.where(month >= 12, total_tokens * 0.50, 0)
    return out


@dataclass
class EmissionScenario:
    name: str
    treasury_release_fraction: float
    liquidity_release_fraction: float


EMISSION_SCENARIOS = [
    EmissionScenario("Conservative", 0.00, 0.00),
    EmissionScenario("Base", 0.20, 0.25),
    EmissionScenario("Aggressive", 0.40, 0.50),
]


def build_unlock_frame() -> pd.DataFrame:
    team = linear_vest(MONTHS, cliff=12, duration=36, total_tokens=token_amount(ALLOCATIONS["Team"]))
    vc = linear_vest(MONTHS, cliff=6, duration=24, total_tokens=token_amount(ALLOCATIONS["VC / investors"]))
    presale = tge_plus_linear(MONTHS, tge_pct=0.10, duration=12, total_tokens=token_amount(ALLOCATIONS["Presale"]))
    community = tge_plus_linear(
        MONTHS, tge_pct=0.25, duration=9, total_tokens=token_amount(ALLOCATIONS["Community sale"])
    )
    airdrop = staged_airdrop(MONTHS, token_amount(ALLOCATIONS["Airdrop"]))

    df = pd.DataFrame(
        {
            "month": MONTHS,
            "team_unlocked": team,
            "vc_unlocked": vc,
            "presale_unlocked": presale,
            "community_unlocked": community,
            "airdrop_unlocked": airdrop,
        }
    )
    df["market_facing_unlocked"] = (
        df["team_unlocked"]
        + df["vc_unlocked"]
        + df["presale_unlocked"]
        + df["community_unlocked"]
        + df["airdrop_unlocked"]
    )
    return df


def add_circulating_scenarios(df: pd.DataFrame) -> pd.DataFrame:
    treasury_total = token_amount(ALLOCATIONS["Treasury"])
    liquidity_total = token_amount(ALLOCATIONS["Protocol liquidity reserve"])
    ratio = df["month"] / 60.0

    for scenario in EMISSION_SCENARIOS:
        treasury_emitted = treasury_total * scenario.treasury_release_fraction * ratio
        liquidity_emitted = liquidity_total * scenario.liquidity_release_fraction * ratio
        df[f"treasury_emitted_{scenario.name.lower()}"] = treasury_emitted
        df[f"liquidity_emitted_{scenario.name.lower()}"] = liquidity_emitted
        df[f"circulating_{scenario.name.lower()}"] = (
            df["market_facing_unlocked"] + treasury_emitted + liquidity_emitted
        )
    return df


def format_millions(ax) -> None:
    ax.yaxis.set_major_formatter(lambda x, _: f"{x/1e6:.0f}M")


def save_unlock_chart(df: pd.DataFrame, out_path: Path) -> None:
    plt.figure(figsize=(12, 6))
    cols = [
        "community_unlocked",
        "presale_unlocked",
        "airdrop_unlocked",
        "vc_unlocked",
        "team_unlocked",
    ]
    labels = ["Community", "Presale", "Airdrop", "VC/Investors", "Team"]
    plt.stackplot(df["month"], [df[c] for c in cols], labels=labels, alpha=0.85)
    plt.title("CRDT Unlock Timeline (Market-Facing Supply)")
    plt.xlabel("Month from TGE")
    plt.ylabel("Cumulative Unlocked Tokens")
    format_millions(plt.gca())
    plt.legend(loc="upper left")
    plt.grid(alpha=0.2)
    plt.tight_layout()
    plt.savefig(out_path, dpi=180)
    plt.close()


def save_circulating_chart(df: pd.DataFrame, out_path: Path) -> None:
    plt.figure(figsize=(12, 6))
    for scenario in EMISSION_SCENARIOS:
        key = f"circulating_{scenario.name.lower()}"
        plt.plot(df["month"], df[key], label=scenario.name, linewidth=2.5)
    plt.title("Circulating Supply Scenarios (Including Governance Emissions)")
    plt.xlabel("Month from TGE")
    plt.ylabel("Circulating Tokens")
    format_millions(plt.gca())
    plt.legend()
    plt.grid(alpha=0.2)
    plt.tight_layout()
    plt.savefig(out_path, dpi=180)
    plt.close()


def save_valuation_chart(df: pd.DataFrame, out_path: Path) -> pd.DataFrame:
    # Price paths for scenario analysis.
    scenario_inputs = {
        "Bear": {"price_0": 0.15, "annual_growth": -0.05},
        "Base": {"price_0": 0.40, "annual_growth": 0.15},
        "Bull": {"price_0": 1.00, "annual_growth": 0.35},
    }

    rows: List[Dict[str, float]] = []
    for name, params in scenario_inputs.items():
        price = params["price_0"] * ((1 + params["annual_growth"]) ** (df["month"] / 12))
        fdv = price * TOTAL_SUPPLY
        mcap = price * df["circulating_base"]
        for m, p, f, c in zip(df["month"], price, fdv, mcap):
            rows.append(
                {
                    "scenario": name,
                    "month": int(m),
                    "price_usd": float(p),
                    "fdv_usd": float(f),
                    "market_cap_usd": float(c),
                }
            )
    val_df = pd.DataFrame(rows)

    plt.figure(figsize=(12, 6))
    for scenario in ["Bear", "Base", "Bull"]:
        s = val_df[val_df["scenario"] == scenario]
        plt.plot(s["month"], s["fdv_usd"], linestyle="--", label=f"{scenario} FDV")
        plt.plot(s["month"], s["market_cap_usd"], linewidth=2.5, label=f"{scenario} Market Cap")
    plt.title("FDV vs Market Cap Projection (Base Circulating Scenario)")
    plt.xlabel("Month from TGE")
    plt.ylabel("USD")
    plt.gca().yaxis.set_major_formatter(lambda x, _: f"${x/1e6:.0f}M")
    plt.legend(ncol=2)
    plt.grid(alpha=0.2)
    plt.tight_layout()
    plt.savefig(out_path, dpi=180)
    plt.close()
    return val_df


def save_fee_projection(out_path: Path) -> pd.DataFrame:
    years = np.array([1, 2, 3, 4, 5])
    loan_books_m = {
        "Low": np.array([8, 12, 18, 25, 35]),
        "Base": np.array([15, 30, 55, 85, 120]),
        "High": np.array([25, 55, 100, 160, 240]),
    }
    protocol_fee_apr = {"Low": 0.020, "Base": 0.025, "High": 0.030}

    rows = []
    for scenario, books in loan_books_m.items():
        fee_apr = protocol_fee_apr[scenario]
        gross_fees = books * 1_000_000 * fee_apr
        lenders = gross_fees * 0.80
        treasury = gross_fees * 0.15
        safety = gross_fees * 0.05
        for y, b, g, l, t, s in zip(years, books, gross_fees, lenders, treasury, safety):
            rows.append(
                {
                    "scenario": scenario,
                    "year": int(y),
                    "avg_loan_book_usd": float(b * 1_000_000),
                    "protocol_fee_apr": fee_apr,
                    "gross_fees_usd": float(g),
                    "to_lenders_usd": float(l),
                    "to_treasury_usd": float(t),
                    "to_safety_usd": float(s),
                }
            )
    fee_df = pd.DataFrame(rows)

    plt.figure(figsize=(12, 6))
    for scenario in ["Low", "Base", "High"]:
        s = fee_df[fee_df["scenario"] == scenario]
        plt.plot(s["year"], s["to_treasury_usd"], marker="o", linewidth=2.5, label=f"{scenario} Treasury")
    plt.title("Treasury Revenue Projection from Fee Routing (15%)")
    plt.xlabel("Year")
    plt.ylabel("USD per year")
    plt.gca().yaxis.set_major_formatter(lambda x, _: f"${x/1e3:.0f}k")
    plt.xticks(years)
    plt.legend()
    plt.grid(alpha=0.2)
    plt.tight_layout()
    plt.savefig(out_path, dpi=180)
    plt.close()
    return fee_df


def save_bridge_chart(val_df: pd.DataFrame, out_path: Path) -> None:
    # Compare market cap / FDV ratio at selected checkpoints under base case.
    base = val_df[val_df["scenario"] == "Base"].copy()
    checkpoints = [0, 12, 24, 36, 48, 60]
    chk = base[base["month"].isin(checkpoints)].copy()
    chk["mcap_to_fdv_ratio"] = chk["market_cap_usd"] / chk["fdv_usd"]

    plt.figure(figsize=(10, 5))
    plt.bar(chk["month"].astype(str), chk["mcap_to_fdv_ratio"], color="#2aa9ff")
    plt.title("Market Cap / FDV Ratio Over Time (Base Case)")
    plt.xlabel("Month from TGE")
    plt.ylabel("Ratio")
    plt.ylim(0, 1)
    plt.grid(axis="y", alpha=0.2)
    plt.tight_layout()
    plt.savefig(out_path, dpi=180)
    plt.close()


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out_dir = root / "docs" / "private" / "tokenomics"
    img_dir = out_dir / "images"
    data_dir = out_dir / "data"
    img_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    unlock_df = build_unlock_frame()
    unlock_df = add_circulating_scenarios(unlock_df)
    unlock_df.to_csv(data_dir / "unlock_and_circulating.csv", index=False)

    save_unlock_chart(unlock_df, img_dir / "unlock_timeline.png")
    save_circulating_chart(unlock_df, img_dir / "circulating_scenarios.png")
    val_df = save_valuation_chart(unlock_df, img_dir / "fdv_vs_market_cap.png")
    val_df.to_csv(data_dir / "valuation_scenarios.csv", index=False)
    fee_df = save_fee_projection(img_dir / "treasury_fee_projection.png")
    fee_df.to_csv(data_dir / "fee_projection.csv", index=False)
    save_bridge_chart(val_df, img_dir / "mcap_to_fdv_ratio.png")

    print(f"Wrote tokenomics assets to: {out_dir}")


if __name__ == "__main__":
    main()
