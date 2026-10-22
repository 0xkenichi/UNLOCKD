// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
//
// Unit tests for components: bundles every src/**/*.test.jsx with the esbuild Vite already
// ships (JSX, CSS imports emptied) and runs the bundles with `node --test`. No browser.
import { build } from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = join(root, 'node_modules/.cache/unit-tests');

const find = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? find(join(dir, e.name)) : /\.test\.jsx?$/.test(e.name) ? [join(dir, e.name)] : []
  );

const entryPoints = find(join(root, 'src'));
if (!entryPoints.length) {
  console.log('no unit tests found');
  process.exit(0);
}

rmSync(outdir, { recursive: true, force: true });
await build({
  entryPoints,
  outdir,
  outbase: join(root, 'src'),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  external: ['react', 'react-dom', 'react/*', 'react-dom/*', 'node:*'],
  logLevel: 'warning'
});

const files = entryPoints.map((f) => join(outdir, relative(join(root, 'src'), f)).replace(/\.jsx?$/, '.mjs'));
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(run.status ?? 1);
