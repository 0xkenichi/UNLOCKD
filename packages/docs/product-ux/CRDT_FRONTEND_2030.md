# CRDT Frontend Design — 2030 Edition
Date: January 28, 2030  
Audience: Product, Design, Frontend, and Protocol Governance

This document captures a futuristic, institutional-grade frontend concept for CRDT (or Vestra) aligned with the protocol’s conservative risk posture. The tone is regulator-friendly and data-rich, emphasizing time‑locked asset primitives, credit continuity, and transparent risk modeling.

## Naming Direction
Primary working name: **CRDT**  
Alternatives that match the institutional tone:
- **CHRONUS** (time-first credit)
- **VAULTIS** (escrow and vault emphasis)
- **LUMENLOCK** (clear, compliant liquidity)

Token: **CRDT**

## Design Principles
- **Institutional-first**: Minimalist, trustworthy, no meme aesthetic.
- **Temporal metaphors**: Clocks, timelines, vaults, and “unlocking” layers.
- **Adaptive depth**: Holographic UI on AR/immersive devices, flat on legacy screens.
- **Conservative risk clarity**: Visual risk warnings and enforced friction for high‑risk actions.
- **Accessibility by default**: Neural/voice-first, multilingual, and biometrics-aware.

## Visual System
### Palette
- Primary: Deep blue `#001F3F` (trust/security)
- Secondary: Graphite `#333333` (depth/layers)
- Accent: Silver `#C0C0C0` (unlocks/highlights)
- Risk accent: Muted red `#B00020` (warnings/limits)

### Backgrounds & Effects
- Starfield‑like void (“Astra”) with vault motifs.
- Subtle gradients (deep blue → silver) to evoke escrow layers.
- Holographic hover glows; avoid neon saturation.

### Typography
- Sans‑serif (Inter 2030 or equivalent variable font).
- Variable weights for data density; minimal decorative styles.

### Iconography
- Time‑themed minimal icons: sandglass, lock, chain, credit stream.
- Animated line‑icons for status transitions (lock → unlock).

## Core Screens
### 1) Landing
- Hero: Holographic tagline — “Liquidity for the future you already own.”
- AI concierge (Grok‑like): “Scan your vesting and simulate DPV.”
- Multi‑chain selector: Ethereum / Base / Avalanche / Abstract with live TVL.
- CTA: “Connect Wallet” morphs into a vault door.

### 2) Dashboard
- 3D timeline of vested positions (flat fallback).
- Holographic loan cards: DPV gauge, LTV slider, risk curve.
- CRDT balance as a glowing orb; staking opens governance and AI advisor.

### 3) Borrow Flow
1. **Escrow**: Drag a vesting claim into the vault.
2. **Valuation**: AI computes DPV with a spinning risk simulation.
3. **Amount selection**: Slider with conservative caps + red risk warnings.
4. **Confirmation**: Voice/biometric approval; clear settlement terms.

### 4) Repayment & Settlement
- Interest accrual as a ticking clock.
- Partial repay by gesture swipe; full repay unlocks vault.
- Default path visualization: “seizure timeline” in AR (optional).

### 5) Governance Portal
- CRDT‑weighted voting in a virtual boardroom.
- Risk committees as nested holograms.
- Proposal timelines with branching outcomes.

### 6) Identity Module (Optional)
- Privacy‑first DID mask; reveals credit history on consent.
- AI explains benefits (e.g., higher LTV, reduced rate).

### 7) Mobile/AR View
- Gesture‑first flows with minimal panels.
- AR overlay: vesting data “attached” to real‑world objects.

## Interactions & Animations
- Fluid, physics‑based transitions (particle escrow, flowing credit streams).
- Time‑lock countdown holograms.
- AI commands generate interactive 3D risk charts on demand.
- Auto‑pause flow on volatility spikes, with explanation.

## Security & Compliance UX
- ZK proofs for credit checks.
- Mandatory biometric 2FA for borrowing actions.
- Prominent risk acknowledgements for high‑LTV positions.
- Audit‑friendly logs and immutable action receipts.

## CRDT Integration
- Governance badges as holographic NFTs.
- Staking CRDT unlocks “AI Credit Advisor.”
- Votes adjust risk parameters with clear disclosure UI.

## Multi‑Chain & Data
- Seamless chain switching (“migrate session” via voice).
- Unified loan dashboard pulling from subgraphs.
- Explicit chain context for all risk calculations.

## 2030‑Ready Tech Stack
- **Frontend**: React 20+ (Vite) + SvelteKit for lightweight modules.
- **Web3**: Wagmi v3+, Viem, RainbowKit, The Graph.
- **3D/AR**: Three.js/WebGL; A‑Frame for AR flows.
- **AI**: Grok API for risk simulations and chat.
- **Privacy**: ZK.js for identity proofs.
- **Infra**: Vercel Edge + IPFS for static content.

## Build Blueprint (Cursor‑Ready)
This section turns the vision into a concrete, buildable plan for the current MVP.

### Stack (MVP Implementation)
- Vite + React (TS)
- Wagmi + Viem + RainbowKit
- Three.js via `@react-three/fiber` + `@react-three/drei`
- Tailwind CSS
- Framer Motion
- TanStack Query

Install:
`npm i three @react-three/fiber @react-three/drei framer-motion`

### Frontend File Structure
```
frontend/
├── public/
│   └── logo.svg
├── src/
│   ├── components/
│   │   ├── common/
│   │   ├── dashboard/
│   │   ├── borrow/
│   │   ├── repay/
│   │   ├── identity/
│   │   ├── auction/
│   │   └── governance/
│   ├── hooks/
│   ├── pages/
│   ├── utils/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   └── vite-env.d.ts
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

### Global Styles (Holographic Baseline)
```
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: linear-gradient(to bottom, #001F3F, #000000);
  color: #C0C0C0;
  font-family: 'Inter', sans-serif;
}

.holo-glow {
  text-shadow: 0 0 10px #C0C0C0;
  transition: text-shadow 0.3s;
}

.holo-glow:hover {
  text-shadow: 0 0 20px #C0C0C0, 0 0 30px #C0C0C0;
}

.vault-3d {
  filter: drop-shadow(0 0 10px #C0C0C0);
}
```

### Core 3D Components (Starter Sketches)
Use React Three Fiber for a holographic layer, with a clean 2D fallback.

**HoloCard**
```
import { Canvas } from '@react-three/fiber';
import { MeshDistortMaterial, OrbitControls } from '@react-three/drei';

const HoloCard = ({ children, distort = 0.3 }) => (
  <div className="vault-3d p-4 bg-graphite rounded-lg">
    <Canvas>
      <mesh>
        <planeGeometry args={[5, 3]} />
        <MeshDistortMaterial distort={distort} speed={3} color="#C0C0C0" />
      </mesh>
      <OrbitControls enableZoom={false} />
      <ambientLight intensity={0.5} />
    </Canvas>
    <div className="absolute top-0 left-0 p-4">{children}</div>
  </div>
);
```

**DashboardHolo**
```
import { Canvas } from '@react-three/fiber';
import { Line } from '@react-three/drei';

const DashboardHolo = ({ positions }) => (
  <HoloCard>
    <h2 className="holo-glow">Your Timeline</h2>
    <Canvas>
      <Line points={[[-5, 0, 0], [5, 0, 0]]} color="#C0C0C0" lineWidth={2} />
      {positions.map((pos, i) => (
        <mesh key={i} position={[i * 2 - 4, 1, 0]}>
          <sphereGeometry args={[0.5]} />
          <meshStandardMaterial color="#001F3F" emissive="#C0C0C0" />
        </mesh>
      ))}
    </Canvas>
  </HoloCard>
);
```

**ValuationPreview3D**
```
import { Canvas } from '@react-three/fiber';
import { Line } from '@react-three/drei';

const ValuationPreview3D = ({ simData }) => (
  <HoloCard distort={0.5}>
    <h3 className="holo-glow">Risk Sim</h3>
    <Canvas>
      {simData.paths.map((path, i) => (
        <Line key={i} points={path} color={i < 50 ? "#ff0000" : "#C0C0C0"} lineWidth={1} />
      ))}
    </Canvas>
  </HoloCard>
);
```

### MVP Page Map
- **Dashboard**: timeline + active loans
- **Borrow**: escrow → valuation → amount → confirm
- **Repay**: repay slider + debt clock
- **Identity**: optional proof flow
- **Governance**: CRDT proposals (read-only for MVP)

### Performance Notes
- Use LOD in Three.js scenes.
- Lazy-load 3D components.
- Provide a flat mode for mobile and low-end devices.

## Wireframe Notes (Optional)
If needed, prepare low‑fidelity wireframes for:
- Landing hero + chain selector
- Dashboard timeline + loan cards
- Borrow flow (4‑step)
- Governance boardroom view
- Identity consent modal

---

# CRDT Frontend: User Flow, Pages, & Implementation Blueprint

## 1) User Flow Diagram (Mermaid-Ready)
```
flowchart TD
  A[Start] --> B[Login / Connect Wallet]
  B --> C[Dashboard: 3D Timeline + Positions]
  C --> D[Borrow Flow: Escrow -> Valuation -> Terms -> Confirm NFT]
  C --> E[Repay Flow: Debt Clock -> Slider -> Confirm]
  C --> F[Auction Flow: List -> Type -> Bid/Reveal -> End]
  C --> G[Governance: Stake -> Proposals -> Vote]
  C --> H[Identity: Mask -> zk-Link -> Tier Upgrade]
  D --> I[Post-Action Summary + AI Insight]
  E --> I
  F --> I
  G --> I
  H --> I
  I --> C
  C --> J[Logout / Chain Switch]
  J --> K[End]
```

## 2) Key Pages (ASCII Wireframe Notes)

### a) Login / Landing
```
+----------------------------------------------+
| [3D Holo-Logo: CRDT Astra Orb Spinning]    |
| Tagline: "Credit for Time-Locked Value"      |
+----------------------------------------------+
| [Connect Wallet Button – RainbowKit]         |
| "Connect to Unlock Your Assets"              |
| [Voice Prompt: "Say 'Connect'"]              |
|                                              |
| [Mini 3D Timeline: Borrow → Repay → Settle]  |
|                                              |
| Footer: [Home | About]                       |
+----------------------------------------------+
```

### b) Connect Wallet Modal
```
[Modal Holo-Frame: Silver Glow]
Header: "Connect Your Wallet"
[RainbowKit Providers]
Chain Selector: [ETH | Base | AVAX | Abstract]
[3D Chain Icons Orbiting]
[zk-Option: "Link Identity for Better Terms"] Toggle
Footer: "Privacy First – No Data Shared"
```

### c) Dashboard
```
[Tabs: Dashboard | Borrow | Repay | Auction | Governance | Identity]
[3D Timeline Spine: Now → Unlocks]
[Position Cards: Holo Vaults w/ PV + LTV + Risk]
[AI Bubble: "Simulate BIO drop?"]
[CRDT Orb: Stake for vote]
```

### d) Global Tab Bar
```
[Graphite Bar + Silver Glow]
Icons: Timeline | Unlock Chain | Credit Stream | Gavel | Orb | Mask
[Chain Toggle Button]
```

## 3) Build Instructions (Vite + React + Web3 + Three.js)

### Scaffold
```
npm create vite@latest crdt-frontend -- --template react-ts
cd crdt-frontend
npm i three @react-three/fiber @react-three/drei wagmi viem @rainbow-me/rainbowkit tailwindcss framer-motion @tanstack/react-query
npx tailwindcss init
```

### `main.tsx` (Wagmi + RainbowKit)
```
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { sepolia, baseSepolia, avalancheFuji, base, mainnet } from 'viem/chains'

const config = getDefaultConfig({
  appName: 'CRDT',
  projectId: 'YOUR_WC_ID',
  chains: [sepolia, baseSepolia, avalancheFuji, base, mainnet],
  ssr: true,
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
```

### `App.tsx` (Routes + UI Shell)
```
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import Dashboard from './pages/Dashboard'
import Borrow from './pages/Borrow'
import Repay from './pages/Repay'
import Auction from './pages/Auction'
import Governance from './pages/Governance'
import Identity from './pages/Identity'
import AIBubble from './components/common/AIBubble'
import TabBar from './components/common/TabBar'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-deep-blue">
        <ConnectButton />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/borrow" element={<Borrow />} />
          <Route path="/repay" element={<Repay />} />
          <Route path="/auction" element={<Auction />} />
          <Route path="/governance" element={<Governance />} />
          <Route path="/identity" element={<Identity />} />
        </Routes>
        <AIBubble />
        <TabBar />
      </div>
    </BrowserRouter>
  )
}

export default App
```

### `Dashboard.tsx` (3D Timeline)
```
import HoloCard from '../components/common/HoloCard'
import DashboardHolo from '../components/dashboard/DashboardHolo'

const Dashboard = () => (
  <div className="p-4">
    <h1 className="holo-glow text-3xl">CRDT Dashboard</h1>
    <HoloCard>
      <DashboardHolo />
    </HoloCard>
  </div>
)
```

### `TabBar.tsx` (3D Icons)
```
import { Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'

const TabBar = () => (
  <div className="fixed bottom-0 w-full bg-graphite flex justify-around">
    <Link to="/">
      <Canvas style={{ width: 40, height: 40 }}>
        <mesh>
          <sphereGeometry />
          <meshBasicMaterial color="#C0C0C0" />
        </mesh>
      </Canvas>
      Dashboard
    </Link>
  </div>
)
```

### `AIBubble.tsx` (Grok‑like Assistant)
```
import { useState } from 'react'

const AIBubble = () => {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState('')

  const handleQuery = async () => {
    setResponse('Simulating BIO drop: 5th % PV = $12,210')
  }

  return (
    <div className="fixed bottom-4 right-4 bg-graphite p-4 rounded-full holo-glow">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about risk?" />
      <button onClick={handleQuery}>Send</button>
      {response && <p>{response}</p>}
    </div>
  )
}
```

## 4) Build Prompts (Cursor)
- “Build CRDT Dashboard with Three.js holographic timeline.”
- “Add Borrow flow wizard with 3D vault spinner + Monte Carlo paths.”
- “Create Repay flow with debt clock + particle stream.”
- “Add Identity flow with mask assembly animation.”
- “Add Auction flow with Dutch/English/Sealed modes.”
