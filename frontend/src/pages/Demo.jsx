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
            <div className="max-w-6xl mx-auto mb-12 text-center">
                <h1 className="text-5xl font-black italic uppercase tracking-tighter mb-4 bg-gradient-to-br from-white to-slate-500 bg-clip-text text-transparent">
                    Vestra Intelligence Simulator
                </h1>
                <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em] mb-12">
                    Premium Stress-Testing Ground // ASI-Monitored Environment
                </p>

                {currentStep !== DEMO_STEPS.DASHBOARD && (
                    <div className="flex justify-center items-center gap-12 relative py-4">
                        <div className="absolute h-[1px] bg-slate-800 w-1/2 left-1/4 top-1/2 -z-10"></div>
                        {Object.entries(DEMO_STEPS).map(([key, value], index) => (
                            <div
                                key={key}
                                className={`relative flex flex-col items-center gap-3 transition-all duration-500 ${currentStep >= value ? 'opacity-100' : 'opacity-30'}`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border-2 transition-all duration-500 ${currentStep === value ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-900/40 scale-110' : currentStep > value ? 'bg-emerald-500 border-emerald-400' : 'bg-black border-slate-800'}`}>
                                    {currentStep > value ? '✓' : index + 1}
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${currentStep === value ? 'text-blue-400' : 'text-slate-600'}`}>
                                    {key.replace('_', ' ')}
                                </span>
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
