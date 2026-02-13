import { useState } from 'react';
import { submitContact } from '../utils/api.js';
import { trackEvent } from '../utils/analytics.js';

const CATEGORIES = [
  { id: 'bug', label: 'Bug report' },
  { id: 'ux', label: 'UX feedback' },
  { id: 'feature', label: 'Feature request' },
  { id: 'airdrop', label: 'Airdrop/testnet question' }
];

export default function Feedback() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    walletAddress: '',
    category: 'ux',
    message: ''
  });
  const [status, setStatus] = useState('idle');
  const [notice, setNotice] = useState('');

  const onChange = (key) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setStatus('saving');
    setNotice('');
    try {
      await submitContact({
        name: form.name || undefined,
        email: form.email || undefined,
        walletAddress: form.walletAddress || undefined,
        context: `feedback_${form.category}`,
        message: form.message
      });
      trackEvent('feedback_submitted', {
        category: form.category,
        hasEmail: Boolean(form.email),
        hasWallet: Boolean(form.walletAddress)
      });
      setStatus('saved');
      setNotice('Feedback submitted. Thank you for helping improve the testnet.');
      setForm((prev) => ({ ...prev, message: '' }));
    } catch (error) {
      setStatus('error');
      setNotice(error?.message || 'Unable to submit feedback right now.');
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Feedback</h1>
        <div className="page-subtitle">
          Share bugs, UX friction, and ideas. Testnet actions and feedback help shape future
          airdrop eligibility.
        </div>
      </div>

      <div className="grid-2">
        <form className="holo-card stack" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="form-field">
              Name (optional)
              <input
                className="form-input"
                value={form.name}
                onChange={onChange('name')}
                placeholder="Your name"
              />
            </label>
            <label className="form-field">
              Email (optional)
              <input
                className="form-input"
                type="email"
                value={form.email}
                onChange={onChange('email')}
                placeholder="you@example.com"
              />
            </label>
            <label className="form-field">
              Wallet address (optional)
              <input
                className="form-input"
                value={form.walletAddress}
                onChange={onChange('walletAddress')}
                placeholder="0x..."
              />
            </label>
            <label className="form-field">
              Category
              <select className="form-input" value={form.category} onChange={onChange('category')}>
                {CATEGORIES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-field">
            Message
            <textarea
              className="form-input"
              rows={7}
              value={form.message}
              onChange={onChange('message')}
              placeholder="Tell us what happened, what you expected, and any reproduction steps."
              required
            />
          </label>
          <div className="inline-actions">
            <button className="button" type="submit" disabled={status === 'saving'}>
              {status === 'saving' ? 'Submitting...' : 'Submit feedback'}
            </button>
          </div>
          {notice && <div className={status === 'error' ? 'error-banner' : 'muted'}>{notice}</div>}
        </form>

        <div className="holo-card">
          <h3 className="section-title">What to include</h3>
          <div className="card-list">
            <div className="pill">Which page/action triggered the issue</div>
            <div className="pill">Expected behavior vs actual behavior</div>
            <div className="pill">Wallet + chain used (if relevant)</div>
            <div className="pill">Screenshots or tx hashes if available</div>
          </div>
          <p className="muted" style={{ marginTop: 'var(--space-4)' }}>
            Bug bounty scope and terms will be published separately.
          </p>
        </div>
      </div>
    </div>
  );
}
