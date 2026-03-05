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
            padding: 24,
            maxWidth: 720,
            margin: '40px auto',
            fontFamily: 'system-ui, sans-serif',
            background: '#1a1a2e',
            color: '#e6eef9',
            borderRadius: 12,
            border: '1px solid rgba(255,100,100,0.3)'
          }}
        >
          <h2 style={{ color: '#ff6b6b', marginTop: 0 }}>Something went wrong</h2>
          <pre
            style={{
              overflow: 'auto',
              padding: 16,
              background: '#0b0f17',
              borderRadius: 8,
              fontSize: 13
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
                style={{ color: '#4b8dff' }}
              >
                cloud.walletconnect.com
              </a>
              ).
            </p>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
