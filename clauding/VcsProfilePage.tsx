"use client";

/**
 * /app/profile/page.tsx  —  Vestra Credit Score Profile
 *
 * States: disconnected | loading | loaded | stale | error
 * Sections:
 *   1. Score hero   — animated ring, tier badge, risk multiplier
 *   2. Factor breakdown  — per-category bars with tooltips
 *   3. Tier upgrade path — progress to next tier + upgrade hints
 *   4. dDPV impact  — live LTV / rate / Ω floor preview for a given loan
 *   5. AI Advisor   — Claude-powered personalised upgrade plan
 *   6. Score history sparkline (last 90 days)
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount } from "wagmi";
import {
  computeVcs,
  vcsImpactOnDdpv,
  VcsInput,
  VcsResult,
  VcsTier,
  UpgradeHint,
} from "@/lib/vcsEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreHistoryPoint {
  date: string;
  score: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<VcsTier, { label: string; color: string; bg: string; ring: string }> = {
  TITAN:    { label: "TITAN",    color: "#EF9F27", bg: "#412402", ring: "#EF9F27" },
  PREMIUM:  { label: "PREMIUM",  color: "#5DCAA5", bg: "#04342C", ring: "#1D9E75" },
  STANDARD: { label: "STANDARD", color: "#9C9A92", bg: "#2C2C2A", ring: "#5F5E5A" },
};

const EFFORT_COLOR = { LOW: "#1D9E75", MEDIUM: "#BA7517", HIGH: "#A32D2D" };

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({ score, tier }: { score: number; tier: VcsTier }) {
  const pct = score / 1000;
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - pct * 0.75);
  const startAngle = 135;
  const color = TIER_CONFIG[tier].ring;

  return (
    <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" style={{ width: 140, height: 140, transform: "rotate(0deg)" }}>
        {/* Track */}
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 60 60)"
        />
        {/* Fill */}
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${circ}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(135 60 60)"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(.16,1,.3,1)" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 0,
      }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 600, color: "#E8E6DF", lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontSize: 11, color: "#5F5E5A", marginTop: 2 }}>/1000</span>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: VcsTier }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 12px", borderRadius: 99,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
    }}>
      {cfg.label}
    </span>
  );
}

function FactorBar({ label, earned, max, color }: { label: string; earned: number; max: number; color: string }) {
  const pct = Math.min((earned / max) * 100, 100);
  const isNegative = color === "#A32D2D";
  const displayPts = isNegative ? (earned > 0 ? `−${earned}` : "0") : (earned > 0 ? `+${earned}` : "0");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 1fr 36px", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "#9C9A92" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right", color: earned > 0 ? color : "#5F5E5A", fontFamily: "monospace" }}>
        {displayPts}
      </span>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.6s" }} />
      </div>
      <span style={{ fontSize: 11, color: "#5F5E5A", textAlign: "right" }}>/{max}</span>
    </div>
  );
}

function UpgradePill({ hint }: { hint: UpgradeHint }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderRadius: 10,
      border: "0.5px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.02)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 99,
          background: EFFORT_COLOR[hint.effort] + "22",
          color: EFFORT_COLOR[hint.effort],
        }}>
          {hint.effort}
        </span>
        <span style={{ fontSize: 13, color: "#E8E6DF" }}>{hint.action}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#1D9E75", fontFamily: "monospace" }}>
        +{hint.pointsGain}
      </span>
    </div>
  );
}

function DdpvImpactPanel({ vcs }: { vcs: VcsResult }) {
  const [baseLtv, setBaseLtv] = useState(30);
  const [baseRate, setBaseRate] = useState(12);
  const impact = useMemo(
    () => vcsImpactOnDdpv(vcs, baseLtv * 100, baseRate * 100),
    [vcs, baseLtv, baseRate]
  );
  const ltvDelta = (impact.effectiveLtvBps - impact.baseLtvBps) / 100;
  const rateDelta = (impact.effectiveRateBps - impact.baseRateBps) / 100;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 11, color: "#5F5E5A", display: "block", marginBottom: 4 }}>
            Base LTV: {baseLtv}%
          </label>
          <input type="range" min={10} max={50} step={5} value={baseLtv}
            onChange={e => setBaseLtv(Number(e.target.value))} style={{ width: "100%" }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#5F5E5A", display: "block", marginBottom: 4 }}>
            Base APR: {baseRate}%
          </label>
          <input type="range" min={3} max={25} step={1} value={baseRate}
            onChange={e => setBaseRate(Number(e.target.value))} style={{ width: "100%" }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          {
            label: "Effective LTV",
            before: `${baseLtv}%`,
            after: `${(impact.effectiveLtvBps / 100).toFixed(1)}%`,
            delta: ltvDelta > 0 ? `+${ltvDelta.toFixed(1)}%` : null,
            good: true,
          },
          {
            label: "Effective APR",
            before: `${baseRate}%`,
            after: `${(impact.effectiveRateBps / 100).toFixed(1)}%`,
            delta: rateDelta < 0 ? `${rateDelta.toFixed(1)}%` : null,
            good: true,
          },
          {
            label: "Ω floor",
            before: "—",
            after: `${impact.omegaFloor.toFixed(2)}`,
            delta: null,
            good: true,
          },
        ].map(item => (
          <div key={item.label} style={{
            background: "rgba(255,255,255,0.03)",
            border: "0.5px solid rgba(255,255,255,0.07)",
            borderRadius: 10, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: "#5F5E5A", textDecoration: "line-through", marginBottom: 2 }}>{item.before}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#E8E6DF", fontFamily: "monospace" }}>{item.after}</div>
            {item.delta && (
              <div style={{ fontSize: 11, color: "#1D9E75", marginTop: 3 }}>{item.delta} via VCS</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Score Advisor ─────────────────────────────────────────────────────────

function AiAdvisor({ vcs }: { vcs: VcsResult }) {
  const [advice, setAdvice] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const fetchAdvice = useCallback(async () => {
    setLoading(true);
    setAdvice("");
    setDone(false);

    const prompt = `You are the Vestra Protocol credit advisor. A borrower's VCS data:

Score: ${vcs.score}/1000 | Tier: ${vcs.tier} | Risk multiplier: ${vcs.riskMultiplier}
Points to next tier: ${vcs.nextTierDelta ?? "N/A (already TITAN)"}

Category breakdown:
- Identity & Reputation: ${vcs.breakdown.identity.earned}/${vcs.breakdown.identity.max}
- On-chain Activity: ${vcs.breakdown.activity.earned}/${vcs.breakdown.activity.max}
- Credit History: ${vcs.breakdown.creditHistory.earned}/${vcs.breakdown.creditHistory.max}
- Governance: ${vcs.breakdown.governance.earned}/${vcs.breakdown.governance.max}
- Penalties: ${vcs.breakdown.penalties.earned} (deducted)

Top upgrade hints: ${vcs.upgradeHints.map(h => `${h.action} (+${h.pointsGain}pts, ${h.effort} effort)`).join("; ")}

Give the borrower a concise, personalised 3-paragraph credit improvement plan. Be specific about which actions to prioritise, why, and what the concrete borrow limit and rate improvement will be. Institutional tone. No fluff. Max 160 words.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          stream: true,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === "content_block_delta" && json.delta?.text) {
              setAdvice(prev => prev + json.delta.text);
            }
          } catch {}
        }
      }
      setDone(true);
    } catch (err) {
      setAdvice("Unable to load advice. Check your connection.");
      setDone(true);
    } finally {
      setLoading(false);
    }
  }, [vcs]);

  return (
    <div>
      {!advice && !loading && (
        <button
          onClick={fetchAdvice}
          style={{
            width: "100%", padding: "11px 0",
            background: "rgba(29,158,117,0.1)",
            border: "0.5px solid rgba(29,158,117,0.3)",
            borderRadius: 10, color: "#5DCAA5",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          Generate personalised upgrade plan →
        </button>
      )}

      {loading && !advice && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1D9E75", animation: "pulse 1s infinite" }} />
          <span style={{ fontSize: 13, color: "#5F5E5A" }}>Analysing your credit profile…</span>
        </div>
      )}

      {advice && (
        <div>
          <div style={{
            fontSize: 13, lineHeight: 1.7, color: "#C8C6BF",
            whiteSpace: "pre-wrap", borderLeft: "2px solid #1D9E75",
            paddingLeft: 14, marginBottom: done ? 12 : 0,
          }}>
            {advice}
            {!done && <span style={{ color: "#1D9E75" }}>▋</span>}
          </div>
          {done && (
            <button
              onClick={fetchAdvice}
              style={{
                padding: "7px 14px", background: "transparent",
                border: "0.5px solid rgba(255,255,255,0.12)",
                borderRadius: 8, color: "#9C9A92", fontSize: 12, cursor: "pointer",
              }}
            >
              Regenerate
            </button>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ─── Mock data fetcher ────────────────────────────────────────────────────────

async function fetchVcsInput(address: string): Promise<VcsInput> {
  // In production: replace with real provider calls (Gitcoin API, EAS subgraph, etc.)
  await new Promise(r => setTimeout(r, 900));
  return {
    gitcoinPassportScore: 35,
    hasWorldID: true,
    easAttestations: [
      { schema: "0x7a4b2c9d1e6f3a8b5c2d9e4f1a6b3c8d5e2f7a1", attester: "0xVestra", revoked: false },
    ],
    txCount: 340,
    walletAgedays: 480,
    uniqueProtocolsUsed: 6,
    balanceUsd: 12_500,
    totalRepaidLoans: 2,
    totalRepaidUsd: 18_000,
    hasActiveDefaults: false,
    lateRepaymentCount: 0,
    veCrdtBalance: 750,
    gaugeVotesCount: 3,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VcsProfilePage() {
  const { address, isConnected } = useAccount();
  const [vcs, setVcs] = useState<VcsResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [history] = useState<ScoreHistoryPoint[]>(
    Array.from({ length: 12 }, (_, i) => ({
      date: new Date(Date.now() - (11 - i) * 7 * 86400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: 580 + Math.floor(Math.random() * 180),
    }))
  );

  useEffect(() => {
    if (!isConnected || !address) { setStatus("idle"); return; }
    setStatus("loading");
    fetchVcsInput(address)
      .then(input => { setVcs(computeVcs(input)); setStatus("loaded"); })
      .catch(() => setStatus("error"));
  }, [address, isConnected]);

  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "0.5px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: "20px 22px",
      backdropFilter: "blur(12px)",
      marginBottom: 12,
      ...style,
    }}>
      {children}
    </div>
  );

  const sectionLabel = (text: string) => (
    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5F5E5A", marginBottom: 10 }}>
      {text}
    </p>
  );

  if (!isConnected) return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#5F5E5A" }}>
      <span style={{ fontSize: 32 }}>◎</span>
      <p style={{ fontSize: 14 }}>Connect wallet to view your Vestra Credit Score</p>
    </div>
  );

  if (status === "loading") return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 0" }}>
      {[140, 240, 180, 200].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 14, background: "rgba(255,255,255,0.03)", marginBottom: 12, animation: "shimmer 1.5s infinite" }} />
      ))}
      <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );

  if (status === "error") return (
    <div style={{ textAlign: "center", padding: "3rem 0", color: "#A32D2D" }}>
      <p>Failed to load your credit profile. Please try again.</p>
    </div>
  );

  if (!vcs) return null;

  const tierCfg = TIER_CONFIG[vcs.tier];

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 0", color: "#E8E6DF" }}>

      {/* Hero */}
      {card(
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <ScoreRing score={vcs.score} tier={vcs.tier} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <TierBadge tier={vcs.tier} />
              {vcs.nextTierDelta && (
                <span style={{ fontSize: 12, color: "#5F5E5A" }}>
                  {vcs.nextTierDelta} pts to next tier
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {[
                { label: "Risk factor",    val: vcs.riskMultiplier.toFixed(3) },
                { label: "LTV boost",      val: `+${vcs.ltvBoostBps / 100}%` },
                { label: "Rate discount",  val: `${vcs.rateSurchargeOrDiscountBps / 100}%` },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "monospace", color: "#E8E6DF" }}>{m.val}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 3 }}>Max borrow capacity</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: tierCfg.color }}>
                ${vcs.maxBorrowCapUsdc.toLocaleString()} USDC
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Score breakdown */}
      {sectionLabel("Score breakdown")}
      {card(
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { cat: vcs.breakdown.identity,      color: "#1D9E75" },
            { cat: vcs.breakdown.activity,       color: "#185FA5" },
            { cat: vcs.breakdown.creditHistory,  color: "#EF9F27" },
            { cat: vcs.breakdown.governance,     color: "#5DCAA5" },
          ].map(({ cat, color }) => (
            <div key={cat.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#9C9A92" }}>{cat.label}</span>
                <span style={{ fontSize: 12, fontFamily: "monospace", color }}>+{cat.earned}/{cat.max}</span>
              </div>
              {cat.factors.map(f => (
                <FactorBar key={f.label} label={f.label} earned={f.earned} max={f.max} color={color} />
              ))}
            </div>
          ))}
          <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#9C9A92" }}>{vcs.breakdown.penalties.label}</span>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "#A32D2D" }}>
                −{vcs.breakdown.penalties.earned}/{vcs.breakdown.penalties.max}
              </span>
            </div>
            {vcs.breakdown.penalties.factors.map(f => (
              <FactorBar key={f.label} label={f.label} earned={f.earned} max={f.max} color="#A32D2D" />
            ))}
          </div>
        </div>
      )}

      {/* Tier upgrade path */}
      {vcs.nextTierDelta !== null && (
        <>
          {sectionLabel("Path to next tier")}
          {card(
            <div>
              {/* Progress bar */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5F5E5A", marginBottom: 6 }}>
                <span>{vcs.score} pts</span>
                <span>{vcs.tier === "STANDARD" ? 650 : 800} pts</span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99, marginBottom: 16, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 99, background: "#1D9E75",
                  width: `${Math.min(((vcs.score - (vcs.tier === "STANDARD" ? 0 : 650)) / (vcs.nextTierDelta + (vcs.tier === "STANDARD" ? vcs.score - 0 : vcs.score - 650))) * 100, 100).toFixed(1)}%`,
                  transition: "width 0.8s",
                }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {vcs.upgradeHints.map(hint => <UpgradePill key={hint.action} hint={hint} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* dDPV impact */}
      {sectionLabel("dDPV borrow impact")}
      {card(<DdpvImpactPanel vcs={vcs} />)}

      {/* AI Advisor */}
      {sectionLabel("Omega credit advisor")}
      {card(<AiAdvisor vcs={vcs} />)}

      {/* Score history */}
      {sectionLabel("Score history — 12 weeks")}
      {card(
        <div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
            {history.map((pt, i) => {
              const pct = (pt.score - 400) / 600;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: "100%", height: `${Math.max(pct * 60, 4).toFixed(0)}px`,
                    background: pt.score >= 800 ? "#EF9F27" : pt.score >= 650 ? "#1D9E75" : "#5F5E5A",
                    borderRadius: 3, transition: "height 0.4s",
                    opacity: i === history.length - 1 ? 1 : 0.5,
                  }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: "#5F5E5A" }}>{history[0].date}</span>
            <span style={{ fontSize: 10, color: "#5F5E5A" }}>{history[history.length - 1].date}</span>
          </div>
        </div>
      )}

    </div>
  );
}
