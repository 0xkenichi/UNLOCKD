import React, { useState } from 'react';

export function StreamSelector({ address, sablierAddress, selected, onSelect }: any) {
  const [streamId, setStreamId] = useState('');
  
  return (
    <div>
      <p className="text-[#9C9A92] text-sm mb-4">Enter your existing Sablier Stream ID to borrow against.</p>
      <input
        type="number"
        value={streamId}
        onChange={e => setStreamId(e.target.value)}
        placeholder="e.g. 42"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#E8E6DF] font-mono mb-4 focus:outline-none focus:border-[#1D9E75]"
      />
      <button
        onClick={() => onSelect(Number(streamId))}
        disabled={!streamId}
        className="w-full py-3 rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
      >
        Select Stream
      </button>
    </div>
  );
}
