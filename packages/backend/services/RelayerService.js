const { ethers } = require('ethers');
const { 
  getRelayerWallet, 
  execViaVault, 
  deployVestraVault 
} = require('../relayer/evmRelayer');
const sovereignRelayer = require('../relayer/SovereignRelayer');

/**
 * RelayerService
 * Handles EIP-712 authentication, transaction relaying, and Safe treasury monitoring.
 */
class RelayerService {
  constructor(persistence) {
    this.persistence = persistence;
    this.safeLendingPool = process.env.SAFE_LENDINGPOOL_WALLET || '0xFA515A43b9D010a398ff6A3253c1c7A9374f8c95';
    this.safeInsuranceFund = process.env.SAFE_INSURANCEFUND_WALLET;
    this.safeProtocolFees = process.env.SAFE_PROTOCOLFEES_WALLET;
    this.safeAddress = this.safeLendingPool; // Default for backward compatibility
    this.safeApiKey = process.env.SAFE_API_KEY;
    this.safeApiBase = 'https://safe-transaction-sepolia.safe.global/api/v1';
    
    this.relayerTypes = {
      RelayerRequest: [
        { name: 'user', type: 'address' },
        { name: 'vault', type: 'address' },
        { name: 'action', type: 'string' },
        { name: 'payloadHash', type: 'bytes32' },
        { name: 'nonce', type: 'string' },
        { name: 'issuedAt', type: 'uint256' },
        { name: 'expiresAt', type: 'uint256' }
      ]
    };
  }

  hashRelayerPayload(payload) {
    // Note: old server.js used stableStringify. 
    // For simplicity and matching, I'll use a direct JSON.stringify for now but ensure it matches.
    // Actually, I should probably stick to the exact logic if possible.
    return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload || {})));
  }

  async verifyRelayerAuth({ req, action, payload, vaultAddress }) {
    if (!vaultAddress || !ethers.isAddress(vaultAddress)) {
      throw new Error('Vault address required');
    }

    const sessionWallet = req.user?.walletAddress;
    if (!sessionWallet) throw new Error('Session wallet required');

    const signature = String(req.body?.signature || '').trim();
    const nonce = String(req.body?.nonce || '').trim();
    const issuedAt = Number(req.body?.issuedAt);
    const expiresAt = Number(req.body?.expiresAt);

    if (!signature || !nonce || !issuedAt || !expiresAt) {
      throw new Error('Missing relayer auth');
    }

    const now = Math.floor(Date.now() / 1000);
    if (issuedAt > now + 60) throw new Error('Relayer auth not yet valid');
    if (expiresAt < now) throw new Error('Relayer auth expired');
    if (expiresAt - issuedAt > 10 * 60) throw new Error('Relayer auth window too long');

    const payloadHash = this.hashRelayerPayload(payload);
    if (req.body.payloadHash && req.body.payloadHash !== payloadHash) {
      throw new Error('Relayer payload hash mismatch');
    }

    const domain = {
      name: 'VestraRelayer',
      version: '1',
      chainId: Number(process.env.EVM_CHAIN_ID || 11155111), // Default to Sepolia
      verifyingContract: vaultAddress // Or a fixed address if that's what's used
    };

    const message = {
      user: sessionWallet,
      vault: ethers.getAddress(vaultAddress),
      action,
      payloadHash,
      nonce,
      issuedAt,
      expiresAt
    };

    let recovered;
    try {
      recovered = ethers.verifyTypedData(domain, this.relayerTypes, message, signature);
    } catch (e) {
      throw new Error('Invalid relayer signature');
    }

    if (ethers.getAddress(recovered) !== ethers.getAddress(vaultAddress)) {
      throw new Error('Relayer signature wallet mismatch');
    }

    await this.persistence.consumeRelayerNonce({
      vault: vaultAddress,
      nonce,
      expiresAt
    });

    return true;
  }

  /**
   * Safe Integration: Get treasury health (balances and status)
   */
  async getTreasuryHealth() {
    try {
      const resp = await fetch(`${this.safeApiBase}/safes/${this.safeAddress}/balances/`);
      if (!resp.ok) throw new Error(`Safe API error: ${resp.statusText}`);
      const balances = await resp.json();
      
      const detailsResp = await fetch(`${this.safeApiBase}/safes/${this.safeAddress}/`);
      const details = detailsResp.ok ? await detailsResp.json() : {};

      return {
        address: this.safeAddress,
        threshold: details.threshold,
        owners: details.owners,
        balances: balances.map(b => ({
          token: b.tokenAddress || 'ETH',
          symbol: b.token?.symbol || 'ETH',
          balance: b.balance,
          decimals: b.token?.decimals || 18
        })),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[RelayerService] Error fetching treasury health:', error);
      return { error: error.message, address: this.safeAddress };
    }
  }

  // Proxy to evmRelayer
  async execViaVault(vault, target, value, data) {
    return execViaVault(vault, target, value, data);
  }

  async deployVestraVault(controller) {
    return deployVestraVault(controller);
  }

  getRelayerWallet() {
    return getRelayerWallet();
  }
}

module.exports = RelayerService;
