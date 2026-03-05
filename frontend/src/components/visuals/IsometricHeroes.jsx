// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
/**
 * IsometricVaultHero — an animated isometric 3D visualization
 * showing stacked vesting vault blocks with flowing liquidity rails.
 * Pure SVG + CSS animation, zero external dependencies.
 */
import { useEffect, useRef } from 'react';

// Isometric projection helpers
const ISO_SCALE = 0.58; // Math.tan(30°) ≈ 0.577
function isoProject(x, y, z, ox = 0, oy = 0) {
    const ix = (x - z) * Math.cos(Math.PI / 6);
    const iy = (x + z) * Math.sin(Math.PI / 6) - y;
    return { x: ix + ox, y: iy + oy };
}

function Block({ cx, cy, w, h, d, color, highlight, shadow, animated, delay = 0 }) {
    // Draw a single isometric block: top face + right face + left face
    const tl = isoProject(-w / 2, h, d / 2, cx, cy);
    const tr = isoProject(w / 2, h, d / 2, cx, cy);
    const tc = isoProject(0, h, 0, cx, cy);
    const tm = isoProject(w / 2, h, -d / 2, cx, cy);
    const bl = isoProject(-w / 2, 0, d / 2, cx, cy);
    const br = isoProject(w / 2, 0, d / 2, cx, cy);
    const bm = isoProject(w / 2, 0, -d / 2, cx, cy);
    const fl = isoProject(-w / 2, 0, -d / 2, cx, cy);

    const topPts = [tl, tr, tm, tc].map(p => `${p.x},${p.y}`).join(' ');
    const rightPts = [tr, tm, bm, br].map(p => `${p.x},${p.y}`).join(' ');
    const leftPts = [tl, tc, fl, bl].map(p => `${p.x},${p.y}`).join(' ');

    const animStyle = animated
        ? { animation: `iso-float 3s ease-in-out ${delay}s infinite alternate` }
        : {};

    return (
        <g style={animStyle}>
            <polygon points={topPts} fill={highlight} opacity="0.95" />
            <polygon points={rightPts} fill={shadow} opacity="0.9" />
            <polygon points={leftPts} fill={color} opacity="0.88" />
        </g>
    );
}

// A glowing flowing line connecting two isometric points
function Rail({ from, to, color = '#3b82f6', delay = 0 }) {
    return (
        <line
            x1={from.x} y1={from.y}
            x2={to.x} y2={to.y}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.5"
            style={{ animation: `iso-dash 2s linear ${delay}s infinite` }}
        />
    );
}

// Orbiting node around a center point
function OrbitNode({ cx, cy, r, angle, color, size = 3 }) {
    const nx = cx + r * Math.cos((angle * Math.PI) / 180);
    const ny = cy + r * Math.sin((angle * Math.PI) / 180);
    return (
        <>
            <circle cx={nx} cy={ny} r={size} fill={color} opacity="0.9" />
            <circle cx={nx} cy={ny} r={size + 2} fill={color} opacity="0.2" />
        </>
    );
}

export function IsometricVaultHero({ width = 420, height = 220 }) {
    const cx = width / 2;
    const cy = height * 0.55;

    // Stacked vault blocks — bottom to top
    const blocks = [
        { level: 0, w: 80, h: 16, d: 80, color: '#0e3077', highlight: '#1646b1', shadow: '#081d4a' },
        { level: 16, w: 68, h: 16, d: 68, color: '#1646b1', highlight: '#2563eb', shadow: '#0e3077' },
        { level: 32, w: 56, h: 16, d: 56, color: '#2563eb', highlight: '#3b82f6', shadow: '#1646b1' },
        { level: 48, w: 44, h: 16, d: 44, color: '#3b82f6', highlight: '#60a5fa', shadow: '#2563eb' },
    ];

    // Gold accent layer (vesting token capsule)
    const goldBlock = { level: 64, w: 32, h: 12, d: 32, color: '#7b5913', highlight: '#d99a22', shadow: '#573f0e' };

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{ overflow: 'visible' }}
        >
            <defs>
                <radialGradient id="iso-bg-glow" cx="50%" cy="60%" r="40%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </radialGradient>
                <filter id="iso-glow-filter">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <style>{`
          @keyframes iso-float {
            from { transform: translateY(0px); }
            to   { transform: translateY(-6px); }
          }
          @keyframes iso-dash {
            to { stroke-dashoffset: -16; }
          }
          @keyframes iso-orbit {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes iso-pulse {
            0%, 100% { opacity: 0.4; r: 6; }
            50%       { opacity: 0.9; r: 9; }
          }
        `}</style>
            </defs>

            {/* Ambient glow base */}
            <ellipse cx={cx} cy={cy + 10} rx={90} ry={20} fill="url(#iso-bg-glow)" />

            {/* Shadow ellipse under vault */}
            <ellipse cx={cx} cy={cy + 14} rx={60} ry={12} fill="rgba(59,130,246,0.07)" />

            {/* Stacked blocks */}
            {blocks.map((b, i) => (
                <Block
                    key={i}
                    cx={cx} cy={cy - b.level * ISO_SCALE}
                    w={b.w} h={b.h} d={b.d}
                    color={b.color} highlight={b.highlight} shadow={b.shadow}
                    animated={i === blocks.length - 1}
                    delay={0}
                />
            ))}

            {/* Gold vesting capsule (top) */}
            <g style={{ animation: 'iso-float 2.5s ease-in-out 0.3s infinite alternate' }}>
                <Block
                    cx={cx} cy={cy - goldBlock.level * ISO_SCALE}
                    w={goldBlock.w} h={goldBlock.h} d={goldBlock.d}
                    color={goldBlock.color} highlight={goldBlock.highlight} shadow={goldBlock.shadow}
                    animated={false}
                />
                {/* Glow atop gold block */}
                <circle
                    cx={cx} cy={cy - (goldBlock.level + goldBlock.h + 3) * ISO_SCALE}
                    r="6"
                    fill="#d99a22"
                    opacity="0.7"
                    filter="url(#iso-glow-filter)"
                    style={{ animation: 'iso-pulse 2s ease-in-out infinite' }}
                />
            </g>

            {/* Orbit ring around vault */}
            <g style={{ transformOrigin: `${cx}px ${cy - 20}px`, animation: 'iso-orbit 8s linear infinite' }}>
                <OrbitNode cx={cx} cy={cy - 20} r={72} angle={0} color="#60a5fa" size={3} />
                <OrbitNode cx={cx} cy={cy - 20} r={72} angle={120} color="#d99a22" size={2.5} />
                <OrbitNode cx={cx} cy={cy - 20} r={72} angle={240} color="#60a5fa" size={2} />
            </g>

            {/* Liquidity rail lines emanating from both sides */}
            {[-1, 1].map((dir, i) => {
                const base = isoProject(dir * 40, 16, 0, cx, cy);
                const tip = isoProject(dir * 90, 0, 0, cx, cy);
                return <Rail key={i} from={base} to={tip} color={dir > 0 ? '#3b82f6' : '#d99a22'} delay={i * 0.5} />;
            })}

            {/* Node terminals at rail ends */}
            {[-1, 1].map((dir, i) => {
                const tip = isoProject(dir * 90, 0, 0, cx, cy);
                return (
                    <g key={i}>
                        <circle cx={tip.x} cy={tip.y} r={4} fill={dir > 0 ? '#3b82f6' : '#d99a22'} opacity="0.9" />
                        <circle cx={tip.x} cy={tip.y} r={8} fill={dir > 0 ? '#3b82f6' : '#d99a22'} opacity="0.15" />
                    </g>
                );
            })}
        </svg>
    );
}

/**
 * IsometricIdentityPassport — animated isometric passport/shield
 * with scanning beam and verification tier rings.
 */
export function IsometricIdentityPassport({ width = 320, height = 200, tier = 0 }) {
    const cx = width / 2;
    const cy = height * 0.52;

    const tierColors = [
        { base: '#334155', top: '#475569', shadow: '#1e293b' },   // 0 - Anonymous
        { base: '#1e3a5f', top: '#2563eb', shadow: '#0e3077' },   // 1 - Basic
        { base: '#065f46', top: '#10b981', shadow: '#064e3b' },   // 2 - Standard
        { base: '#1a4731', top: '#34d399', shadow: '#065f46' },   // 3 - Verified
        { base: '#7b5913', top: '#d99a22', shadow: '#573f0e' },   // 4 - Trusted
        { base: '#3b0764', top: '#a855f7', shadow: '#2e1065' },   // 5 - Institutional
    ];
    const tc = tierColors[Math.min(tier, 5)];

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id="id-scan" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={tc.top} stopOpacity="0" />
                    <stop offset="50%" stopColor={tc.top} stopOpacity="0.5" />
                    <stop offset="100%" stopColor={tc.top} stopOpacity="0" />
                </linearGradient>
                <style>{`
          @keyframes id-scan { 0% { transform:translateY(-40px); opacity:0.7; } 100% { transform:translateY(60px); opacity:0; } }
          @keyframes id-float { from { transform:translateY(0); } to { transform:translateY(-5px); } }
          @keyframes id-ring  { 0%,100% { opacity:0.25; } 50% { opacity:0.7; } }
        `}</style>
            </defs>

            {/* Verification tier rings */}
            {[40, 55, 70].slice(0, Math.min(tier + 1, 3)).map((r, i) => (
                <circle key={i} cx={cx} cy={cy} r={r}
                    stroke={tc.top} strokeWidth="0.75" fill="none" opacity="0.3"
                    strokeDasharray="3 5"
                    style={{ animation: `id-ring ${2 + i * 0.5}s ease-in-out ${i * 0.3}s infinite` }}
                />
            ))}

            {/* Passport body — isometric card */}
            <g style={{ animation: 'id-float 3s ease-in-out infinite alternate' }}>
                <Block cx={cx} cy={cy} w={60} h={8} d={80} color={tc.base} highlight={tc.top} shadow={tc.shadow} />
                {/* Scan beam */}
                <rect
                    x={cx - 30} y={cy - 40} width={60} height={80}
                    fill="url(#id-scan)"
                    opacity="0.6"
                    style={{ animation: 'id-scan 2.5s ease-in-out infinite' }}
                />
                {/* Chip */}
                <rect x={cx - 8} y={cy - 6} width={16} height={12} rx="2"
                    fill={tc.top} opacity="0.8" />
                <rect x={cx - 5} y={cy - 3} width={10} height={6} rx="1"
                    fill="#0a0f1e" opacity="0.6" />
            </g>

            {/* Central glyph / verified check */}
            {tier >= 2 && (
                <g style={{ animation: 'id-float 2.8s ease-in-out 0.4s infinite alternate' }}>
                    <circle cx={cx} cy={cy - 22} r={10} fill={tc.top} opacity="0.9" />
                    <path d={`M${cx - 5} ${cy - 22} l4 4 l6-8`}
                        stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
            )}
        </svg>
    );
}
