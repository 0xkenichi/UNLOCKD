import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LOAN_MANAGER_ABI, LENDING_POOL_EVENTS_ABI, LoanStatus } from './vestraAbi';

const ABI_DIR = join(__dirname, '..', '..', '..', 'contracts', 'abi');

function loadJsonAbi(name: string): any[] {
  const parsed = JSON.parse(readFileSync(join(ABI_DIR, `${name}.json`), 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.abi;
}

// Compare what matters for encoding/decoding: names, types, tuple shapes, indexed flags, mutability.
function normalizeParam(p: any, isEventInput = false): any {
  const out: any = { name: p.name ?? '', type: p.type };
  // viem's parseAbi omits `indexed: false`; the compiler JSON spells it out.
  if (isEventInput) out.indexed = Boolean(p.indexed);
  if (p.components) out.components = p.components.map((c: any) => normalizeParam(c));
  return out;
}

function normalizeItem(item: any): any {
  return {
    type: item.type,
    name: item.name,
    inputs: (item.inputs ?? []).map((p: any) => normalizeParam(p, item.type === 'event')),
    ...(item.type === 'function'
      ? { outputs: (item.outputs ?? []).map((p: any) => normalizeParam(p)), stateMutability: item.stateMutability }
      : { anonymous: Boolean(item.anonymous) }),
  };
}

function expectSubsetOf(subset: readonly any[], contract: string) {
  const full = loadJsonAbi(contract);
  for (const item of subset) {
    const match = full.find((f) => f.type === item.type && f.name === item.name);
    expect(match, `${contract}.${item.name} missing from ${contract}.json`).toBeDefined();
    expect(normalizeItem(item), `${contract}.${item.name} differs from ${contract}.json`).toEqual(normalizeItem(match));
  }
}

describe('vestraAbi matches packages/contracts/abi', () => {
  it('LoanManager subset', () => expectSubsetOf(LOAN_MANAGER_ABI, 'LoanManager'));
  it('LendingPool events subset', () => expectSubsetOf(LENDING_POOL_EVENTS_ABI, 'LendingPool'));

  it('LoanStatus matches the Loan.status enum order in LoanManager.sol', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'contracts', 'src', 'LoanManager.sol'), 'utf8');
    const m = src.match(/enum Status\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    const names = m![1].split(',').map((s) => s.trim()).filter(Boolean);
    expect(names).toEqual(['None', 'Active', 'Auction', 'Repaid', 'Liquidated']);
    names.forEach((n, i) => expect((LoanStatus as any)[n]).toBe(i));
  });
});
