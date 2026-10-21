// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
//
// Alchemy Account Kit provider, split out of main.jsx so that @account-kit/* (and its
// @turnkey / @peculiar / @aa-sdk dependency tree, ~650 KB minified) is only downloaded when
// VITE_ALCHEMY_ACCOUNT_KIT_API_KEY is configured. main.jsx loads this module with React.lazy.
import { AlchemyAccountProvider, createConfig as createAlchemyConfig } from '@account-kit/react';
import { alchemy, baseSepolia, sepolia } from '@account-kit/infra';

const alchemyApiKey = import.meta.env.VITE_ALCHEMY_ACCOUNT_KIT_API_KEY;
const alchemyPolicyId = import.meta.env.VITE_ALCHEMY_ACCOUNT_KIT_POLICY_ID;
const alchemyChainName = String(import.meta.env.VITE_ALCHEMY_ACCOUNT_KIT_CHAIN || 'sepolia');
const alchemyChain = alchemyChainName === 'base-sepolia' ? baseSepolia : sepolia;

const alchemyConfig = alchemyApiKey
  ? createAlchemyConfig(
    {
      transport: alchemy({ apiKey: alchemyApiKey }),
      chain: alchemyChain,
      ...(alchemyPolicyId ? { policyId: alchemyPolicyId } : {})
    },
    {
      auth: {
        sections: [[{ type: 'email' }], [{ type: 'passkey' }]],
        addPasskeyOnSignup: true
      }
    }
  )
  : null;

export default function AlchemyAccountKitProvider({ queryClient, children }) {
  if (!alchemyConfig) return children;
  return (
    <AlchemyAccountProvider config={alchemyConfig} queryClient={queryClient}>
      {children}
    </AlchemyAccountProvider>
  );
}
