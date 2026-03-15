from fpdf import FPDF


OUTPUT_PATH = "docs/Vestra_PearX_S26_Pitch_Deck.pdf"


class DeckPDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", size=9)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Vestra Protocol | PearX S26", align="L")
        self.cell(0, 8, f"{self.page_no()}", align="R")


def add_title_slide(pdf, title, subtitle, tagline):
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 36)
    pdf.set_text_color(20, 20, 20)
    pdf.ln(28)
    pdf.multi_cell(0, 16, title)

    pdf.ln(4)
    pdf.set_font("Helvetica", "", 18)
    pdf.set_text_color(55, 55, 55)
    pdf.multi_cell(0, 10, subtitle)

    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 14)
    pdf.set_text_color(85, 85, 85)
    pdf.multi_cell(0, 8, tagline)


def add_bullets_slide(pdf, title, bullets, subtitle=None):
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(20, 20, 20)
    pdf.multi_cell(0, 12, title)

    if subtitle:
        pdf.ln(2)
        pdf.set_font("Helvetica", "", 13)
        pdf.set_text_color(70, 70, 70)
        pdf.multi_cell(0, 7, subtitle)

    pdf.ln(8)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(30, 30, 30)
    for bullet in bullets:
        pdf.set_x(18)
        pdf.multi_cell(0, 9, f"- {bullet}")
        pdf.ln(1)


def add_metrics_slide(pdf, title, metric_rows, note):
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(20, 20, 20)
    pdf.multi_cell(0, 12, title)

    pdf.ln(8)
    left = 15
    col1 = 105
    col2 = 80
    row_h = 12

    pdf.set_fill_color(240, 244, 252)
    pdf.set_draw_color(220, 225, 235)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(col1, row_h, "Metric", border=1, fill=True)
    pdf.cell(col2, row_h, "Value", border=1, ln=1, fill=True)

    pdf.set_font("Helvetica", "", 13)
    for metric, value in metric_rows:
        pdf.set_x(left)
        pdf.cell(col1, row_h, metric, border=1)
        pdf.cell(col2, row_h, value, border=1, ln=1)

    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 11)
    pdf.set_text_color(90, 90, 90)
    pdf.multi_cell(0, 6, note)


def main():
    pdf = DeckPDF("P", "mm", "A4")
    pdf.set_auto_page_break(auto=True, margin=15)

    add_title_slide(
        pdf,
        "Vestra Protocol",
        "Unlocking Liquidity from Vested Token Positions",
        "PearX S26 Application Deck",
    )

    add_bullets_slide(
        pdf,
        "The Problem",
        [
            "Billions in vested and time-locked tokens are economically valuable but operationally illiquid.",
            "Founders, team members, and DAO contributors needing liquidity face OTC discounts or predatory terms.",
            "Traditional DeFi lenders assume spot-liquid collateral and cannot safely underwrite vesting schedules.",
        ],
    )

    add_bullets_slide(
        pdf,
        "Our Solution",
        [
            "A lending protocol purpose-built for vested and locked token collateral.",
            "Schedule-aware underwriting that reflects unlock cadence, transfer rules, and concentration risk.",
            "Onchain lifecycle automation across loan origination, monitoring, repayment, and enforcement.",
            "Borrower UX built around real vesting workflows, not retrofitted spot-collateral flows.",
        ],
    )

    add_bullets_slide(
        pdf,
        "Why Now",
        [
            "Token-based compensation and treasury allocations are increasingly vesting-native.",
            "Credit demand from crypto operators is growing, while existing options remain fragmented and opaque.",
            "Improved onchain observability and contract tooling make robust risk controls practical today.",
        ],
    )

    add_metrics_slide(
        pdf,
        "Market Opportunity (Bottom-Up)",
        [
            ("Target users (initial wedge)", "25,000"),
            ("Users with annual liquidity need", "20%"),
            ("Annual borrowers", "5,000"),
            ("Average first-loan size", "$80,000"),
            ("Potential annual originations", "$400M"),
            ("Implied take rate", "2.5%"),
            ("Initial wedge revenue potential", "$10M / year"),
        ],
        "These assumptions are conservative and focused on the initial user wedge only.",
    )

    add_bullets_slide(
        pdf,
        "Product & Architecture",
        [
            "Smart contracts for collateralized loan state and repayment settlement.",
            "Backend risk + indexer services for vesting-event awareness and exposure controls.",
            "Frontend borrower and repayment flows for simple, transparent execution.",
            "Modular design to expand collateral types and risk models over time.",
        ],
    )

    add_bullets_slide(
        pdf,
        "Traction So Far",
        [
            "Built end-to-end MVP covering borrow, monitor, and repay flows.",
            "Actively interviewing target users (founders, contributors, and token operators).",
            "Refining underwriting parameters from real use-case feedback.",
            "Preparing pilot cohort for controlled private testing.",
        ],
        subtitle="Replace with exact numbers before final investor send.",
    )

    add_bullets_slide(
        pdf,
        "Competition & Differentiation",
        [
            "Generalized DeFi lenders: strong distribution, but not vesting-native underwriting.",
            "OTC/private desks: bespoke but opaque, manual, and expensive for borrowers.",
            "Vestra advantage: vesting-aware risk engine + protocol automation + borrower-first UX.",
            "We focus on a hard wedge others avoid, creating defensible domain expertise.",
        ],
    )

    add_bullets_slide(
        pdf,
        "Why We Win",
        [
            "Novel technical approach to underwriting time-structured collateral safely.",
            "Fast full-stack execution across contracts, backend infrastructure, and product.",
            "Risk-first culture: built for resilience, not just short-term volume.",
            "Clear path from niche wedge to category-defining credit layer.",
        ],
    )

    add_bullets_slide(
        pdf,
        "Roadmap (Next 12 Months)",
        [
            "Launch private beta with design partners and iterate risk thresholds.",
            "Expand eligible collateral profiles and dynamic pricing controls.",
            "Ship production-grade monitoring, incident handling, and governance guardrails.",
            "Scale borrower acquisition through ecosystem, founders, and treasury operators.",
        ],
    )

    add_bullets_slide(
        pdf,
        "The Ask",
        [
            "Join PearX S26 to accelerate go-to-market and tighten pilot-to-scale execution.",
            "Leverage Pear's network for high-signal hiring, distribution, and strategic intros.",
            "Raise partner capital to extend runway and hit post-beta growth milestones.",
        ],
        subtitle="Contact: founders@vestra.xyz | vestra.xyz",
    )

    pdf.output(OUTPUT_PATH)
    print(f"Created {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
