import { useState } from 'react';

export default function AIBubble() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  const handleQuery = () => {
    if (!query.trim()) return;
    setResponse('Simulating BIO drop: 5th % PV = $12,210');
  };

  return (
    <div className={`ai-bubble ${isMinimized ? 'minimized' : ''}`}>
      <div className="ai-bubble-header">
        <div className="holo-glow">CRDT AI</div>
        <button
          className="ai-toggle"
          type="button"
          onClick={() => setIsMinimized((prev) => !prev)}
          aria-label={isMinimized ? 'Expand CRDT AI' : 'Minimize CRDT AI'}
        >
          {isMinimized ? '+' : '-'}
        </button>
      </div>
      {!isMinimized && (
        <div className="ai-bubble-body">
          <input
            className="ai-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask about risk or unlocks"
          />
          <button className="button" onClick={handleQuery}>
            Send
          </button>
          {response && <div className="muted">{response}</div>}
        </div>
      )}
    </div>
  );
}
