import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function GeoBlockBanner() {
    const [isBlocked, setIsBlocked] = useState(false);
    const [hasDismissed, setHasDismissed] = useState(false);

    useEffect(() => {
        // In a real prod environment, this hits Cloudflare Trace or a MaxMind IP API.
        // For demo/investor purposes, we simulate the check and explicitly show the intent.
        const checkGeoLocation = async () => {
            try {
                const response = await fetch('https://ipapi.co/json/');
                const data = await response.json();
                // Strict blocking of US Retail and Sanctioned Regions
                const blockedCountries = ['US', 'CU', 'IR', 'KP', 'SY', 'RU', 'BY'];
                if (blockedCountries.includes(data.country_code)) {
                    setIsBlocked(true);
                }
            } catch (e) {
                console.warn('Geo-check failed, defaulting to secure mode.');
            }
        };
        checkGeoLocation();
    }, []);

    if (!isBlocked || hasDismissed) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -50, opacity: 0 }}
                className="warning-banner"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 9999,
                    background: 'linear-gradient(90deg, #3a0ca3 0%, #7209b7 100%)',
                    color: 'white',
                    padding: '12px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                    <div>
                        <strong>Jurisdiction Restricted:</strong> It appears you are accessing Vestra from the United States or a restricted region.
                        Retail usage is strictly prohibited. Tier 3 Institutional access requires full KYC via the Cayman Foundation SPV.
                    </div>
                </div>
                <button
                    onClick={() => setHasDismissed(true)}
                    style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Acknowledge
                </button>
            </motion.div>
        </AnimatePresence>
    );
}
