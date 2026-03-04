/**
 * VestraIcons — Native brand icon system.
 * Each icon is a pure SVG React component with:
 *   - Electric blue (#3b82f6) primary strokes
 *   - Gold (#d99a22) accent details
 *   - Subtle animated glow via CSS class `vestra-icon`
 *   - Accepts `size`, `className`, and `style` props
 */

const BASE = 24;

function Icon({ size = BASE, className = '', style = {}, viewBox = '0 0 24 24', children }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox={viewBox}
            fill="none"
            className={`vestra-icon ${className}`}
            style={style}
            aria-hidden="true"
        >
            <defs>
                <linearGradient id="vi-blue" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
                <linearGradient id="vi-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f1c572" />
                    <stop offset="100%" stopColor="#d99a22" />
                </linearGradient>
                <filter id="vi-glow">
                    <feGaussianBlur stdDeviation="1.5" result="b" />
                    <feComposite in="SourceGraphic" in2="b" operator="over" />
                </filter>
            </defs>
            {children}
        </svg>
    );
}

// ── Borrow: Unlock with upward credit flow ──────────────────────────────────
export function BorrowIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Lock body */}
            <rect x="5" y="11" width="14" height="10" rx="2" stroke="url(#vi-blue)" strokeWidth="1.5" />
            {/* Shackle - open (unlocked) */}
            <path d="M8 11V8a4 4 0 0 1 7.5-1.5" stroke="url(#vi-gold)" strokeWidth="1.5" strokeLinecap="round" />
            {/* Rising arrow (credit flow) */}
            <path d="M12 15V8" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M9.5 10.5L12 8l2.5 2.5" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
    );
}

// ── Portfolio: Stacked layers with ascending glow ────────────────────────────
export function PortfolioIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            <path d="M3 17l9-4 9 4" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M3 12l9-4 9 4" stroke="url(#vi-gold)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.8" />
            <path d="M3 7l9-4 9 4" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.55" />
            {/* Rising dots */}
            <circle cx="12" cy="18" r="1" fill="#60a5fa" />
            <circle cx="12" cy="13" r="1" fill="#d99a22" />
            <circle cx="12" cy="8" r="1" fill="#60a5fa" opacity="0.6" />
        </Icon>
    );
}

// ── Governance: Hexagonal prism with orbiting nodes ──────────────────────────
export function GovernanceIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Hexagon */}
            <path d="M12 2l8.5 4.9v9.8L12 21.6l-8.5-4.9V6.9Z" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Orbit ring */}
            <circle cx="12" cy="12" r="9" stroke="url(#vi-gold)" strokeWidth="0.75" strokeDasharray="2 2" opacity="0.6" />
            {/* Nodes */}
            <circle cx="21" cy="12" r="1.5" fill="#d99a22" />
            <circle cx="3" cy="12" r="1.5" fill="#d99a22" />
            <circle cx="12" cy="3" r="1.5" fill="#60a5fa" />
            {/* Center dot */}
            <circle cx="12" cy="12" r="2" fill="url(#vi-blue)" />
        </Icon>
    );
}

// ── Identity: Fingerprint / shield hybrid ─────────────────────────────────────
export function IdentityIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Shield */}
            <path d="M12 2l8 3v6c0 4.5-3.3 8.4-8 9.5C7.3 19.4 4 15.5 4 11V5z" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Scan lines (fingerprint effect) */}
            <path d="M9 10.5c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke="url(#vi-gold)" strokeWidth="1" strokeLinecap="round" />
            <path d="M9.5 12.5c0-.6.3-1.1.7-1.5" stroke="#60a5fa" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
            <path d="M10.5 14.5c.4.3.9.5 1.5.5s1.1-.2 1.5-.5" stroke="#60a5fa" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
            {/* Center verify dot */}
            <circle cx="12" cy="12" r="1.5" fill="#d99a22" />
        </Icon>
    );
}

// ── Vesting: Timeline arc with milestone orbs ─────────────────────────────────
export function VestingIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Timeline base arc */}
            <path d="M3 18 Q12 4 21 18" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            {/* Milestone dots */}
            <circle cx="3" cy="18" r="2" fill="#3b82f6" />
            <circle cx="8" cy="10" r="1.5" fill="#d99a22" />
            <circle cx="12" cy="6.5" r="1.5" fill="#60a5fa" />
            <circle cx="16" cy="10" r="1.5" fill="#d99a22" />
            <circle cx="21" cy="18" r="2" fill="#2563eb" />
            {/* Glow on final milestone */}
            <circle cx="21" cy="18" r="4" stroke="#3b82f6" strokeWidth="0.5" opacity="0.4" />
        </Icon>
    );
}

// ── Liquidity: Fluid arcs converging into pool ───────────────────────────────
export function LiquidityIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Pool ellipse */}
            <ellipse cx="12" cy="19" rx="7" ry="2.5" stroke="url(#vi-blue)" strokeWidth="1.5" />
            {/* Converging streams */}
            <path d="M5 8 Q6 14 12 16.5" stroke="url(#vi-gold)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M19 8 Q18 14 12 16.5" stroke="url(#vi-gold)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M12 3 L12 16.5" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinecap="round" />
            {/* Drop tips */}
            <circle cx="5" cy="8" r="1.5" fill="#d99a22" />
            <circle cx="19" cy="8" r="1.5" fill="#d99a22" />
            <circle cx="12" cy="3" r="1.5" fill="#60a5fa" />
        </Icon>
    );
}

// ── Auction: Gavel as circuit-completing arcs ────────────────────────────────
export function AuctionIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Gavel head */}
            <rect x="12" y="3" width="9" height="5" rx="1.5" stroke="url(#vi-blue)" strokeWidth="1.5" transform="rotate(45 16.5 5.5)" />
            {/* Handle */}
            <path d="M5 19 L14 10" stroke="url(#vi-gold)" strokeWidth="2" strokeLinecap="round" />
            {/* Impact ring */}
            <path d="M3 21 Q8 18 10 20" stroke="#60a5fa" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
            {/* Spark dots */}
            <circle cx="15" cy="9" r="1" fill="#d99a22" />
            <circle cx="11" cy="6" r="0.75" fill="#60a5fa" opacity="0.8" />
            <circle cx="18" cy="6" r="0.75" fill="#60a5fa" opacity="0.8" />
        </Icon>
    );
}

// ── Airdrop: Satellite radar with falling particles ──────────────────────────
export function AirdropIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Dish */}
            <path d="M4 8 Q8 2 14 4" stroke="url(#vi-gold)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M4 8 Q10 14 16 10" stroke="url(#vi-gold)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            {/* Signal arc */}
            <path d="M9 6.5 Q14 4 16 8" stroke="url(#vi-blue)" strokeWidth="1" strokeLinecap="round" fill="none" strokeDasharray="1.5 1.5" />
            {/* Stand */}
            <path d="M10 11 L9 17 M14 10 L15 17" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M7 17 h10" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinecap="round" />
            {/* Falling particles */}
            <circle cx="5" cy="14" r="1" fill="#60a5fa" opacity="0.7" />
            <circle cx="19" cy="16" r="1" fill="#d99a22" opacity="0.7" />
            <circle cx="12" cy="20" r="1" fill="#60a5fa" />
        </Icon>
    );
}

// ── Dashboard: Holographic grid display ──────────────────────────────────────
export function DashboardIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Outer frame */}
            <rect x="2" y="3" width="20" height="15" rx="2" stroke="url(#vi-blue)" strokeWidth="1.5" />
            {/* Dividers */}
            <path d="M2 8 h20" stroke="url(#vi-blue)" strokeWidth="0.75" opacity="0.5" />
            <path d="M12 8 V18" stroke="url(#vi-blue)" strokeWidth="0.75" opacity="0.5" />
            {/* Bar chart in left pane */}
            <rect x="4" y="14" width="2" height="3" rx="0.5" fill="#d99a22" opacity="0.9" />
            <rect x="7" y="11" width="2" height="6" rx="0.5" fill="#60a5fa" opacity="0.9" />
            {/* Mini line in right pane */}
            <path d="M13 15 l3-3 l3 2" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            {/* Stand base */}
            <path d="M8 18 h8 M12 18 v2 M9 20 h6" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinecap="round" />
        </Icon>
    );
}

// ── Community: Interconnected nodes ──────────────────────────────────────────
export function CommunityIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            {/* Central node */}
            <circle cx="12" cy="12" r="3" stroke="url(#vi-blue)" strokeWidth="1.5" />
            {/* Surrounding nodes */}
            <circle cx="4" cy="6" r="2" stroke="url(#vi-gold)" strokeWidth="1.25" />
            <circle cx="20" cy="6" r="2" stroke="url(#vi-gold)" strokeWidth="1.25" />
            <circle cx="4" cy="18" r="2" stroke="url(#vi-blue)" strokeWidth="1.25" />
            <circle cx="20" cy="18" r="2" stroke="url(#vi-blue)" strokeWidth="1.25" />
            {/* Connection lines */}
            <path d="M9 10.5 L6 7.5" stroke="#60a5fa" strokeWidth="1" opacity="0.6" />
            <path d="M15 10.5 L18 7.5" stroke="#60a5fa" strokeWidth="1" opacity="0.6" />
            <path d="M9 13.5 L6 16.5" stroke="#d99a22" strokeWidth="1" opacity="0.6" />
            <path d="M15 13.5 L18 16.5" stroke="#d99a22" strokeWidth="1" opacity="0.6" />
        </Icon>
    );
}

// ── Feedback / Message ────────────────────────────────────────────────────────
export function FeedbackIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 10 h8 M8 13 h5" stroke="url(#vi-gold)" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
        </Icon>
    );
}

// ── Repay: Circular arrow with coin center ───────────────────────────────────
export function RepayIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            <path d="M4.5 8.5 A8 8 0 0 1 20 12" stroke="url(#vi-blue)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M19.5 15.5 A8 8 0 0 1 4 12" stroke="url(#vi-gold)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <path d="M2 6.5 l2.5 2 l-2.5 2" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 17.5 l-2.5-2 l2.5-2" stroke="#d99a22" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.5" fill="url(#vi-blue)" opacity="0.9" />
        </Icon>
    );
}

// ── Docs / Reading ────────────────────────────────────────────────────────────
export function DocsIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            <rect x="4" y="2" width="13" height="18" rx="2" stroke="url(#vi-blue)" strokeWidth="1.5" />
            <path d="M4 6 h13" stroke="url(#vi-gold)" strokeWidth="0.75" opacity="0.5" />
            <path d="M7 10 h7 M7 13 h5 M7 16 h4" stroke="#60a5fa" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
            {/* Top corner fold */}
            <path d="M14 2 l3 3 h-3 z" fill="url(#vi-gold)" opacity="0.6" />
        </Icon>
    );
}

// ── Lender: Coins / deposit ────────────────────────────────────────────────────
export function LenderIcon({ size, className, style }) {
    return (
        <Icon size={size} className={className} style={style}>
            <ellipse cx="12" cy="7" rx="7" ry="3" stroke="url(#vi-gold)" strokeWidth="1.5" />
            <path d="M5 7 v5 Q5 16 12 17 Q19 16 19 12 V7" stroke="url(#vi-blue)" strokeWidth="1.5" fill="none" />
            <path d="M5 10 Q5 14 12 15 Q19 14 19 10" stroke="url(#vi-gold)" strokeWidth="0.75" opacity="0.6" />
            <circle cx="12" cy="7" r="1.5" fill="#d99a22" />
        </Icon>
    );
}
