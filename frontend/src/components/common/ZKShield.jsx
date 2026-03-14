// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import React from 'react';
import { usePrivacyMode } from '../../utils/privacyMode.js';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ZKShield
 * 
 * A premium privacy wrapper that uses the "ZK Stack" fonts (Rubik Glitch, DotGothic16)
 * to protect sensitive on-chain data.
 * 
 * When Privacy Mode is ON:
 * - Text is masked with a glitching, encrypted font.
 * - Interaction reveals a "decrypted" technical state.
 */
const ZKShield = ({ 
    children, 
    label, 
    type = 'data', 
    revealOnHover = true,
    className = '' 
}) => {
    const { enabled } = usePrivacyMode();

    if (!enabled) return <>{children}</>;

    const content = typeof children === 'string' ? children : String(children);

    return (
        <motion.span 
            className={`zk-shield-container inline-flex items-center relative ${className}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ 
                cursor: revealOnHover ? 'help' : 'default',
                display: 'inline-flex',
                alignItems: 'center'
            }}
        >
            <AnimatePresence mode="wait">
                <motion.span
                    key="encrypted"
                    className="font-encrypted"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 0.6, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    whileHover={revealOnHover ? { 
                        opacity: 1, 
                        scale: 1.05,
                        color: 'var(--primary-400)',
                        textShadow: '0 0 12px var(--primary-500)'
                    } : {}}
                    title={label || "ZK-Shield Active"}
                    style={{ 
                        display: 'inline-block',
                        lineHeight: 1
                    }}
                >
                    {content.split('').map((char, i) => (
                        <span key={i} style={{ display: 'inline-block' }}>{char === ' ' ? '\u00A0' : char}</span>
                    ))}
                </motion.span>
            </AnimatePresence>
            
            {/* Subtle glow effect when shielded */}
            <span style={{
                position: 'absolute',
                inset: -2,
                borderRadius: '4px',
                background: 'rgba(59, 130, 246, 0.05)',
                filter: 'blur(4px)',
                zIndex: -1
            }} />
        </motion.span>
    );
};

export default ZKShield;
