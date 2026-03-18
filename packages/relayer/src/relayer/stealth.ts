import { keccak256, getAddress } from 'viem';
import * as secp256k1 from '@noble/secp256k1';

/**
 * ERC-5564 Stealth Addresses Implementation
 * This allows borrowers to receive USDC or manage collateral via non-associable addresses.
 */
export class StealthManager {
  /**
   * Generates a stealth address for a recipient.
   * @param spendingPublicKey The recipient's stealth spending public key.
   * @param viewingPublicKey The recipient's stealth viewing public key.
   */
  static generateStealthAddress(spendingPublicKey: string, viewingPublicKey: string) {
    // 1. Generate ephemeral private key
    const ephemeralPriv = secp256k1.utils.randomPrivateKey();
    const ephemeralPub = secp256k1.getPublicKey(ephemeralPriv);

    // 2. Compute shared secret (ECDH)
    // S = ephemeralPriv * viewingPublicKey
    const sharedSecret = secp256k1.getSharedSecret(ephemeralPriv, viewingPublicKey);
    const viewTag = keccak256(sharedSecret).slice(2, 4); // First byte as tag

    // 3. Compute stealth public key
    // P = spendingPublicKey + hash(sharedSecret) * G
    const hashedSecret = keccak256(sharedSecret);
    const stealthPub = secp256k1.ProjectivePoint.fromHex(spendingPublicKey.replace('0x', ''))
      .add(secp256k1.ProjectivePoint.BASE.multiply(BigInt(hashedSecret)));

    return {
      stealthAddress: getAddress(`0x${keccak256(stealthPub.toHex(false).slice(2)).slice(-40)}`),
      ephemeralPublicKey: `0x${Buffer.from(ephemeralPub).toString('hex')}`,
      viewTag: `0x${viewTag}`
    };
  }

  /**
   * Scans for stealth addresses belonging to a user.
   */
  static scanForStealth(ephemeralPub: string, viewingPriv: string, spendingPub: string, viewTag: string) {
    const sharedSecret = secp256k1.getSharedSecret(viewingPriv, ephemeralPub.replace('0x', ''));
    const computedTag = keccak256(sharedSecret).slice(2, 4);
    
    if (`0x${computedTag}` !== viewTag) return null;

    const hashedSecret = keccak256(sharedSecret);
    const stealthPub = secp256k1.ProjectivePoint.fromHex(spendingPub.replace('0x', ''))
      .add(secp256k1.ProjectivePoint.BASE.multiply(BigInt(hashedSecret)));

    return getAddress(`0x${keccak256(stealthPub.toHex(false).slice(2)).slice(-40)}`);
  }
}
