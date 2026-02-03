import { useMemo, useState } from 'react';
import { askAgent } from '../../utils/api.js';

export default function AIBubble() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [sources, setSources] = useState([]);
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  const quickReplies = useMemo(
    () => [
      'Suggested parameters for loans',
      'Governance checklist for updates',
      'Risk overview for unlocks'
    ],
    []
  );

  const handleQuery = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const nextHistory = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setStatus('thinking');
    setError('');
    try {
      const data = await askAgent(trimmed, nextHistory);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer || 'No answer yet.' }]);
      setSources(data.sources || []);
      setProvider(data.provider || '');
    } catch (err) {
      setError(err?.message || 'Unable to reach CRDT AI.');
    } finally {
      setStatus('idle');
      setQuery('');
    }
  };

  const handleNewThread = () => {
    setQuery('');
    setMessages([]);
    setSources([]);
    setError('');
  };

  const handleQuickReply = async (text) => {
    setQuery(text);
    await handleQuery();
  };

  return (
    <div className={`ai-bubble ${isMinimized ? 'minimized' : ''}`}>
      <div className="ai-bubble-header">
        <div>
          <div className="section-title">CRDT AI</div>
          <div className="section-subtitle">Risk assistant</div>
        </div>
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
          <div className="inline-actions">
            <button className="button" onClick={handleQuery} disabled={status === 'thinking'}>
              Send
            </button>
            <button className="button ghost" type="button" onClick={handleNewThread}>
              New Thread
            </button>
          </div>
          <div className="stack ai-thread">
            {!messages.length && (
              <div className="muted">Ask about DPV, LTV, unlock safety, or governance steps.</div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="stack">
                <div className="muted small">
                  {message.role === 'assistant' ? 'CRDT AI' : 'You'}
                </div>
                <div className="ai-message">{message.content}</div>
              </div>
            ))}
            {status === 'thinking' && <div className="muted">Analyzing docs…</div>}
            {error && <div className="error-text">{error}</div>}
            {provider && (
              <div className="muted small">
                Using provider: <span className="chip">{provider}</span>
              </div>
            )}
          </div>
          {sources?.length ? (
            <div className="stack">
              <div className="section-subtitle">Sources</div>
              <div className="inline-actions wrap">
                {sources.map((source, index) => (
                  <span key={`${source.file}-${index}`} className="chip">
                    {source.file.replace('.md', '')}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="inline-actions wrap">
            {quickReplies.map((text) => (
              <button
                key={text}
                className="chip"
                type="button"
                onClick={() => handleQuickReply(text)}
                disabled={status === 'thinking'}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
