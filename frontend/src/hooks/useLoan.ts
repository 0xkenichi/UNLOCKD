/**
 * useLoan.ts — wagmi v2 hooks for borrow + repay
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps LoanManager.borrow() and LoanManager.repay() with:
 *   • simulation (preflight revert detection)
 *   • tx submission
 *   • receipt waiting
 *   • toast notifications via returned status fields
 *
 * Usage:
 *   const { borrow, repay, status, txHash, error } = useLoan(chainId);
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use client';

import { useState, useCallback } from 'react';
import {
  usePublicClient,
  useWalletClient,
  useChainId,
} from 'wagmi';
import {
  parseAbi,
  getAddress,
  type Hash,
  keccak256,
  stringToBytes,
} from 'viem';

// ─────────────────────────────────────────────────────────────────────────────
// Contract addresses per chain
// ─────────────────────────────────────────────────────────────────────────────
const LOAN_MANAGER: Record<number, `0x${string}`> = {
  11155111: (process.env.NEXT_PUBLIC_LOAN_MANAGER_SEPOLIA ?? '0x0') as `0x${string}`,
  8453:     (process.env.NEXT_PUBLIC_LOAN_MANAGER_BASE    ?? '0x0') as `0x${string}`,
};

const USDC_ADDRESS: Record<number, `0x${string}`> = {
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
  8453:     '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC
};

// ─────────────────────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────────────────────
const LOAN_MANAGER_ABI = parseAbi([
  'function borrow(address collateralToken, uint256 streamId, uint256 quantity, uint256 unlockTime, uint256 borrowAmount) returns (uint256 loanId)',
  'function repay(uint256 loanId, uint256 interest)',
  'function getLoan(uint256 loanId) view returns ((address borrower, address collateralToken, uint256 streamId, uint256 principal, uint256 interest, uint256 dpvAtOpen, uint256 unlockTime, uint64 openedAt, uint64 closedAt, uint8 status))',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type TxStatus = 'idle' | 'simulating' | 'approving' | 'submitting' | 'confirming' | 'success' | 'error';

interface UseLoanReturn {
  status:  TxStatus;
  txHash:  Hash | null;
  error:   string | null;
  loanId:  bigint | null;
  borrow:  (params: BorrowParams) => Promise<void>;
  repay:   (params: RepayParams)  => Promise<void>;
  reset:   () => void;
}

export interface BorrowParams {
  collateralToken: `0x${string}`;
  streamId:        bigint;
  quantity:        bigint;
  unlockTime:      bigint;
  borrowAmount:    bigint;         // USDC 6-dec
}

export interface RepayParams {
  loanId:   bigint;
  interest: bigint;                // USDC 6-dec
  principal: bigint;               // USDC 6-dec — needed for approval
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useLoan(): UseLoanReturn {
  const chainId      = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [status, setStatus]  = useState<TxStatus>('idle');
  const [txHash, setTxHash]  = useState<Hash | null>(null);
  const [error, setError]    = useState<string | null>(null);
  const [loanId, setLoanId]  = useState<bigint | null>(null);

  const reset = () => {
    setStatus('idle');
    setTxHash(null);
    setError(null);
    setLoanId(null);
  };

  // ── BORROW ──────────────────────────────────────────────────────────────────
  const borrow = useCallback(async (params: BorrowParams) => {
    if (!walletClient || !publicClient) throw new Error('Wallet not connected');
    const lmAddr  = LOAN_MANAGER[chainId];
    if (!lmAddr)  throw new Error(`LoanManager not configured for chainId ${chainId}`);

    try {
      setStatus('simulating');
      setError(null);

      // Preflight simulation — catches reverts before gas spend
      await publicClient.simulateContract({
        address:      lmAddr,
        abi:          LOAN_MANAGER_ABI,
        functionName: 'borrow',
        args: [
          getAddress(params.collateralToken),
          params.streamId,
          params.quantity,
          params.unlockTime,
          params.borrowAmount,
        ],
        account: walletClient.account,
      });

      setStatus('submitting');
      const hash = await walletClient.writeContract({
        address:      lmAddr,
        abi:          LOAN_MANAGER_ABI,
        functionName: 'borrow',
        args: [
          getAddress(params.collateralToken),
          params.streamId,
          params.quantity,
          params.unlockTime,
          params.borrowAmount,
        ],
      });

      setTxHash(hash);
      setStatus('confirming');

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Parse LoanOpened event to extract loanId
      const eventSig = 'LoanOpened(uint256,address,address,uint256,uint256,uint256,uint256,uint256)';
      const hashedSig = keccak256(stringToBytes(eventSig));
      
      const openedLog = receipt.logs.find((log) => log.topics[0] === hashedSig);
      if (openedLog) {
        // loanId is topics[1]
        const id = BigInt(openedLog.topics[1] ?? '0x0');
        setLoanId(id);
      }

      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setError(err?.shortMessage ?? err?.message ?? 'Unknown error');
      throw err;
    }
  }, [walletClient, publicClient, chainId]);

  // ── REPAY ───────────────────────────────────────────────────────────────────
  const repay = useCallback(async (params: RepayParams) => {
    if (!walletClient || !publicClient) throw new Error('Wallet not connected');
    const lmAddr    = LOAN_MANAGER[chainId];
    const usdcAddr  = USDC_ADDRESS[chainId];
    if (!lmAddr)    throw new Error(`LoanManager not configured for chainId ${chainId}`);
    if (!usdcAddr)  throw new Error(`USDC not configured for chainId ${chainId}`);

    const totalOwed = params.principal + params.interest;

    try {
      setStatus('simulating');
      setError(null);

      // Check existing USDC allowance
      const allowance = await publicClient.readContract({
        address:      usdcAddr,
        abi:          ERC20_ABI,
        functionName: 'allowance',
        args:         [walletClient.account.address, lmAddr],
      }) as bigint;

      // Approve if needed
      if (allowance < totalOwed) {
        setStatus('approving');
        const approveHash = await walletClient.writeContract({
          address:      usdcAddr,
          abi:          ERC20_ABI,
          functionName: 'approve',
          args:         [lmAddr, totalOwed],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Preflight repay
      await publicClient.simulateContract({
        address:      lmAddr,
        abi:          LOAN_MANAGER_ABI,
        functionName: 'repay',
        args:         [params.loanId, params.interest],
        account:      walletClient.account,
      });

      setStatus('submitting');
      const hash = await walletClient.writeContract({
        address:      lmAddr,
        abi:          LOAN_MANAGER_ABI,
        functionName: 'repay',
        args:         [params.loanId, params.interest],
      });

      setTxHash(hash);
      setStatus('confirming');
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setError(err?.shortMessage ?? err?.message ?? 'Unknown error');
      throw err;
    }
  }, [walletClient, publicClient, chainId]);

  return { status, txHash, error, loanId, borrow, repay, reset };
}
