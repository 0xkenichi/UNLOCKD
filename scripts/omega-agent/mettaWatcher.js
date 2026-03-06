// Copyright (c) 2026 Vestra Protocol. All rights reserved.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Path to your MeTTa state file
const STATE_FILE = path.join(__dirname, "brain", "current_state.metta");

console.log("[MeTTa Watcher] 📡 Listening for Market Chaos events...");

/**
 * Updates the MeTTa state file with new market atoms.
 * This allows the brain to 'perceive' the crash/pump.
 */
function updateMeTTABrain(eventType, delta, priceAfter) {
    const timestamp = Date.now();
    const atom = `(MarketEvent ${timestamp} ${eventType} ${delta} ${priceAfter})`;

    // Append the new event as a symbolic atom
    fs.appendFileSync(STATE_FILE, `\n${atom}`);

    // If it's a Black Swan, we also update the volatility atom
    if (eventType === 'BLACK_SWAN') {
        const volAtom = `(TokenVolatility "0xTOKEN" 95)`; // Spike volatility
        fs.appendFileSync(STATE_FILE, `\n${volAtom}`);
    }

    console.log(`[MeTTa Watcher] 🧠 Brain updated with atom: ${atom}`);
}

// ── REAL-TIME SUBSCRIPTION ──────────────────────────────────────────────────
const channel = supabase
    .channel('chaos-events')
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'demo_telemetry' },
        (payload) => {
            const { event_type, metrics } = payload.new;

            if (event_type === 'MARKET_GAP') {
                const subType = metrics.event_type; // BLACK_SWAN or FLASH_PUMP
                const delta = metrics.delta;
                const price = metrics.price_after;

                console.log(`[🚨 CHAOS DETECTED] ${subType} | Delta: ${delta}`);
                updateMeTTABrain(subType, delta, price);
            }
        }
    )
    .subscribe();

// Keep the process alive
process.stdin.resume();