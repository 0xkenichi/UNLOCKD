// Copyright (c) 2026 Vestra Protocol. All rights reserved.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail-safe check to prevent the 'supabaseUrl is required' crash
if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
        "Vestra Error: Supabase keys are missing. " +
        "Ensure frontend/.env contains VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
}

export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Logs high-fidelity simulation events to Supabase.
 * For BLACK_SWAN/MARKET_GAP events, ensure eventData contains:
 * { event_type, price_before, price_after, delta }
 */
export const logSimulationEvent = async (eventName, eventData) => {
    if (!supabase) return;

    let sessionId = window.sessionStorage.getItem('vestra_sid');
    if (!sessionId) {
        sessionId = `sid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        window.sessionStorage.setItem('vestra_sid', sessionId);
    }

    try {
        await supabase.from('demo_telemetry').insert([
            {
                session_id: sessionId,
                event_type: eventName, // e.g., 'MARKET_GAP'
                metrics: eventData,    // JSONB: contains price_before, price_after, etc.
                chain: "Base-Sepolia",
                timestamp: new Date().toISOString()
            }
        ]);
    } catch (err) {
        console.warn('Vestra Telemetry log failed:', err.message);
    }
};