import { createClient } from '@supabase/supabase-js';

// Vestra Testnet Telemetry Project (Fallback to public anonymous if missing)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock-vestra-testnet.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-anon.key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const logSimulationEvent = async (eventName, eventData) => {
    try {
        // Fire-and-forget logging to 'demo_telemetry' table for testing analytics
        await supabase.from('demo_telemetry').insert([
            {
                event_type: eventName,
                metrics: eventData,
                timestamp: new Date().toISOString()
            }
        ]);
    } catch (err) {
        // Silently fail if supabase isn't fully configured locally to not break demo
        console.debug('Telemetry log failed (expected in local dev)', err);
    }
};
