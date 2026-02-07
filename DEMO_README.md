DEMO BUILD (FRONTEND + DOCS)

What is included
- Frontend static build: frontend/dist
- Docs site static build: docs-site/dist
- Packaged bundle: demo-build.tar.gz

Quick preview (already built)
1) Frontend preview (Vite preview)
   cd frontend
   npm run preview

2) Docs preview (Vite preview)
   cd docs-site
   npm run preview

Simple static server (no node deps)
1) Run the helper script:
   ./scripts/serve-demo.sh

2) Open:
   http://localhost:4173  (frontend)
   http://localhost:4174  (docs site)

One-command rebuild + package
1) Run:
   ./scripts/build-demo.sh

Rebuild if needed
1) Frontend build:
   cd frontend
   npm install --legacy-peer-deps
   npm run build

2) Docs build:
   cd docs-site
   npm install --legacy-peer-deps
   npm run build

Notes
- Frontend install uses --legacy-peer-deps due to a wagmi/rainbowkit peer conflict.
- The tarball demo-build.tar.gz contains both dist folders.

MVP demo (backend + contracts)
- See MVP_README.md for an end-to-end Sepolia walkthrough.
