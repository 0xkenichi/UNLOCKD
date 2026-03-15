import fs from "fs";
import path from "path";
import { DocsClient } from "./DocsClient";

// Define the docs mapping relative to the repo root
const DOCS_CONFIG = [
  { id: 'tokenomics', title: 'Tokenomics', path: 'docs/TOKENOMICS_FINAL.md' },
  { id: 'whitepaper', title: 'Whitepaper', path: 'docs/WHITEPAPER.md' },
  { id: 'overview', title: 'Protocol Overview', path: 'docs/OVERVIEW.md' },
  { id: 'litepaper', title: 'Litepaper', path: 'docs/protocol-design/LITEPAPER.md' },
  { id: 'faq', title: 'FAQ', path: 'docs/reference/FAQ.md' },
  { id: 'technical-spec', title: 'Technical Spec', path: 'docs/protocol-design/TECHNICAL_SPEC.md' },
  { id: 'risk-models', title: 'Risk Models', path: 'docs/RISK_MODELS.md' },
  { id: 'testnet-faucet', title: 'Testnet Faucet', path: 'docs/build-and-deploy/TESTNET_FAUCET_DEMO_ONE_PAGER.md' },
  { id: 'vesting-quickstart', title: 'Quickstart', path: 'docs/build-and-deploy/TESTNET_VESTING_CREATION_QUICKSTART.md' },
];

export default async function DocsPage() {
  const rootDir = path.join(process.cwd(), ".."); // process.cwd() is frontend-v2, so .. is root
  
  const docsData = DOCS_CONFIG.map(doc => {
    try {
      const fullPath = path.join(rootDir, doc.path);
      const content = fs.readFileSync(fullPath, "utf-8");
      return {
        ...doc,
        content
      };
    } catch (e) {
      console.error(`Failed to read doc: ${doc.path}`, e);
      return {
        ...doc,
        content: `# Error\nCould not load content for ${doc.title}.`
      };
    }
  });

  return (
    <div className="space-y-12 pb-20">
      <header className="max-w-3xl">
        <div className="flex items-center gap-2 text-accent-cyan mb-4">
          <span className="w-8 h-[1px] bg-accent-cyan/40" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Knowledge Base</span>
        </div>
        <h1 className="text-5xl font-black font-display text-glow-teal mb-6">PROTOCOL DOCUMENTATION</h1>
        <p className="text-secondary text-lg leading-relaxed">
          Deep dives into the mechanics, risk models, and technical specifications that power Vestra. 
          Radical transparency for the next generation of credit.
        </p>
      </header>

      <DocsClient initialDocs={docsData} />
    </div>
  );
}
