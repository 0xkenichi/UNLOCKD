// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import overviewDoc from '../../../docs/OVERVIEW.md?raw';
import whitepaperDoc from '../../../docs/WHITEPAPER.md?raw';
import litepaperDoc from '../../../docs/protocol-design/LITEPAPER.md?raw';
import faqDoc from '../../../docs/reference/FAQ.md?raw';
import technicalSpecDoc from '../../../docs/protocol-design/TECHNICAL_SPEC.md?raw';
import riskModelsDoc from '../../../docs/RISK_MODELS.md?raw';
import tokenomicsDoc from '../../../docs/token-and-governance/TOKENOMICS_FINAL.md?raw';
import testnetFaucetDemoDoc from '../../../docs/build-and-deploy/TESTNET_FAUCET_DEMO_ONE_PAGER.md?raw';
import testnetVestingQuickstartDoc from '../../../docs/build-and-deploy/TESTNET_VESTING_CREATION_QUICKSTART.md?raw';

import ArchitectureVisual from '../components/docs/ArchitectureVisual.jsx';

const docLibrary = [
  {
    id: 'tokenomics',
    title: 'Tokenomics',
    filename: 'TOKENOMICS_FINAL.md',
    summary: 'Allocation, vesting unlock timelines, and distribution breakdown.',
    tags: ['Public', 'Economics'],
    content: tokenomicsDoc
  },
  {
    id: 'whitepaper',
    title: 'Whitepaper (Full Preview)',
    filename: 'WHITEPAPER.md',
    summary: 'Complete protocol design, auctions, credit logic, and risk surface.',
    tags: ['Public', 'Protocol'],
    content: whitepaperDoc
  },
  {
    id: 'overview',
    title: 'Protocol Overview',
    filename: 'OVERVIEW.md',
    summary: 'High-level map of vesting credit rails and system roles.',
    tags: ['Public', 'Starter'],
    content: overviewDoc
  },
  {
    id: 'litepaper',
    title: 'Litepaper',
    filename: 'LITEPAPER.md',
    summary: 'Narrative summary with the problem, solution, and user journeys.',
    tags: ['Public', 'Explainer'],
    content: litepaperDoc
  },
  {
    id: 'faq',
    title: 'FAQ',
    filename: 'FAQ.md',
    summary: 'Concise answers to protocol, security, and roadmap questions.',
    tags: ['Public', 'Support'],
    content: faqDoc
  },
  {
    id: 'technical-spec',
    title: 'Technical Spec',
    filename: 'TECHNICAL_SPEC.md',
    summary: 'Interfaces, flows, and validation rules used by the MVP.',
    tags: ['Public', 'Engineering'],
    content: technicalSpecDoc
  },
  {
    id: 'risk-models',
    title: 'Risk Models',
    filename: 'RISK_MODELS.md',
    summary: 'Risk inputs, LTV bounds, and simulation notes for borrowing.',
    tags: ['Public', 'Risk'],
    content: riskModelsDoc
  },
  {
    id: 'testnet-faucet',
    title: 'Testnet Faucet Demo Guide',
    filename: 'TESTNET_FAUCET_DEMO_ONE_PAGER.md',
    summary: 'How external users get faucet funds and complete a safe Vestra demo flow.',
    tags: ['Public', 'Testnet'],
    content: testnetFaucetDemoDoc
  },
  {
    id: 'vesting-quickstart',
    title: 'Testnet Vesting Creation Quickstart',
    filename: 'TESTNET_VESTING_CREATION_QUICKSTART.md',
    summary: 'Create sample vesting contracts and run borrow demos end-to-end.',
    tags: ['Public', 'Testnet'],
    content: testnetVestingQuickstartDoc
  }
];

const snippetFrom = (content) =>
  (content || '')
    .split('\n')
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 220);

function TokenomicsVisual() {
  return (
    <div className="tokenomics-visual-container">
      <svg className="feature-svg" viewBox="0 0 800 300" role="img" aria-label="Tokenomics structure and release timeline" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="grad-core" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="grad-community" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="grad-team" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="grad-treasury" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.4" />
          </linearGradient>

          <filter id="glow-core" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <rect x="0" y="0" width="800" height="300" rx="24" fill="rgba(10,14,20,0.8)" stroke="rgba(88,166,255,0.15)" strokeWidth="1" />

        {/* Title Group */}
        <text x="40" y="55" fill="var(--text-primary)" fontSize="20" fontWeight="600" letterSpacing="0.5">Tokenomics Allocation</text>
        <text x="40" y="80" fill="var(--text-muted)" fontSize="13">Detailed view of CRDT distribution and unlock schedules over time</text>

        {/* Timeline background lines */}
        <path d="M 440 40 L 440 260" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M 540 40 L 540 260" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M 720 40 L 720 260" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />

        <text x="440" y="30" fill="var(--text-muted)" fontSize="11" textAnchor="middle">TGE Date</text>
        <text x="540" y="30" fill="var(--text-muted)" fontSize="11" textAnchor="middle">Cliff (1y)</text>
        <text x="720" y="30" fill="var(--text-muted)" fontSize="11" textAnchor="middle">Full Vest (4y)</text>

        {/* Core Ecosystem */}
        <g transform="translate(40, 110)">
          <rect x="0" y="0" width="220" height="24" rx="12" fill="url(#grad-core)" filter="url(#glow-core)" />
          <text x="235" y="16" fill="#e2e8f0" fontSize="13" fontWeight="500">Core Ecosystem (40%)</text>
          {/* Timeline connection */}
          <line x1="400" y1="12" x2="680" y2="12" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="2" />
          <circle cx="400" cy="12" r="6" fill="#3b82f6" filter="url(#glow-blue)" />
          <circle cx="680" cy="12" r="5" fill="#3b82f6" opacity="0.6" />
        </g>

        {/* Community Programs */}
        <g transform="translate(40, 150)">
          <rect x="0" y="0" width="160" height="24" rx="12" fill="url(#grad-community)" />
          <text x="175" y="16" fill="#e2e8f0" fontSize="13" fontWeight="500">Community & Liquidity (25%)</text>
          <line x1="400" y1="12" x2="500" y2="12" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="2" />
          <circle cx="400" cy="12" r="6" fill="#10b981" />
          <circle cx="500" cy="12" r="5" fill="#10b981" opacity="0.6" />
        </g>

        {/* Team & Contributors */}
        <g transform="translate(40, 190)">
          <rect x="0" y="0" width="120" height="24" rx="12" fill="url(#grad-team)" />
          <text x="135" y="16" fill="#e2e8f0" fontSize="13" fontWeight="500">Team & Contributors (20%)</text>
          <line x1="500" y1="12" x2="680" y2="12" stroke="rgba(245, 158, 11, 0.4)" strokeWidth="2" strokeDasharray="3 3" />
          <circle cx="500" cy="12" r="6" fill="#f59e0b" />
          <circle cx="680" cy="12" r="5" fill="#f59e0b" opacity="0.6" />
        </g>

        {/* Treasury Reserve */}
        <g transform="translate(40, 230)">
          <rect x="0" y="0" width="100" height="24" rx="12" fill="url(#grad-treasury)" />
          <text x="115" y="16" fill="#e2e8f0" fontSize="13" fontWeight="500">Treasury Reserve (15%)</text>
          <line x1="400" y1="12" x2="680" y2="12" stroke="rgba(139, 92, 246, 0.4)" strokeWidth="2" strokeDasharray="2 4" />
          <circle cx="400" cy="12" r="6" fill="#8b5cf6" />
        </g>

        <text x="400" y="280" fill="rgba(255,255,255,0.4)" fontSize="11" textAnchor="middle">* Distribution perfectly aligns with protocol maturity milestones</text>
      </svg>
    </div>
  );
}

export default function Docs() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeDocId, setActiveDocId] = useState('tokenomics');
  const activeDoc = useMemo(
    () => docLibrary.find((doc) => doc.id === activeDocId),
    [activeDocId]
  );

  const scrollTo = (id) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openDoc = (id) => {
    setActiveDocId(id);
    setTimeout(() => scrollTo('doc-viewer'), 100);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedDocId = params.get('doc');
    if (!requestedDocId) return;
    if (!docLibrary.some((doc) => doc.id === requestedDocId)) return;
    setActiveDocId(requestedDocId);
    setTimeout(() => scrollTo('doc-viewer'), 100);
  }, [location.search]);

  return (
    <div className="stack">
      <style dangerouslySetInnerHTML={{
        __html: `
        .legal-doc-container {
          padding: 2rem 0;
          margin-top: 1rem;
          color: var(--text-primary);
          font-family: var(--font-family);
          line-height: 1.8;
          font-size: 1.05rem;
          position: relative;
          text-align: left;
          width: 100%;
          max-width: 800px;
          margin-left: auto;
          margin-right: auto;
        }

        .legal-doc-content {
          position: relative;
          z-index: 1;
        }

        .legal-doc-content h1, 
        .legal-doc-content h2, 
        .legal-doc-content h3 {
          font-family: var(--font-display);
          color: var(--text-primary);
          margin-top: 2.5rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          letter-spacing: -0.01em;
          border-bottom: 1px solid var(--border-subtle);
        }

        .legal-doc-content h1 {
          font-size: 2.5rem;
          border-bottom: none;
          margin-bottom: 2rem;
          font-weight: 800;
        }

        .legal-doc-content p {
          margin-bottom: 1.5rem;
          color: var(--text-secondary);
        }

        .legal-doc-content ul, 
        .legal-doc-content ol {
          margin-left: 1.5rem;
          margin-bottom: 1.5rem;
          color: var(--text-secondary);
        }

        .legal-doc-content li {
          margin-bottom: 0.5rem;
        }

        .legal-doc-content strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        .legal-doc-content blockquote {
          border-left: 4px solid #3b82f6;
          margin-left: 0;
          padding-left: 1.5rem;
          font-style: italic;
          color: #94a3b8;
          background: rgba(59, 130, 246, 0.05);
          padding: 1rem 1.5rem;
          border-radius: 0 8px 8px 0;
        }

        .legal-doc-seal {
          margin-top: 4rem;
          padding-top: 2rem;
          border-top: 1px dashed rgba(255,255,255,0.2);
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-family: "Inter", sans-serif;
          font-size: 0.85rem;
          color: #64748b;
        }

        .signature-line {
          width: 200px;
          border-bottom: 1px solid rgba(255,255,255,0.3);
          margin-bottom: 0.5rem;
        }

        .tokenomics-visual-container {
          margin: 1.5rem 0;
          transition: transform 0.3s ease;
        }
        
        .tokenomics-visual-container:hover {
          transform: translateY(-2px);
        }

        /* Adjust the codeblocks for legal doc */
        .legal-doc-content pre {
          background: #000;
          border: 1px solid #333;
          padding: 1rem;
          border-radius: 6px;
          font-family: monospace;
          font-size: 0.9rem;
          overflow-x: auto;
          text-align: left;
        }
      `}} />

      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 className="page-title holo-glow">Protocol Documentation</h1>
        <div className="page-subtitle" style={{ maxWidth: '600px', margin: '1rem auto', lineHeight: '1.6' }}>
          Explore the mechanics, economics, and technical specification of the Vestra Protocol. Comprehensive and transparent protocol resources.
        </div>
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h3 className="section-title" style={{ fontSize: '1.5rem', color: '#fff', fontFamily: 'var(--font-display)' }}>Protocol Architecture Explorer</h3>
            <div className="section-subtitle" style={{ color: '#94a3b8', marginTop: '0.25rem' }}>An interactive map of core participants and liquidity routing</div>
          </div>
          <button className="button ghost" type="button" onClick={() => openDoc('whitepaper')} style={{ borderColor: 'rgba(88,166,255,0.3)' }}>
            Read Whitepaper
          </button>
        </div>
        <ArchitectureVisual />
      </div>

      <div className="holo-card feature-visual-card" style={{ padding: '2rem', border: '1px solid rgba(88,166,255,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div className="section-head" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h3 className="section-title" style={{ fontSize: '1.5rem', color: '#fff' }}>Tokenomics & Release Dynamics</h3>
            <div className="section-subtitle" style={{ color: '#94a3b8' }}>A comprehensive overview of CRDT allocation and schedule framing</div>
          </div>
          <button className="button ghost" type="button" onClick={() => openDoc('tokenomics')} style={{ borderColor: 'rgba(88,166,255,0.3)' }}>
            Read Full Tokenomics
          </button>
        </div>
        <TokenomicsVisual />
      </div>

      <div className="stat-row" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
        <div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="stat-label">Public Library</div>
          <div className="stat-value" style={{ color: '#60a5fa' }}>{docLibrary.length} Specs</div>
          <div className="stat-delta">Protocol & Integrations</div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="stat-label">System Integrity</div>
          <div className="stat-value" style={{ color: '#34d399' }}>Verified</div>
          <div className="stat-delta">Cryptographically Audited</div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="stat-label">Access Level</div>
          <div className="stat-value" style={{ color: '#a78bfa' }}>Open Source</div>
          <div className="stat-delta">No Authorization Required</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="holo-card brand-spotlight">
          <h3 className="holo-title">Transparent by Default</h3>
          <p className="muted" style={{ lineHeight: '1.7' }}>
            We believe in radical transparency. Every aspect of the protocol—from our lending mechanics to our risk mitigation strategies—is documented here as fully binding specifications for the ecosystem.
          </p>
          <div className="inline-actions" style={{ marginTop: '1.5rem' }}>
            <button className="button ghost" type="button" onClick={() => openDoc('whitepaper')}>Whitepaper</button>
            <button className="button ghost" type="button" onClick={() => openDoc('litepaper')}>Litepaper</button>
            <button className="button ghost" type="button" onClick={() => openDoc('technical-spec')}>Tech Spec</button>
            <button className="button ghost" type="button" onClick={() => openDoc('risk-models')}>Risk Models</button>
          </div>
        </div>
        <div className="holo-card" id="docs-location">
          <h3 className="holo-title">Direct Source Access</h3>
          <p className="muted" style={{ lineHeight: '1.7' }}>
            These documents are pulled directly from our canonical source repository, ensuring you always interact with the most up-to-date and authoritative texts underlying our smart contracts.
          </p>
          <div className="inline-actions" style={{ marginTop: '1.5rem' }}>
            <span className="tag" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>Open Repo</span>
            <span className="tag" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>Live Reader</span>
            <button className="button ghost" type="button" onClick={() => navigate('/landing')}>Main Site</button>
          </div>
        </div>
      </div>

      <div className="holo-card" id="public-library" style={{ marginTop: '2rem' }}>
        <div className="section-head">
          <div>
            <h3 className="section-title">Documentation Registry</h3>
            <div className="section-subtitle">
              Select any specification to view the legally binding protocol definitions.
            </div>
          </div>
        </div>
        <div className="doc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          {docLibrary.map((doc) => (
            <article
              key={doc.id}
              className={`doc-card ${activeDocId === doc.id ? 'active' : ''}`}
              style={{
                background: 'var(--surface-soft)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'all 0.2s',
                ...(activeDocId === doc.id ? { borderColor: '#3b82f6', background: 'rgba(59,130,246,0.05)', boxShadow: 'var(--glow-purple-soft)' } : {})
              }}
              onClick={() => openDoc(doc.id)}
            >
              <div className="inline-actions">
                <div className="pill" style={{ fontSize: '0.75rem' }}>{doc.filename}</div>
              </div>
              <h4 className="doc-title" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>{doc.title}</h4>
              <p className="muted doc-snippet" style={{ fontSize: '0.85rem' }}>{snippetFrom(doc.content)}...</p>
              <div className="inline-actions" style={{ marginTop: '1rem' }}>
                <button
                  className={activeDocId === doc.id ? "button" : "button ghost"}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openDoc(doc.id); }}
                >
                  {activeDocId === doc.id ? 'Active View' : 'Read Document'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="doc-viewer" id="doc-viewer" style={{ marginTop: '3rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '2rem', color: '#fff', marginBottom: '0.5rem', fontWeight: '300' }}>Official Protocol Reading Room</h2>
          <p style={{ color: '#94a3b8' }}>Viewing certified document: <span style={{ color: '#fff' }}>{activeDoc?.filename || 'None'}</span></p>
        </div>

        {activeDoc?.content ? (
          <div className="legal-doc-container">
            <div className="legal-doc-content" role="document" aria-live="polite">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {activeDoc.content}
              </ReactMarkdown>
            </div>
            <div className="legal-doc-seal">
              <div>
                <div className="signature-line"></div>
                <div>Protocol Signatory Validation</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#475569' }}>Doc Hash: 0x{Array.from(activeDoc.content).reduce((s, c) => Math.imul(31, s) + c.charCodeAt(0) | 0, 0).toString(16).padStart(8, '0')}...</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#3b82f6', fontWeight: 'bold', letterSpacing: '2px', fontSize: '1.2rem', marginBottom: '0.5rem' }}>VESTRA PROTOCOL</div>
                <div>Legally Binding Specification</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Version Controlled / On-Chain Parity</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="holo-card" style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="muted" style={{ fontSize: '1.2rem' }}>Please select a document from the registry above to commence reading.</div>
          </div>
        )}
      </div>
    </div>
  );
}
