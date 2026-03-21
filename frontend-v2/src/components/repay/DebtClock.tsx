"use client";

import React from 'react';
import { Canvas } from '@react-three/fiber';
import HoloCard from '@/components/ui/HoloCard';
import { Torus } from '@react-three/drei';

export const DebtClock = () => {
    const handleRepay = () => {
        const target = document.getElementById('repay-actions');
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <HoloCard distort={0.4} className="h-full">
            <div className="flex flex-col h-full justify-between">
                <div className="space-y-1">
                    <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">Debt Clock</h3>
                    <p className="text-[10px] text-secondary font-medium italic opacity-70">
                        Accrued interest ticks until settlement.
                    </p>
                </div>

                <div className="flex-grow flex items-center justify-center py-4">
                    <div className="w-48 h-48 relative">
                        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                            <ambientLight intensity={0.7} />
                            <pointLight position={[10, 10, 10]} intensity={250} />
                            <Torus args={[1.2, 0.25, 32, 64]} rotation={[0.5, 0.5, 0]}>
                                <meshStandardMaterial 
                                    color="#2EBEB5" 
                                    emissive="#1f3b5a" 
                                    roughness={0.1}
                                    metalness={1}
                                />
                            </Torus>
                        </Canvas>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[10px] font-black uppercase tracking-widest text-accent-teal/50">Interest Accrued</span>
                            <span className="text-2xl font-mono font-black text-white">$142.50</span>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={handleRepay}
                    className="w-full py-4 bg-accent-teal text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all shadow-glow-teal mt-4"
                >
                    Repay Partial
                </button>
            </div>
        </HoloCard>
    );
};
