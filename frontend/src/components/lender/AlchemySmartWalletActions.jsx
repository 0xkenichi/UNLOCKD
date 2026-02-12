import { useEffect, useMemo } from 'react';
import { useAuthModal, useLogout, useUser } from '@account-kit/react';
import { trackEvent } from '../../utils/analytics.js';

export default function AlchemySmartWalletActions({ onSmartWalletChange = () => {} }) {
  const { openAuthModal } = useAuthModal();
  const user = useUser();
  const { logout, isLoggingOut } = useLogout();

  const smartAddress = useMemo(() => {
    const address = user?.address;
    if (!address || typeof address !== 'string') return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [user]);

  useEffect(() => {
    onSmartWalletChange(user?.address || '');
  }, [onSmartWalletChange, user?.address]);

  useEffect(() => {
    const handleOpenAuth = () => {
      trackEvent('alchemy_smart_wallet_connect_open', {
        entry: 'lender',
        source: 'onboarding_primary_cta'
      });
      openAuthModal();
    };
    window.addEventListener('crdt-open-smart-wallet-auth', handleOpenAuth);
    return () => window.removeEventListener('crdt-open-smart-wallet-auth', handleOpenAuth);
  }, [openAuthModal]);

  if (!user?.address) {
    return (
      <div className="inline-actions">
        <button
          className="button"
          type="button"
          onClick={() => {
            trackEvent('alchemy_smart_wallet_connect_open', { entry: 'lender' });
            openAuthModal();
          }}
        >
          Create smart wallet (email/passkey)
        </button>
        <div className="muted">No seed phrase required. Designed for web2 lenders.</div>
      </div>
    );
  }

  return (
    <div className="inline-actions">
      <span className="pill is-done">Smart wallet connected: {smartAddress}</span>
      <button
        className="button ghost"
        type="button"
        onClick={() => {
          trackEvent('alchemy_smart_wallet_logout', { entry: 'lender' });
          logout();
        }}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? 'Disconnecting...' : 'Disconnect smart wallet'}
      </button>
    </div>
  );
}
