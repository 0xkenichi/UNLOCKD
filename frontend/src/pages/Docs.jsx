import { useMemo, useState } from 'react';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import overviewDoc from '../../../docs/OVERVIEW.md?raw';
import whitepaperDoc from '../../../docs/WHITEPAPER.md?raw';
import litepaperDoc from '../../../docs/LITEPAPER.md?raw';
import faqDoc from '../../../docs/FAQ.md?raw';
import technicalSpecDoc from '../../../docs/TECHNICAL_SPEC.md?raw';
import riskModelsDoc from '../../../docs/RISK_MODELS.md?raw';

const docLibrary = [
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
  }
];

const snippetFrom = (content) =>
  (content || '')
    .split('\n')
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 220);

export default function Docs() {
  const [activeDocId, setActiveDocId] = useState('whitepaper');
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

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Public Docs</h1>
        <div className="page-subtitle">
          Everything public about the VESTRA protocol, with full whitepaper
          preview and inline readers.
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration variant="docs" />
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
            <div className="pill">Whitepaper</div>
            <div className="pill">Litepaper</div>
            <div className="pill">Technical Spec</div>
            <div className="pill">Risk Models</div>
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
            <div className="pill">Public only</div>
            <div className="pill">Zero gating</div>
            <div className="pill">Live text</div>
          </div>
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
