import { useState } from 'react';
import { parseUnits } from 'viem';
import {
  useAccount,
  useChainId,
  useWriteContract,
  useWaitForTransactionReceipt
} from 'wagmi';
import { getContractAddress, usdcAbi } from '../../utils/contracts.js';

const DEFAULT_AMOUNT = '10000';
const USDC_DECIMALS = 6;

export default function FaucetCard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [copied, setCopied] = useState(false);
  const faucetAddress =
    import.meta.env.VITE_MOCK_USDC_ADDRESS ||
    getContractAddress(chainId, 'usdc') ||
    '';

  const { data: hash, writeContract, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({
      hash
    });

  const handleMint = () => {
    if (!faucetAddress || !amount) {
      return;
    }
    try {
      const parsed = parseUnits(amount, USDC_DECIMALS);
      writeContract({
        address: faucetAddress,
        abi: usdcAbi,
        functionName: 'mint',
        args: [address, parsed]
      });
    } catch (err) {
      // Ignore parse errors; input guard text covers invalid values.
    }
  };

  const disabled =
    !isConnected || !faucetAddress || isPending || isConfirming;

  const handleCopy = async () => {
    if (!faucetAddress) {
      return;
    }
    try {
      await navigator.clipboard.writeText(faucetAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="holo-card">
      {error && (
        <div className="error-banner">
          {error.message || 'Something went wrong. Try again.'}
        </div>
      )}
      {(isPending || isConfirming) && (
        <div className="loading-row">
          <div className="spinner" />
        </div>
      )}
      <div className="section-head">
        <div>
          <h3 className="section-title">Mock USDC Faucet</h3>
          <div className="section-subtitle">
            Mint test USDC for demo flows.
          </div>
        </div>
        <button
          className="button ghost faucet-copy"
          onClick={handleCopy}
          type="button"
          disabled={!faucetAddress}
        >
          {copied ? 'Copied' : 'Copy address'}
        </button>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Chain</div>
          <div className="stat-value">{chainId || '—'}</div>
          <div className="stat-delta">Testnet only</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Wallet</div>
          <div className="stat-value">
            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '—'}
          </div>
          <div className="stat-delta">Connected address</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Faucet</div>
          <div className="stat-value">
            {faucetAddress ? `${faucetAddress.slice(0, 6)}...${faucetAddress.slice(-4)}` : '—'}
          </div>
          <div className="stat-delta">Mock USDC</div>
        </div>
      </div>
      <div className="inline-actions">
        <button
          className="chip"
          type="button"
          onClick={() => setAmount('1000')}
        >
          1k
        </button>
        <button
          className="chip"
          type="button"
          onClick={() => setAmount('10000')}
        >
          10k
        </button>
        <button
          className="chip"
          type="button"
          onClick={() => setAmount('50000')}
        >
          50k
        </button>
      </div>
      <div className="inline-actions">
        <input
          className="faucet-input"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount (USDC)"
          inputMode="decimal"
        />
        <button className="button" onClick={handleMint} disabled={disabled}>
          {isPending || isConfirming ? 'Minting...' : 'Mint'}
        </button>
      </div>
      <div className="progress-meta">
        <span>{isSuccess ? 'Minted.' : error ? 'Mint failed.' : ''}</span>
        <span>{isConnected ? 'Wallet ready' : 'Connect wallet'}</span>
      </div>
    </div>
  );
}
