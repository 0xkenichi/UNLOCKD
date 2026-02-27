import { keccak256, toBytes } from 'viem';

// Deterministic stringify so relayer signatures are stable across runtimes.
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.keys(value)
    .sort()
    .forEach((k) => {
      out[k] = sortKeysDeep(value[k]);
    });
  return out;
}

export function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

export function hashRelayerPayload(payload) {
  const raw = stableStringify(payload || {});
  return keccak256(toBytes(raw));
}

export function buildRelayerTypedData({ chainId, verifyingContract, user, vault, action, payloadHash, nonce, issuedAt, expiresAt }) {
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
    primaryType: 'RelayerRequest',
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

export function makeRelayerAuth({ chainId, verifyingContract, user, vault, action, payload }) {
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

