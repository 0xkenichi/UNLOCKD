// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ExternalLink } from 'lucide-react';

const NavDropdown = ({ title, items, isOpen, onMouseEnter, onMouseLeave }) => {
    return (
        <div
            style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%' }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <button
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all var(--motion-fast)'
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            >
                {title}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            marginTop: '4px',
                            width: 'max-content',
                            minWidth: '240px',
                            background: 'var(--surface-strong)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: 'var(--radius-lg)',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                            backdropFilter: 'blur(20px)',
                            padding: '6px',
                            zIndex: 100
                        }}
                    >
                        {items.map((item, idx) => (
                            <div
                                key={idx}
                                onClick={item.onClick}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px',
                                    padding: '12px',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    transition: 'background var(--motion-fast)'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                {item.icon && (
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        background: 'var(--surface-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        {item.icon}
                                    </div>
                                )}
                                <div>
                                    <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {item.label}
                                        {item.external && <ExternalLink size={12} strokeWidth={2} style={{ opacity: 0.5 }} />}
                                    </div>
                                    {item.description && (
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.4 }}>
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function LandingNavbar() {
    const navigate = useNavigate();
    const [activeDropdown, setActiveDropdown] = useState(null);

    const handleDropdownEnter = (menu) => {
        setActiveDropdown(menu);
    };

    const handleDropdownLeave = () => {
        setActiveDropdown(null);
    };

    const navItems = {
        products: [
            {
                label: 'Vestra Web App',
                description: 'The full power of decentralized credit.',
                icon: <span style={{ fontSize: '18px' }}>📱</span>,
                onClick: () => navigate('/dashboard')
            },
            {
                label: 'Community Pools',
                description: 'Lend and earn continuous APY yields.',
                icon: <span style={{ fontSize: '18px' }}>💧</span>,
                onClick: () => navigate('/community-pools')
            }
        ],
        resources: [
            {
                label: 'Documentation',
                description: 'Guides and technical details.',
                onClick: () => navigate('/docs')
            },
            {
                label: 'FAQ',
                description: 'Answers to common questions.',
                onClick: () => { }
            },
            {
                label: 'Governance',
                description: 'The Vestra protocol governance.',
                onClick: () => navigate('/governance')
            },
            {
                label: 'Airdrop Information',
                description: 'Details and eligibility criteria.',
                onClick: () => navigate('/airdrop')
            }
        ],
        developers: [
            {
                label: 'Build',
                description: 'Integrate Vestra into your platform.',
                onClick: () => navigate('/docs')
            },
            {
                label: 'Github',
                description: 'Explore the open source repositories.',
                external: true,
                onClick: () => window.open('https://github.com/0xkenichi/UNLOCKD', '_blank')
            },
            {
                label: 'Bug Bounty',
                description: 'Report responsibly and get rewarded.',
                onClick: () => { }
            }
        ],
        about: [
            {
                label: 'About Vestra',
                description: 'Learn about the vision and the team.',
                onClick: () => navigate('/about')
            },
            {
                label: 'Careers',
                description: 'Build the future of vesting credit.',
                onClick: () => { }
            }
        ]
    };

    return (
        <motion.nav
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: '72px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 var(--space-8)',
                zIndex: 100,
                background: 'rgba(10, 14, 26, 0.4)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                {/* Logo area */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <svg width="32" height="32" viewBox="0 0 120 120" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <circle cx="60" cy="58" r="46" fill="rgba(59, 130, 246, 0.2)" />
                        <path d="M 28 28 L 60 82" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" fill="none" />
                        <path d="M 92 28 L 60 82" stroke="#3b82f6" strokeWidth="6" strokeLinecap="round" fill="none" />
                        <circle cx="60" cy="58" r="6" fill="#60a5fa" />
                    </svg>
                    <span style={{ fontSize: '20px', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                        VESTRA
                    </span>
                </div>

                {/* Center Nav Links */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', height: '100%' }}>
                    <NavDropdown title="Products" items={navItems.products} isOpen={activeDropdown === 'products'} onMouseEnter={() => handleDropdownEnter('products')} onMouseLeave={handleDropdownLeave} />
                    <NavDropdown title="Resources" items={navItems.resources} isOpen={activeDropdown === 'resources'} onMouseEnter={() => handleDropdownEnter('resources')} onMouseLeave={handleDropdownLeave} />
                    <NavDropdown title="Developers" items={navItems.developers} isOpen={activeDropdown === 'developers'} onMouseEnter={() => handleDropdownEnter('developers')} onMouseLeave={handleDropdownLeave} />
                    <NavDropdown title="About" items={navItems.about} isOpen={activeDropdown === 'about'} onMouseEnter={() => handleDropdownEnter('about')} onMouseLeave={handleDropdownLeave} />
                </div>
            </div>

            {/* Right Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <button
                    onClick={() => navigate('/dashboard')}
                    style={{
                        background: 'var(--surface-strong)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-primary)',
                        padding: '10px 20px',
                        borderRadius: '24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all var(--motion-fast)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-strong)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                    Vestra for Web
                </button>
            </div>
        </motion.nav>
    );
}
