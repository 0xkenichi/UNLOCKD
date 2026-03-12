// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Buffer } from 'buffer';
import process from 'process';

if (typeof window !== 'undefined') {
  window.global = window.global || window;
  window.Buffer = window.Buffer || Buffer;
  window.process = window.process || process;
  
  // Safe-buffer and some older CJS modules might look for globalThis.Buffer
  globalThis.Buffer = globalThis.Buffer || Buffer;
  globalThis.process = globalThis.process || process;

}
