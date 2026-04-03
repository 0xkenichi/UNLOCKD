import{r as d,j as e,A as T,m as g}from"./index-Cu9Lq934.js";import{S as y}from"./shield-CPY_W9g5.js";import{c}from"./createLucideIcon-DdrpZVII.js";import{U as v}from"./users-DH4tGveJ.js";import{K as C}from"./key-CuoV1NNh.js";const A=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],I=c("chevron-right",A);const R=[["path",{d:"M21.801 10A10 10 0 1 1 17 3.335",key:"yps3ct"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]],m=c("circle-check-big",R);const z=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]],P=c("copy",z);const E=[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]],F=c("eye-off",E);const M=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],V=c("eye",M);const W=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],D=c("file-text",W);const _=[["path",{d:"m16 17 5-5-5-5",key:"1bji2h"}],["path",{d:"M21 12H9",key:"dn1m92"}],["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}]],N=c("log-out",_);const B=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],L=c("plus",B);const O=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],H=c("trash-2",O);const $=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],j=c("triangle-alert",$),q="vestra-finch-2025-Ω",f="vestra_admin_session",b="vestra_admin_whitelist",G=[{id:"risk-engine-internals",title:"Risk Engine Internals v2",category:"PROPRIETARY",classification:"TOP SECRET",summary:"Internal mechanics of the Monte Carlo DPV model, TWAP oracle integration, and volatility surface generation.",content:`# Risk Engine Internals — DPV Model (v2)

**Classification: Proprietary — Do Not Distribute**  
**Author: Finch / Vestra Protocol Core**

---

## 1. Overview

The Discounted Present Value (DPV) engine is the core of Vestra Protocol's collateral valuation. It prices unvested token allocations using a combination of:
- Time-weighted average price (TWAP) from on-chain oracle feeds
- Monte Carlo volatility simulation (10,000 paths × 30s intervals)
- Haircut curves calibrated per unlock duration

## 2. TWAP Oracle Integration

\`\`\`
P_twap = (Σ priceᵢ × timeᵢ) / totalWindow

Window: 3600s default, configurable per token
Stale Price Threshold: maxPriceAge = 300s
Circuit Breaker: if |P_spot - P_twap| > 20%, reject valuation
\`\`\`

## 3. Monte Carlo Simulation

Each valuation runs 10,000 GBM paths:
\`\`\`
S(t) = S(0) × exp((μ - σ²/2)t + σ√t × Z)
where Z ~ N(0,1)
\`\`\`

LTV is the 5th percentile of the terminal price distribution discounted to present value.

## 4. Staged Liquidation Thresholds

| Tier | Health Factor | Action |
|------|---------------|--------|
| 1 | ≥ 1.10 | Healthy, no action |
| 2 | 1.00 – 1.09 | Soft warning, UI alert |
| 3 | 0.90 – 0.99 | Staged tranche auction begins |
| 4 | < 0.90 | Full liquidation, insurance vault covers deficit |

## 5. Insurance Vault Backstop

The InsuranceVault.sol holds a reserve funded by 5% of all origination fees. Bad debt from defaulted loans is written down against this reserve, ensuring lenders face zero net loss.`},{id:"institutional-architecture",title:"Institutional Architecture Blueprint",category:"ARCHITECTURE",classification:"CONFIDENTIAL",summary:"Full layered architecture including private loan rooms, isolated pools, flash-pump circuit breakers, and geo-blocking strategy.",content:`# Institutional Architecture Blueprint

**Classification: Confidential — Vestra Core Team Only**  
**Author: Finch / Protocol Architecture**

---

## 1. Private Loan Rooms

Private loans operate via a vault-based escrow model where the counterparty is an onchain vault address, not a public borrower. This:
- Hides borrower identity from public indexers
- Routes settlement through institutional vault interfaces
- Allows for custom liquidation preferences per institution

## 2. Isolated Lending Pools

Each token category has its own lending pool shard, preventing cross-contamination of liquidity. High-risk tokens (recently listed, low liquidity) are capped at 15% LTV maximum regardless of DPV output.

## 3. Flash-Pump Circuit Breakers

Three-layer defense:
1. **TWAP Gate**: Spot price must be within 20% of TWAP
2. **Volume Anomaly Detector**: Flags tokens with 5× normal trading volume in 3600s window
3. **Admin Override**: Protocol owner can pause a specific token feed within 30s

## 4. SEC Geo-Blocking Strategy

Geo-blocked at the frontend level based on Cloudflare IP geolocation. Smart contract layer remains neutral. Blocked jurisdictions: US, UK (pending), restricted markets.

## 5. Fractional LTV Capping

For tokens with cliff-based schedules, LTV is fractionally capped based on the percentage of allocation that has not vested. This prevents borrowing against theoretically vested tokens that are practically non-liquid.`},{id:"tokenomics-internal",title:"CRDT Full Tokenomics (Internal)",category:"TOKENOMICS",classification:"RESTRICTED",summary:"Full CRDT allocation breakdown including team, advisor and seed round vesting schedules not yet publicly disclosed.",content:`# CRDT Tokenomics — Internal Full Version

**Classification: Restricted**  
**Author: Finch / Vestra Protocol**

---

## Total Supply: 100,000,000 CRDT

| Tranche | Allocation | Cliff | Vesting |
|---------|------------|-------|---------|
| Protocol Treasury | 25% | 12mo | 48mo |
| Team & Founders | 15% | 12mo | 36mo |
| Ecosystem Grants | 15% | 3mo | 24mo |
| Community Airdrop | 10% | 0mo | 12mo |
| Liquidity Incentives | 10% | 0mo | 18mo |
| Seed Round | 8% | 6mo | 24mo |
| Strategic Partners | 7% | 6mo | 18mo |
| Security Reserve | 5% | 12mo | 60mo |
| Advisory | 3% | 6mo | 18mo |
| Public Sale | 2% | 0mo | 0mo |

## Seed Round Details (Not Public)

Seed at: $0.025 / CRDT  
Round size: $2M  
Participants: [REDACTED — see legal folder]  
SAFT signed: Yes

## Advisor Wallets

All advisor allocations are held in Sablier v2 linear vesting wallets with cliff. Advisor identity disclosed only in legal agreements.`},{id:"founder-notes",title:"Founder Vision & Roadmap Notes",category:"STRATEGY",classification:"CONFIDENTIAL",summary:"Finch's working notes on product vision, market positioning, and the Phase 2 feature roadmap.",content:`# Founder Notes — Vision & Roadmap

**Author: Finch**  
**Classification: Confidential**

---

## Core Thesis

The $300B+ locked in vesting schedules globally is the most overlooked liquidity gap in crypto. Every startup team member, investor, and advisor is sitting on illiquid paper wealth they cannot touch. Vestra captures this market by being the first protocol to price and lend against these schedules in a fully non-custodial, trustless manner.

## Phase 1 (Current)

- Core borrow/lend mechanics live on Base Sepolia testnet
- TWAP + Monte Carlo DPV model validated with 100+ scenario suite
- Institutional stress tests passing: SEC geo-blocking, flash pump circuit breakers, fractional LTV caps

## Phase 2 (Q3 2025)

- Mainnet launch on Base
- Sablier V2 native integration
- Cross-chain vesting support (Flow EVM, Avalanche)
- UI for institutional liquidity providers (private pool creation)

## Phase 3 (Q1 2026)

- Governance via CRDT token
- DAO-controlled parameter updates
- Partnerships with major token issuers for white-label vesting credit solutions

## Competitive Moat

Vestra's moat is the DPV engine. No competitor currently uses Monte Carlo simulation for vesting-based collateral. The moment this goes live on mainnet with adequate liquidity, the network effects become self-reinforcing — more borrowers → more yield → more lenders → more liquidity for borrowers.`}],U=[{id:"vault",label:"IP Vault",icon:D},{id:"whitelist",label:"Whitelist",icon:v}];function Y(s,n){navigator.clipboard.writeText(s).then(()=>{n(!0),setTimeout(()=>n(!1),2e3)})}function K({onLogin:s}){const[n,a]=d.useState(""),[o,t]=d.useState(!1),[i,x]=d.useState(""),[h,u]=d.useState(!1),p=l=>{l.preventDefault(),n===q?(sessionStorage.setItem(f,"1"),s()):(x("Invalid passphrase. Access denied."),u(!0),setTimeout(()=>u(!1),600),a(""))};return e.jsx("div",{style:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.15) 0%, transparent 60%), var(--surface-base)",padding:"var(--space-6)"},children:e.jsxs(g.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0,x:h?[-8,8,-8,8,0]:0},transition:{duration:.4},style:{width:"100%",maxWidth:"400px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(139,92,246,0.3)",borderRadius:"24px",padding:"48px 40px",backdropFilter:"blur(20px)",boxShadow:"0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)"},children:[e.jsxs("div",{style:{textAlign:"center",marginBottom:"40px"},children:[e.jsx("div",{style:{width:"64px",height:"64px",borderRadius:"20px",background:"linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.3))",border:"1px solid rgba(139,92,246,0.4)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"},children:e.jsx(y,{size:32,color:"#a78bfa"})}),e.jsx("h1",{style:{margin:0,fontSize:"24px",fontWeight:800,color:"#fff",fontFamily:"var(--font-display)"},children:"Admin Portal"}),e.jsx("p",{style:{margin:"8px 0 0",color:"#64748b",fontSize:"14px"},children:"Restricted access. Super admins only."})]}),e.jsxs("form",{onSubmit:p,children:[e.jsxs("div",{style:{position:"relative",marginBottom:"16px"},children:[e.jsx(C,{size:16,style:{position:"absolute",left:"16px",top:"50%",transform:"translateY(-50%)",color:"#475569",pointerEvents:"none"}}),e.jsx("input",{type:o?"text":"password",value:n,onChange:l=>{a(l.target.value),x("")},placeholder:"Enter super admin passphrase",style:{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.04)",border:`1px solid ${i?"rgba(239,68,68,0.4)":"rgba(255,255,255,0.08)"}`,borderRadius:"12px",padding:"14px 48px 14px 44px",color:"#fff",fontSize:"15px",outline:"none",fontFamily:"var(--font-family)",transition:"border-color 0.2s"},onFocus:l=>{i||(l.target.style.borderColor="rgba(139,92,246,0.5)")},onBlur:l=>{i||(l.target.style.borderColor="rgba(255,255,255,0.08)")}}),e.jsx("button",{type:"button",onClick:()=>t(l=>!l),style:{position:"absolute",right:"12px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#475569",cursor:"pointer",padding:"4px"},children:o?e.jsx(F,{size:16}):e.jsx(V,{size:16})})]}),i&&e.jsxs("p",{style:{color:"#f87171",fontSize:"13px",margin:"0 0 16px",display:"flex",alignItems:"center",gap:"6px"},children:[e.jsx(j,{size:14})," ",i]}),e.jsx("button",{type:"submit",style:{width:"100%",padding:"14px",borderRadius:"12px",border:"none",background:"linear-gradient(135deg, #7c3aed, #3b82f6)",color:"#fff",fontSize:"15px",fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(124,58,237,0.4)",transition:"all 0.2s"},children:"Access Admin Portal"})]})]})})}function J(){const[s,n]=d.useState(null),a={"TOP SECRET":{bg:"rgba(239,68,68,0.1)",border:"rgba(239,68,68,0.3)",text:"#f87171"},CONFIDENTIAL:{bg:"rgba(245,158,11,0.1)",border:"rgba(245,158,11,0.3)",text:"#fbbf24"},RESTRICTED:{bg:"rgba(59,130,246,0.1)",border:"rgba(59,130,246,0.3)",text:"#60a5fa"}};if(s){const o=a[s.classification]||a.RESTRICTED;return e.jsxs(g.div,{initial:{opacity:0},animate:{opacity:1},transition:{duration:.2},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px",marginBottom:"24px"},children:[e.jsx("button",{onClick:()=>n(null),style:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#94a3b8",padding:"6px 12px",cursor:"pointer",fontSize:"13px"},children:"← Back"}),e.jsx("span",{style:{fontSize:"12px",fontWeight:700,color:o.text,background:o.bg,border:`1px solid ${o.border}`,padding:"3px 10px",borderRadius:"6px"},children:s.classification}),e.jsx("h2",{style:{margin:0,color:"#fff",fontSize:"18px",fontFamily:"var(--font-display)"},children:s.title})]}),e.jsxs("div",{style:{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"16px",padding:"32px",fontFamily:"var(--font-family)",color:"#cbd5e1",lineHeight:1.8},children:[e.jsx("style",{children:".admin-md h1,.admin-md h2,.admin-md h3{color:#fff;font-family:var(--font-display);margin:1.5rem 0 0.75rem;}.admin-md code{background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-family:monospace;}.admin-md pre{background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;overflow-x:auto;}.admin-md table{width:100%;border-collapse:collapse;}.admin-md th,.admin-md td{padding:8px 12px;border:1px solid rgba(255,255,255,0.06);text-align:left;}.admin-md th{background:rgba(255,255,255,0.04);color:#fff;}"}),e.jsx("div",{className:"admin-md",children:s.content.split(`
`).map((t,i)=>t.startsWith("# ")?e.jsx("h1",{children:t.slice(2)},i):t.startsWith("## ")?e.jsx("h2",{children:t.slice(3)},i):t.startsWith("### ")?e.jsx("h3",{children:t.slice(4)},i):t.startsWith("```")?null:t.startsWith("| ")?e.jsx("p",{style:{fontFamily:"monospace",fontSize:"13px"},children:t},i):t.startsWith("**")&&t.endsWith("**")?e.jsx("strong",{style:{display:"block",color:"#fff"},children:t.slice(2,-2)},i):t==="---"?e.jsx("hr",{style:{border:"none",borderTop:"1px solid rgba(255,255,255,0.08)",margin:"24px 0"}},i):t===""?e.jsx("br",{},i):e.jsx("p",{style:{margin:"0 0 4px"},children:t},i))})]})]})}return e.jsxs("div",{children:[e.jsxs("div",{style:{marginBottom:"24px"},children:[e.jsx("h2",{style:{margin:"0 0 8px",color:"#fff",fontFamily:"var(--font-display)"},children:"Intellectual Property Vault"}),e.jsx("p",{style:{margin:0,color:"#64748b",fontSize:"14px"},children:"Classified documents not available in public documentation."})]}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))",gap:"16px"},children:G.map(o=>{const t=a[o.classification]||a.RESTRICTED;return e.jsxs(g.div,{onClick:()=>n(o),whileHover:{y:-2,boxShadow:"0 12px 32px rgba(0,0,0,0.3)"},style:{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"16px",padding:"24px",cursor:"pointer",transition:"all 0.2s"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"},children:[e.jsx("span",{style:{fontSize:"11px",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.08em"},children:o.category}),e.jsx("span",{style:{fontSize:"11px",fontWeight:700,color:t.text,background:t.bg,border:`1px solid ${t.border}`,padding:"2px 8px",borderRadius:"4px"},children:o.classification})]}),e.jsx("h3",{style:{margin:"0 0 8px",color:"#fff",fontSize:"16px",fontFamily:"var(--font-display)"},children:o.title}),e.jsx("p",{style:{margin:"0 0 16px",color:"#64748b",fontSize:"13px",lineHeight:1.5},children:o.summary}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"6px",color:"#7c3aed",fontSize:"13px",fontWeight:600},children:["View Document ",e.jsx(I,{size:14})]})]},o.id)})})]})}function Q(){const[s,n]=d.useState(()=>{try{return JSON.parse(localStorage.getItem(b)||"[]")}catch{return[]}}),[a,o]=d.useState(""),[t,i]=d.useState(""),[x,h]=d.useState(""),[u,p]=d.useState(""),l=r=>{n(r),localStorage.setItem(b,JSON.stringify(r))},k=()=>{if(!a.match(/^0x[0-9a-fA-F]{40}$/)){p("Invalid Ethereum address format.");return}if(s.some(r=>r.address.toLowerCase()===a.toLowerCase())){p("Address already in whitelist.");return}l([...s,{address:a,label:t||"Unlabeled",addedAt:Date.now()}]),o(""),i(""),p("")},S=r=>l(s.filter(w=>w.address!==r));return e.jsxs("div",{children:[e.jsxs("div",{style:{marginBottom:"24px"},children:[e.jsx("h2",{style:{margin:"0 0 8px",color:"#fff",fontFamily:"var(--font-display)"},children:"Whitelist Management"}),e.jsx("p",{style:{margin:0,color:"#64748b",fontSize:"14px"},children:"Manage test wallets and authorized addresses for the admin portal."})]}),e.jsxs("div",{style:{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"16px",padding:"24px",marginBottom:"24px"},children:[e.jsx("h3",{style:{margin:"0 0 16px",color:"#fff",fontSize:"15px"},children:"Add Address"}),e.jsxs("div",{style:{display:"flex",gap:"12px",flexWrap:"wrap"},children:[e.jsx("input",{value:a,onChange:r=>{o(r.target.value),p("")},placeholder:"0x... wallet address",style:{flex:"1 1 260px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",padding:"10px 14px",color:"#fff",fontSize:"14px",outline:"none",fontFamily:"monospace"}}),e.jsx("input",{value:t,onChange:r=>i(r.target.value),placeholder:"Label (optional)",style:{flex:"1 1 150px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",padding:"10px 14px",color:"#fff",fontSize:"14px",outline:"none",fontFamily:"var(--font-family)"}}),e.jsxs("button",{onClick:k,style:{display:"flex",alignItems:"center",gap:"6px",padding:"10px 20px",borderRadius:"10px",border:"none",background:"linear-gradient(135deg, #7c3aed, #3b82f6)",color:"#fff",fontSize:"14px",fontWeight:600,cursor:"pointer"},children:[e.jsx(L,{size:16})," Add"]})]}),u&&e.jsxs("p",{style:{color:"#f87171",fontSize:"13px",margin:"10px 0 0",display:"flex",alignItems:"center",gap:"6px"},children:[e.jsx(j,{size:13})," ",u]})]}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:[s.length===0&&e.jsxs("div",{style:{textAlign:"center",padding:"48px",color:"#475569"},children:[e.jsx(v,{size:32,style:{marginBottom:"12px",opacity:.4}}),e.jsx("p",{style:{margin:0},children:"No whitelisted addresses yet."})]}),s.map(r=>e.jsxs(g.div,{initial:{opacity:0,y:8},animate:{opacity:1,y:0},style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",padding:"14px 20px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:"12px",flexWrap:"wrap"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px",minWidth:0},children:[e.jsx(m,{size:16,color:"#34d399"}),e.jsxs("div",{children:[e.jsx("div",{style:{color:"#fff",fontSize:"14px",fontWeight:600},children:r.label}),e.jsx("div",{style:{color:"#64748b",fontSize:"12px",fontFamily:"monospace"},children:r.address})]})]}),e.jsxs("div",{style:{display:"flex",gap:"8px"},children:[e.jsx("button",{onClick:()=>Y(r.address,()=>h(r.address)),style:{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:x===r.address?"#34d399":"#94a3b8",padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:"4px",fontSize:"12px"},children:x===r.address?e.jsx(m,{size:13}):e.jsx(P,{size:13})}),e.jsx("button",{onClick:()=>S(r.address),style:{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"8px",color:"#f87171",padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center"},children:e.jsx(H,{size:13})})]})]},r.address))]})]})}function oe(){const[s,n]=d.useState(()=>sessionStorage.getItem(f)==="1"),[a,o]=d.useState("vault"),t=()=>{sessionStorage.removeItem(f),n(!1)};return s?e.jsxs("div",{style:{minHeight:"100vh",background:"var(--surface-base)",padding:"var(--space-6)"},children:[e.jsxs("div",{style:{maxWidth:"1200px",margin:"0 auto 32px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"12px"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:"12px"},children:[e.jsx("div",{style:{width:"40px",height:"40px",borderRadius:"12px",background:"linear-gradient(135deg, rgba(124,58,237,0.3), rgba(59,130,246,0.3))",border:"1px solid rgba(124,58,237,0.4)",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx(y,{size:20,color:"#a78bfa"})}),e.jsxs("div",{children:[e.jsx("h1",{style:{margin:0,fontSize:"20px",fontWeight:800,color:"#fff",fontFamily:"var(--font-display)"},children:"Vestra Admin Portal"}),e.jsxs("p",{style:{margin:0,color:"#64748b",fontSize:"13px"},children:["Super Administrator Access · ",e.jsx("span",{style:{color:"#34d399"},children:"● Active Session"})]})]})]}),e.jsxs("button",{onClick:t,style:{display:"flex",alignItems:"center",gap:"6px",padding:"8px 16px",borderRadius:"10px",border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.08)",color:"#f87171",fontSize:"13px",fontWeight:600,cursor:"pointer"},children:[e.jsx(N,{size:14})," Sign Out"]})]}),e.jsxs("div",{style:{maxWidth:"1200px",margin:"0 auto"},children:[e.jsx("div",{style:{display:"flex",gap:"8px",marginBottom:"32px",borderBottom:"1px solid rgba(255,255,255,0.06)",paddingBottom:"0"},children:U.map(i=>e.jsxs("button",{onClick:()=>o(i.id),style:{display:"flex",alignItems:"center",gap:"8px",padding:"10px 20px",background:"none",borderRadius:"0",border:"none",borderBottom:`2px solid ${a===i.id?"#7c3aed":"transparent"}`,color:a===i.id?"#fff":"#64748b",fontSize:"14px",fontWeight:600,cursor:"pointer",marginBottom:"-1px",transition:"all 0.2s"},children:[e.jsx(i.icon,{size:16}),i.label]},i.id))}),e.jsx(T,{mode:"wait",children:e.jsxs(g.div,{initial:{opacity:0,y:10},animate:{opacity:1,y:0},exit:{opacity:0},transition:{duration:.2},children:[a==="vault"&&e.jsx(J,{}),a==="whitelist"&&e.jsx(Q,{})]},a)})]})]}):e.jsx(K,{onLogin:()=>n(!0)})}export{oe as default};
//# sourceMappingURL=Admin-CehYUIIw.js.map
