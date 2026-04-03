"use client";

import EngineSimulator from "@/components/demo/EngineSimulator";
import { DemoCenter } from "@/components/demo/DemoCenter";
import { motion } from "framer-motion";

export default function DemoPage() {
  return (
    <div className="space-y-12 pb-20">
      <header className="space-y-4">
        <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-[0.9] text-glow-teal">
          Protocol Simulator
        </h1>
        <p className="text-secondary font-medium text-lg leading-relaxed max-w-2xl">
          Test the Vestra Engine in a sandboxed environment. Simulate asset discovery, 
          risk assessment, and credit disbursement before moving to mainnet.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-12">
        <EngineSimulator />
        
        <div className="pt-8 border-t border-white/5">
          <DemoCenter />
        </div>
      </div>
    </div>
  );
}
