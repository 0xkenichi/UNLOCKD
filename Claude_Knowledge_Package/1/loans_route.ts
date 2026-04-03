/**
 * app/api/loans/route.ts  — Next.js App Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoints:
 *   GET  /api/loans?wallet=0x...&chainId=11155111   → list wallet's loans
 *   GET  /api/loans?loanId=1&chainId=11155111       → single loan + events
 *   POST /api/loans/quote                           → compute borrow quote (off-chain dDPV preview)
 *
 * The actual borrow / repay transactions are submitted client-side via wagmi.
 * These routes provide the data layer only (quotes + Supabase reads).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLoan, getLoansByWallet } from '@/services/loanService';
import { createPublicClient, http, getAddress, isAddress } from 'viem';
import { sepolia } from 'viem/chains';

// ── ABI fragment for off-chain dDPV preview ───────────────────────────────────
const VALUATION_ENGINE_ABI = [
  {
    name: 'computeDPV',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'quantity',   type: 'uint256' },
      { name: 'token',      type: 'address' },
      { name: 'unlockTime', type: 'uint256' },
      { name: 'borrower',   type: 'address' },
    ],
    outputs: [
      { name: 'dpv',    type: 'uint256' },
      { name: 'ltvBps', type: 'uint256' },
    ],
  },
] as const;

const CHAIN_CONFIGS: Record<number, { rpc: string; valuationEngine: `0x${string}` }> = {
  11155111: {
    rpc:              process.env.RPC_SEPOLIA              ?? '',
    valuationEngine:  (process.env.VALUATION_ENGINE_SEPOLIA ?? '0x0') as `0x${string}`,
  },
  8453: {
    rpc:              process.env.RPC_BASE                 ?? '',
    valuationEngine:  (process.env.VALUATION_ENGINE_BASE   ?? '0x0') as `0x${string}`,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/loans
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const wallet  = searchParams.get('wallet');
  const loanId  = searchParams.get('loanId');
  const chainId = parseInt(searchParams.get('chainId') ?? '11155111', 10);

  try {
    if (loanId) {
      const loan = await getLoan(parseInt(loanId, 10), chainId);
      return NextResponse.json({ loan });
    }

    if (wallet) {
      if (!isAddress(wallet)) {
        return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
      }
      const loans = await getLoansByWallet(wallet, chainId);
      return NextResponse.json({ loans });
    }

    return NextResponse.json({ error: 'Provide wallet or loanId' }, { status: 400 });
  } catch (err: any) {
    console.error('[GET /api/loans]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/loans/quote  — borrow quote (reads on-chain dDPV, no state change)
// Body: { collateralToken, quantity, unlockTime, borrower, chainId }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { collateralToken, quantity, unlockTime, borrower, chainId = 11155111 } = body;

    // Input validation
    if (!isAddress(collateralToken)) return NextResponse.json({ error: 'Invalid collateralToken' }, { status: 400 });
    if (!isAddress(borrower))        return NextResponse.json({ error: 'Invalid borrower' }, { status: 400 });
    if (!quantity || BigInt(quantity) === 0n) return NextResponse.json({ error: 'quantity=0' }, { status: 400 });
    if (!unlockTime || unlockTime <= Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: 'unlockTime in past' }, { status: 400 });
    }

    const cfg = CHAIN_CONFIGS[chainId];
    if (!cfg || !cfg.rpc) {
      return NextResponse.json({ error: 'Unsupported chainId' }, { status: 400 });
    }

    const client = createPublicClient({ chain: sepolia, transport: http(cfg.rpc) });

    const [dpv, ltvBps] = await client.readContract({
      address:      cfg.valuationEngine,
      abi:          VALUATION_ENGINE_ABI,
      functionName: 'computeDPV',
      args: [
        BigInt(quantity),
        getAddress(collateralToken),
        BigInt(unlockTime),
        getAddress(borrower),
      ],
    }) as [bigint, bigint];

    const MAX_LTV_BPS = 7_000n;
    const effectiveLtv = ltvBps > MAX_LTV_BPS ? MAX_LTV_BPS : ltvBps;
    const maxBorrow    = (dpv * effectiveLtv) / 10_000n;

    // Origination fee preview (50 bps)
    const fee          = (maxBorrow * 50n) / 10_000n;
    const disbursement = maxBorrow - fee;

    return NextResponse.json({
      dpvUsdc:        dpv.toString(),        // 6-dec USDC
      ltvBps:         ltvBps.toString(),
      effectiveLtvBps: effectiveLtv.toString(),
      maxBorrowUsdc:  maxBorrow.toString(),  // pre-fee
      disbursementUsdc: disbursement.toString(), // post-fee
      originationFeeUsdc: fee.toString(),
    });
  } catch (err: any) {
    console.error('[POST /api/loans/quote]', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
