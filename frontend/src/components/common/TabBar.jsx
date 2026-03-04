import { NavLink } from 'react-router-dom';
import { routeImports } from '../../routes.js';

const prefetchByPath = {
  '/dashboard': routeImports.dashboard,
  '/portfolio': routeImports.portfolio,
  '/lender': routeImports.lender,
  '/borrow': routeImports.borrow,
  '/repay': routeImports.repay,
  '/auction': routeImports.auction,
  '/governance': routeImports.governance,
  '/identity': routeImports.identity,
  '/features': routeImports.features,
  '/docs': routeImports.docs,
  '/about': routeImports.about,
  '/hiring': routeImports.hiring
};

const prefetchedRoutes = new Set();

function prefetchRoute(path) {
  const loader = prefetchByPath[path];
  if (!loader || prefetchedRoutes.has(path)) return;
  prefetchedRoutes.add(path);
  loader();
}

const iconPaths = {
  dashboard: 'M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h5v8H3v-8zm7 0h11v8H10v-8z',
  portfolio: 'M4 4h16v4H4V4zm0 6h16v10H4V10zm3 3h6v4H7v-4z',
  lender: 'M4 6h16M6 10h12M8 14h8M10 18h4',
  borrow: 'M4 12h16M12 4v16',
  repay: 'M4 12h16M16 8l4 4-4 4',
  auction: 'M6 4h12M8 8h8M10 12h4M12 16v4',
  governance: 'M4 8h16M4 16h16M8 4v16',
  identity: 'M12 3a4 4 0 0 1 0 8 4 4 0 0 1 0-8zm-7 16a7 7 0 0 1 14 0',
  features: 'M5 5h14v4H5V5zm0 6h14v8H5v-8z',
  docs: 'M6 4h10a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8',
  about: 'M11 10h2v7h-2zm0-4h2v2h-2z',
  hiring: 'M17 20h2a2 2 0 0 0 2-2v-1a5 5 0 0 0-5-5h-4a5 5 0 0 0-5 5v1a2 2 0 0 0 2 2h2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'
};

const primaryTabs = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/portfolio', label: 'Portfolio', icon: 'portfolio' },
  { to: '/lender', label: 'Lender', icon: 'lender' },
  { to: '/borrow', label: 'Borrow', icon: 'borrow' },
  { to: '/repay', label: 'Repay', icon: 'repay' },
  { to: '/auction', label: 'Auction', icon: 'auction' },
  { to: '/governance', label: 'Governance', icon: 'governance' },
  { to: '/identity', label: 'Identity', icon: 'identity' }
];

const secondaryTabs = [
  { to: '/features', label: 'Features', icon: 'features' },
  { to: '/docs', label: 'Docs', icon: 'docs' },
  { to: '/about', label: 'About', icon: 'about' },
  { to: '/hiring', label: 'Hiring', icon: 'hiring' }
];

function TabItem({ tab }) {
  return (
    <NavLink
      key={tab.to}
      to={tab.to}
      onMouseEnter={() => prefetchRoute(tab.to)}
      onFocus={() => prefetchRoute(tab.to)}
      data-testid={`tab-${tab.label.toLowerCase()}`}
      className={({ isActive }) =>
        `tab-item ${isActive ? 'active' : ''}`
      }
    >
      <span className="tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="img" focusable="false">
          <path d={iconPaths[tab.icon]} />
        </svg>
      </span>
      <span>{tab.label}</span>
    </NavLink>
  );
}

export default function TabBar() {
  return (
    <nav className="tab-bar">
      <div className="tab-brand">
        <span className="brand-crest-global" aria-hidden="true" />
        <div>
          <div className="brand-title">VESTRA</div>
          <div className="brand-subtitle">Vesting Credit Protocol</div>
        </div>
      </div>
      <div className="tab-group">
        {primaryTabs.map((tab) => (
          <TabItem key={tab.to} tab={tab} />
        ))}
      </div>
      <div className="tab-divider" />
      <div className="tab-group tab-group--secondary">
        {secondaryTabs.map((tab) => (
          <TabItem key={tab.to} tab={tab} />
        ))}
      </div>
    </nav>
  );
}
