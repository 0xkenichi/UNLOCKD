import { keccak256, toBytes } from 'viem';

// Deterministic stringify so relayer signatures are stable across runtimes.
function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  Object.keys(value)
    .sort()
    .forEach((k) => {
      out[k] = sortKeysDeep(value[k]);
    });
  return out;
}

export function stableStringify(value: any) {
  return JSON.stringify(sortKeysDeep(value));
}

export function hashRelayerPayload(payload: any) {
  const raw = stableStringify(payload || {});
  return keccak256(toBytes(raw));
}

export interface RelayerAuthParams {
  chainId: number;
  verifyingContract: `0x${string}`;
  user: `0x${string}`;
  vault: `0x${string}`;
  action: string;
  payload: any;
}

export function buildRelayerTypedData({ 
  chainId, 
  verifyingContract, 
  user, 
  vault, 
  action, 
  payloadHash, 
  nonce, 
  issuedAt, 
  expiresAt 
}: {
  chainId: number;
  verifyingContract: `0x${string}`;
  user: `0x${string}`;
  vault: `0x${string}`;
  action: string;
  payloadHash: `0x${string}`;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}) {
  return {
    domain: {
      name: 'VestraRelayer',
      version: '1',
      chainId: Number(chainId || 0),
      verifyingContract
    },
    types: {
      RelayerRequest: [
        { name: 'user', type: 'address' },
        { name: 'vault', type: 'address' },
        { name: 'action', type: 'string' },
        { name: 'payloadHash', type: 'bytes32' },
        { name: 'nonce', type: 'string' },
        { name: 'issuedAt', type: 'uint256' },
        { name: 'expiresAt', type: 'uint256' }
      ]
    },
    primaryType: 'RelayerRequest' as const,
    message: {
      user,
      vault,
      action,
      payloadHash,
      nonce,
      issuedAt: BigInt(issuedAt || 0),
      expiresAt: BigInt(expiresAt || 0)
    }
  };
}

export function makeRelayerAuth({ chainId, verifyingContract, user, vault, action, payload }: RelayerAuthParams) {
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = now;
  const expiresAt = now + 5 * 60;
  const nonce = `${now}-${Math.random().toString(16).slice(2)}`;
  const payloadHash = hashRelayerPayload(payload);
  const typedData = buildRelayerTypedData({
    chainId,
    verifyingContract,
    user,
    vault,
    action,
    payloadHash,
    nonce,
    issuedAt,
    expiresAt
  });
  return { typedData, nonce, issuedAt, expiresAt, payloadHash };
}
