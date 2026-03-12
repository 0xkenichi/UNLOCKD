// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div
          style={{
            padding: '24px 32px',
            maxWidth: 720,
            margin: '10vh auto',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: '#0a0e14',
            color: '#e6e8eb',
            borderRadius: 16,
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            textAlign: 'center'
          }}
        >
          <svg style={{ width: 64, height: 64, color: '#ef4444', margin: '0 auto 16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 style={{ color: '#f87171', marginTop: 0, marginBottom: 8, fontSize: '1.5rem' }}>Application Error</h2>
          <p style={{ color: '#9ca3af', marginBottom: 24 }}>Vestra Protocol encountered an unexpected error. Please try reloading the page.</p>
          <pre
            style={{
              overflow: 'auto',
              padding: 16,
              background: '#040608',
              borderRadius: 8,
              fontSize: 13,
              textAlign: 'left',
              border: '1px solid rgba(255,255,255,0.05)',
              marginBottom: 24
            }}
          >
            {err.toString()}
          </pre>
          {err.message?.includes('WalletConnect') && (
            <p style={{ marginTop: 16, color: '#b0c4de' }}>
              Add a valid <code>VITE_WC_PROJECT_ID</code> to your <code>.env</code> (get one
              free at{' '}
              <a
                href="https://cloud.walletconnect.com"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#3b82f6' }}
              >
                cloud.walletconnect.com
              </a>
              ).
            </p>
          )}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <button
                onClick={() => {
                  window.localStorage.clear();
                  window.sessionStorage.clear();
                  window.location.reload();
                }}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: '#9ca3af',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            >
              Clear Cache & Reload
            </button>
            <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
                onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
