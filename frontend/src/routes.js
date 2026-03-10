// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
export const routeImports = {
  landing: () => import('./pages/Landing.jsx'),
  dashboard: () => import('./pages/Dashboard.jsx'),
  portfolio: () => import('./pages/Portfolio.jsx'),
  lender: () => import('./pages/Lender.jsx'),
  borrow: () => import('./pages/Borrow.jsx'),
  repay: () => import('./pages/Repay.jsx'),
  auction: () => import('./pages/Auction.jsx'),
  governance: () => import('./pages/Governance.jsx'),
  identity: () => import('./pages/Identity.jsx'),
  features: () => import('./pages/Features.jsx'),
  docs: () => import('./pages/Docs.jsx'),
  about: () => import('./pages/About.jsx'),
  hiring: () => import('./pages/Hiring.jsx'),
  adminAirdrop: () => import('./pages/AdminAirdrop.jsx'),
  adminRisk: () => import('./pages/AdminRisk.jsx'),
  airdrop: () => import('./pages/Airdrop.jsx'),
  feedback: () => import('./pages/Feedback.jsx'),
  fundraiseOnboard: () => import('./pages/FundraiseOnboard.jsx'),
  communityPools: () => import('./pages/CommunityPools.jsx'),
  demo: () => import('./pages/Demo.jsx'),
  admin: () => import('./pages/Admin.jsx'),
  treasury: () => import('./pages/Treasury.jsx')
};
