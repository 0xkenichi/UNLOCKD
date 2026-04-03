// Copyright (c) 2026 Vestra Protocol. All rights reserved.
import React, { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

const AdminReplay = () => {
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAuditTrail = async () => {
            // Pull from the View we just created in the SQL Editor
            const { data, error } = await supabase
                .from('asi_stress_test_audit')
                .select('*')
                .order('timestamp', { ascending: false });

            if (!error) setAuditLogs(data);
            setLoading(false);
        };

        fetchAuditTrail();

        // Real-time subscription to the Audit View
        const channel = supabase
            .channel('audit-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'demo_telemetry' }, () => {
                fetchAuditTrail();
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    return (
        <div className="p-6 bg-slate-900 text-white min-h-screen font-mono">
            <h2 className="text-xl font-bold mb-4 border-b border-blue-500 pb-2">
                ASI STRESS TEST AUDIT TRAIL
            </h2>

            {loading ? <p className="text-blue-400">Loading symbolic logs...</p> : (
                <div className="space-y-3">
                    {auditLogs.map((log, i) => (
                        <div key={i} className="p-3 border-l-2 border-blue-500 bg-slate-800 rounded-r shadow-lg">
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span className="text-blue-300">SID: {log.session_id.slice(-6)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="block text-[10px] text-slate-500 uppercase">Market Event</span>
                                    <p className={`font-bold ${log.event === 'BLACK_SWAN' ? 'text-red-400' : 'text-yellow-400'}`}>
                                        {log.event}
                                    </p>
                                </div>
                                <div>
                                    <span className="block text-[10px] text-slate-500 uppercase">MeTTa Verdict</span>
                                    <p className="font-bold text-green-400">{log.asi_action || 'WATCHING'}</p>
                                </div>
                            </div>
                            <div className="mt-2 text-xs flex gap-4 text-slate-300">
                                <span>Price Before: ${log.price_before}</span>
                                <span>→</span>
                                <span className="font-bold">Price After: ${log.price_after}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminReplay;