// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function Footer() {
    const navigate = useNavigate();

    return (
        <footer style={{
            borderTop: '1px solid var(--glass-border)',
            background: 'var(--surface-base)',
            padding: 'var(--space-12) var(--space-6) var(--space-6)',
            position: 'relative',
            zIndex: 10
        }}>
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--space-10)',
                marginBottom: 'var(--space-12)'
            }}>
                {/* Brand Column */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
                        <svg width="24" height="24" viewBox="0 0 120 120" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                            <circle cx="60" cy="58" r="46" fill="rgba(59, 130, 246, 0.2)" />
                            <path d="M 28 28 L 60 82" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" fill="none" />
                            <path d="M 92 28 L 60 82" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" fill="none" />
                            <circle cx="60" cy="58" r="6" fill="#60a5fa" />
                        </svg>
                        <span style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                            VESTRA
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: 'var(--space-6)', maxWidth: '250px' }}>
                        The premier protocol for borrowing against non-transferable vesting claims. Unlock your liquidity today.
                    </p>
                </div>

                {/* Protocol Column */}
                <div>
                    <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '600', marginBottom: 'var(--space-4)', fontFamily: 'var(--font-display)' }}>
                        Protocol
                    </h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        <li>
                            <button onClick={() => navigate('/dashboard')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', outline: 'none', padding: 0, transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                App Dashboard
                            </button>
                        </li>
                        <li>
                            <button onClick={() => navigate('/community-pools')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', outline: 'none', padding: 0, transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                Community Pools
                            </button>
                        </li>
                        <li>
                            <button onClick={() => navigate('/governance')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', outline: 'none', padding: 0, transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                Governance
                            </button>
                        </li>
                    </ul>
                </div>

                {/* Resources Column */}
                <div>
                    <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '600', marginBottom: 'var(--space-4)', fontFamily: 'var(--font-display)' }}>
                        Resources
                    </h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        <li>
                            <button onClick={() => navigate('/docs')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', outline: 'none', padding: 0, transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                Documentation
                            </button>
                        </li>
                        <li>
                            <button onClick={() => navigate('/about')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', outline: 'none', padding: 0, transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                About Us
                            </button>
                        </li>
                        <li>
                            <a href="#" style={{ color: 'var(--text-secondary)', fontSize: '14px', textDecoration: 'none', transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                Security & Audits
                            </a>
                        </li>
                    </ul>
                </div>

                {/* Community Column */}
                <div>
                    <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '600', marginBottom: 'var(--space-4)', fontFamily: 'var(--font-display)' }}>
                        Community
                    </h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        <li>
                            <a href="#" style={{ color: 'var(--text-secondary)', fontSize: '14px', textDecoration: 'none', transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                X (Twitter)
                            </a>
                        </li>
                        <li>
                            <a href="#" style={{ color: 'var(--text-secondary)', fontSize: '14px', textDecoration: 'none', transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                Discord
                            </a>
                        </li>
                        <li>
                            <a href="#" style={{ color: 'var(--text-secondary)', fontSize: '14px', textDecoration: 'none', transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary-400)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                                GitHub
                            </a>
                        </li>
                    </ul>
                </div>
            </div>

            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                paddingTop: 'var(--space-6)',
                borderTop: '1px solid var(--glass-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-4)'
            }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                    © {new Date().getFullYear()} Vestra Protocol. All rights reserved.
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                    <a href="#" style={{ color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none', transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                        Terms of Service
                    </a>
                    <a href="#" style={{ color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none', transition: 'color var(--motion-fast)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                        Privacy Policy
                    </a>
                </div>
            </div>
        </footer>
    );
}
