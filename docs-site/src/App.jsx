// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo, useState } from 'react';
import { MDXProvider } from '@mdx-js/react';
import Overview from './content/overview.mdx';
import Litepaper from './content/litepaper.mdx';
import Whitepaper from './content/whitepaper.mdx';
import RiskModels from './content/risk-models.mdx';
import FAQ from './content/faq.mdx';
import Home from './content/home.mdx';
import Tokenomics from './content/tokenomics.mdx';

const docs = [
  {
    id: 'home',
    title: 'VESTRA Protocol',
    summary: 'Public docs landing with quick actions.',
    component: Home,
    tags: ['Start here']
  },
  {
    id: 'overview',
    title: 'Protocol Overview',
    summary: 'What VESTRA solves and how it works.',
    component: Overview,
    tags: ['Public', 'Starter']
  },
  {
    id: 'litepaper',
    title: 'Litepaper',
    summary: 'Narrative summary of problem, solution, flows.',
    component: Litepaper,
    tags: ['Public', 'Explainer']
  },
  {
    id: 'whitepaper',
    title: 'Whitepaper (Full)',
    summary: 'Complete protocol design and math.',
    component: Whitepaper,
    tags: ['Public', 'Protocol']
  },
  {
    id: 'risk-models',
    title: 'Risk Models',
    summary: 'DPV tables, Monte Carlo, and governance guidance.',
    component: RiskModels,
    tags: ['Risk', 'Public']
  },
  {
    id: 'tokenomics',
    title: 'Tokenomics (Phase 1 Final)',
    summary: 'Finalized CRDT allocation, vesting, and treasury controls.',
    component: Tokenomics,
    tags: ['Token', 'Public']
  },
  {
    id: 'faq',
    title: 'FAQ',
    summary: 'Quick answers for contributors and integrators.',
    component: FAQ,
    tags: ['Support', 'Public']
  }
];

const mdxComponents = {
  h1: (props) => <h1 className="mdx-h1" {...props} />,
  h2: (props) => <h2 className="mdx-h2" {...props} />,
  h3: (props) => <h3 className="mdx-h3" {...props} />,
  p: (props) => <p className="mdx-p" {...props} />,
  li: (props) => <li className="mdx-li" {...props} />,
  code: (props) => <code className="mdx-code" {...props} />,
  pre: (props) => <pre className="mdx-pre" {...props} />
};

export default function App() {
  const [activeId, setActiveId] = useState('home');
  const activeDoc = useMemo(
    () => docs.find((doc) => doc.id === activeId) || docs[0],
    [activeId]
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-title">VESTRA</div>
            <div className="brand-subtitle">Public protocol docs</div>
          </div>
        </div>
        <div className="top-actions">
          <a className="button ghost" href="http://localhost:3000" target="_blank" rel="noreferrer">
            Mintlify preview
          </a>
          <a className="button" href="https://app.vesta.local" target="_blank" rel="noreferrer">
            Launch app
          </a>
        </div>
      </header>
      <main className="layout">
        <nav className="sidebar">
          <div className="sidebar-head">
            <div className="sidebar-title">Docs</div>
            <div className="sidebar-subtitle">Click to read inline</div>
          </div>
          <div className="nav-list">
            {docs.map((doc) => (
              <button
                key={doc.id}
                className={`nav-item ${activeId === doc.id ? 'active' : ''}`}
                onClick={() => setActiveId(doc.id)}
                type="button"
              >
                <div className="nav-item-title">{doc.title}</div>
                <div className="nav-item-summary">{doc.summary}</div>
                <div className="pill-row">
                  {doc.tags.map((tag) => (
                    <span key={tag} className="pill">{tag}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </nav>
        <section className="content">
          <div className="content-head">
            <div>
              <div className="eyebrow">Public preview</div>
              <h1 className="content-title">{activeDoc.title}</h1>
              <p className="content-summary">{activeDoc.summary}</p>
            </div>
            <div className="pill-row">
              <span className="pill strong">Public</span>
              <span className="pill ghost">Copy-friendly</span>
              <span className="pill ghost">Scroll to read</span>
            </div>
          </div>
          <div className="doc-surface">
            <MDXProvider components={mdxComponents}>
              <activeDoc.component />
            </MDXProvider>
          </div>
        </section>
      </main>
      <footer className="footer">
        VESTRA — Public docs. For feedback open a PR or ping the team.
      </footer>
    </div>
  );
}
