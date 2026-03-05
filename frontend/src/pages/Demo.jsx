// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState } from 'react';
import GlobalUserMap from '../components/demo/GlobalUserMap.jsx';
import DemoVesting from '../components/demo/DemoVesting.jsx';
import DemoDashboard from '../components/demo/DemoDashboard.jsx';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles.css';

const DEMO_STEPS = {
    SIGN_IN: 0,
    VESTING: 1,
    DASHBOARD: 2,
};

export default function Demo() {
    const [currentStep, setCurrentStep] = useState(DEMO_STEPS.SIGN_IN);
    const { isConnected } = useAccount();
    const [demoState, setDemoState] = useState({
        userLocation: null,
        vestingContract: null,
    });

    const handleSignInComplete = (location) => {
        setDemoState(prev => ({ ...prev, userLocation: location }));
        setTimeout(() => setCurrentStep(DEMO_STEPS.VESTING), 2500);
    };

    const handleVestingComplete = (contractDetails) => {
        setDemoState(prev => ({ ...prev, vestingContract: contractDetails }));
        setCurrentStep(DEMO_STEPS.DASHBOARD);
    };

    return (
        <div className="demo-container v2-container">
            <div className="demo-header">
                <h1>Vestra Real-Time Simulator</h1>
                <p>Interactive playground to stress-test your mock vested collateral.</p>

                {currentStep !== DEMO_STEPS.DASHBOARD && (
                    <div className="demo-progress-bar">
                        {Object.keys(DEMO_STEPS).map((key, index) => (
                            <div
                                key={key}
                                className={`demo-step-indicator ${currentStep >= index ? 'active' : ''} ${currentStep === index ? 'current' : ''}`}
                            >
                                <div className="step-dot">{index + 1}</div>
                                <span className="step-label">{key.replace('_', ' ')}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="demo-content">
                <AnimatePresence mode="wait">
                    {currentStep === DEMO_STEPS.SIGN_IN && (
                        <motion.div
                            key="signin"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="demo-card"
                        >
                            <h2>Step 1: Protocol Entry</h2>
                            <p>Connect your wallet to map your global node.</p>
                            <GlobalUserMap
                                isConnected={isConnected}
                                onComplete={handleSignInComplete}
                            />
                        </motion.div>
                    )}

                    {currentStep === DEMO_STEPS.VESTING && (
                        <motion.div
                            key="vesting"
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            className="demo-card"
                        >
                            <DemoVesting onComplete={handleVestingComplete} />
                        </motion.div>
                    )}

                    {currentStep === DEMO_STEPS.DASHBOARD && (
                        <motion.div
                            key="dashboard"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="demo-dashboard-wrapper"
                        >
                            <DemoDashboard vestingContract={demoState.vestingContract} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
