import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import overviewDoc from '../../../docs/OVERVIEW.md?raw';
import whitepaperDoc from '../../../docs/WHITEPAPER.md?raw';
import litepaperDoc from '../../../docs/protocol-design/LITEPAPER.md?raw';
import faqDoc from '../../../docs/reference/FAQ.md?raw';
import technicalSpecDoc from '../../../docs/protocol-design/TECHNICAL_SPEC.md?raw';
import riskModelsDoc from '../../../docs/RISK_MODELS.md?raw';
import tokenomicsDoc from '../../../docs/token-and-governance/TOKENOMICS_FINAL.md?raw';
import testnetFaucetDemoDoc from '../../../docs/build-and-deploy/TESTNET_FAUCET_DEMO_ONE_PAGER.md?raw';
import testnetVestingQuickstartDoc from '../../../docs/build-and-deploy/TESTNET_VESTING_CREATION_QUICKSTART.md?raw';

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
    <svg className="feature-svg" viewBox="0 0 700 250" role="img" aria-label="Tokenomics structure and release timeline">
      <rect x="16" y="16" width="668" height="218" rx="18" fill="rgba(10,14,20,0.64)" stroke="rgba(88,166,255,0.24)" />
      <text x="36" y="46" fill="var(--text-primary)" fontSize="14">Tokenomics Structure</text>
      <text x="36" y="66" fill="var(--text-muted)" fontSize="11">Illustrative allocation and release cadence</text>
      <rect x="36" y="86" width="210" height="18" rx="8" fill="rgba(88,166,255,0.28)" />
      <rect x="36" y="112" width="168" height="18" rx="8" fill="rgba(16,185,129,0.25)" />
      <rect x="36" y="138" width="126" height="18" rx="8" fill="rgba(251,191,36,0.22)" />
      <rect x="36" y="164" width="84" height="18" rx="8" fill="rgba(167,139,250,0.24)" />
      <text x="254" y="99" fill="var(--text-secondary)" fontSize="10">Core ecosystem allocation</text>
      <text x="212" y="125" fill="var(--text-secondary)" fontSize="10">Community and liquidity programs</text>
      <text x="170" y="151" fill="var(--text-secondary)" fontSize="10">Team and contributor vesting</text>
      <text x="128" y="177" fill="var(--text-secondary)" fontSize="10">Treasury reserve</text>
      <line x1="390" y1="84" x2="654" y2="84" stroke="rgba(139,148,158,0.45)" strokeWidth="1.6" />
      <line x1="390" y1="132" x2="654" y2="132" stroke="rgba(139,148,158,0.22)" strokeWidth="1.2" />
      <line x1="390" y1="180" x2="654" y2="180" stroke="rgba(139,148,158,0.22)" strokeWidth="1.2" />
      <circle cx="414" cy="84" r="6" fill="rgba(88,166,255,0.95)" />
      <circle cx="504" cy="132" r="6" fill="rgba(88,166,255,0.85)" />
      <circle cx="578" cy="180" r="6" fill="rgba(88,166,255,0.75)" />
      <text x="404" y="72" fill="var(--text-secondary)" fontSize="10">TGE</text>
      <text x="487" y="120" fill="var(--text-secondary)" fontSize="10">Cliff unlock</text>
      <text x="553" y="168" fill="var(--text-secondary)" fontSize="10">Linear vesting</text>
      <text x="390" y="210" fill="var(--text-muted)" fontSize="10">Roadmap: distribution aligns with protocol maturity milestones.</text>
    </svg>
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
    setTimeout(() => scrollTo('doc-viewer'), 10);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedDocId = params.get('doc');
    if (!requestedDocId) return;
    if (!docLibrary.some((doc) => doc.id === requestedDocId)) return;
    setActiveDocId(requestedDocId);
    setTimeout(() => scrollTo('doc-viewer'), 10);
  }, [location.search]);

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Public Docs</h1>
        <div className="page-subtitle">
          Everything public about the Vestra Protocol, with full whitepaper
          preview and inline readers.
        </div>
      </div>
      <div className="holo-card feature-visual-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Tokenomics and Release Timeline</h3>
            <div className="section-subtitle">A visual overview for allocation, schedule, and roadmap framing</div>
          </div>
          <button className="button ghost" type="button" onClick={() => openDoc('tokenomics')}>
            Open tokenomics doc
          </button>
        </div>
        <TokenomicsVisual />
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Public docs</div>
          <div className="stat-value">{docLibrary.length} files</div>
          <div className="stat-delta">Protocol + support</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Whitepaper</div>
          <div className="stat-value">Full preview</div>
          <div className="stat-delta">No wallet needed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Access</div>
          <div className="stat-value">Public</div>
          <div className="stat-delta">Readable on click</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="holo-card brand-spotlight">
          <h3 className="holo-title">Protocol for everyone</h3>
          <p className="muted">
            These docs are open and mirror what the community sees: the full
            whitepaper, litepaper, and reference specs. Internal admin-only docs
            stay hidden.
          </p>
          <div className="inline-actions">
            <button className="button ghost" type="button" onClick={() => openDoc('tokenomics')}>Tokenomics</button>
            <button className="button ghost" type="button" onClick={() => openDoc('whitepaper')}>Whitepaper</button>
            <button className="button ghost" type="button" onClick={() => openDoc('litepaper')}>Litepaper</button>
            <button className="button ghost" type="button" onClick={() => openDoc('technical-spec')}>Technical Spec</button>
            <button className="button ghost" type="button" onClick={() => openDoc('risk-models')}>Risk Models</button>
          </div>
        </div>
        <div className="holo-card" id="docs-location">
          <h3 className="holo-title">Docs Source</h3>
          <p className="muted">
            Files resolve directly from the repository under{' '}
            <strong>UNLOCKD/docs</strong>. Clicking a card opens the file
            content without leaving the app.
          </p>
          <div className="inline-actions">
            <span className="tag">Public only</span>
            <span className="tag">Zero gating</span>
            <span className="tag">Live text</span>
            <button className="button ghost" type="button" onClick={() => navigate('/features')}>
              Features explainer
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/landing')}>
              Open minified site
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/airdrop')}>
              Airdrop page
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/feedback')}>
              Feedback form
            </button>
          </div>
        </div>
      </div>
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Quick Navigation</h3>
            <div className="section-subtitle">Jump across product areas while reading documentation</div>
          </div>
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/borrow')}>Borrow</button>
          <button className="button ghost" type="button" onClick={() => navigate('/lender')}>Lender</button>
          <button className="button ghost" type="button" onClick={() => navigate('/community-pools')}>Community Pools</button>
          <button className="button ghost" type="button" onClick={() => navigate('/about')}>About team</button>
          <button className="button ghost" type="button" onClick={() => navigate('/landing')}>Minified site</button>
        </div>
      </div>

      <div className="holo-card" id="public-library">
        <div className="section-head">
          <div>
            <h3 className="section-title">Public Library</h3>
            <div className="section-subtitle">
              Open docs for readers and integrators.
            </div>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() => scrollTo('doc-viewer')}
          >
            Jump to reader
          </button>
        </div>
        <div className="doc-grid">
          {docLibrary.map((doc) => (
            <article
              key={doc.id}
              className={`doc-card ${activeDocId === doc.id ? 'active' : ''}`}
            >
              <div className="inline-actions">
                <div className="pill">{doc.filename}</div>
                <div className="tag brand-tag subtle">Public</div>
              </div>
              <h4 className="doc-title">{doc.title}</h4>
              <p className="muted doc-snippet">{snippetFrom(doc.content)}</p>
              <div className="inline-actions">
                {doc.tags.map((tag) => (
                  <div key={tag} className="pill ghost-pill">
                    {tag}
                  </div>
                ))}
              </div>
              <div className="inline-actions doc-actions">
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => openDoc(doc.id)}
                >
                  {activeDocId === doc.id ? 'Viewing' : 'Read'}
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => scrollTo('docs-location')}
                >
                  View source
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="holo-card doc-viewer" id="doc-viewer">
        <div className="section-head">
          <div>
            <h3 className="section-title">
              {activeDoc ? activeDoc.title : 'Open a document'}
            </h3>
            <div className="section-subtitle">
              {activeDoc
                ? `Previewing ${activeDoc.filename}`
                : 'Select a doc to start reading'}
            </div>
          </div>
          <div className="inline-actions">
            <div className="pill">{activeDoc?.filename || 'No file'}</div>
            <div className="tag brand-tag">Public</div>
          </div>
        </div>
        <div className="doc-meta">
          <div className="pill ghost-pill">Readable inline</div>
          <div className="pill ghost-pill">Scroll to explore</div>
          <div className="pill ghost-pill">Copy-friendly text</div>
        </div>
        <div
          className="doc-article"
          role="document"
          aria-live="polite"
          aria-label={activeDoc?.title || 'Document preview'}
        >
          {activeDoc?.content ? (
            <pre>{activeDoc.content}</pre>
          ) : (
            <div className="muted">Select a document to load its content.</div>
          )}
        </div>
      </div>
    </div>
  );
}
