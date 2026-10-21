/**
 * app/api/loans/route.ts  — Next.js App Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoints (all read straight from the Vestra LoanManager, no indexer):
 *   GET  /api/loans?wallet=0x...&chainId=11155111   → wallet's loans (LoanManager.loansOf)
 *   GET  /api/loans?loanId=1&chainId=11155111       → single loan + live debt / health
 *   POST /api/loans                                 → borrow quote (LoanManager.quoteMaxBorrow)
 *
 * The actual borrow / repay transactions are submitted client-side via wagmi.
 * All USDC amounts are 6-decimal integer strings; rates are bps.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, getAddress, isAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { CONTRACTS } from '@/config/contracts';

const STATUS = ['none', 'active', 'auction', 'repaid', 'liquidated'] as const;

const CHAIN_CONFIGS: Record<number, { rpc: string; loanManager: `0x${string}` }> = {
  11155111: {
    rpc:         process.env.RPC_SEPOLIA ?? process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? 'https://ethereum-sepolia-rpc.publicnode.com',
    loanManager: CONTRACTS[11155111].loanManager,
  },
};

const makeClient = (rpc: string) => createPublicClient({ chain: sepolia, transport: http(rpc) });
type Client = ReturnType<typeof makeClient>;

function clientFor(chainId: number): { client: Client; loanManager: `0x${string}` } | null {
  const cfg = CHAIN_CONFIGS[chainId];
  if (!cfg || !cfg.rpc) return null;
  return { client: makeClient(cfg.rpc), loanManager: cfg.loanManager };
}

async function readLoan(client: Client, loanManager: `0x${string}`, loanId: bigint) {
  const lm = { address: loanManager, abi: LOAN_MANAGER_ABI } as const;
  const [loan, debt, healthFactorBps, isLiquidatable] = await Promise.all([
    client.readContract({ ...lm, functionName: 'getLoan', args: [loanId] }),
    client.readContract({ ...lm, functionName: 'debtOf', args: [loanId] }),
    client.readContract({ ...lm, functionName: 'healthFactorBps', args: [loanId] }),
    client.readContract({ ...lm, functionName: 'isLiquidatable', args: [loanId] }),
  ]);
  return {
    loanId:          loanId.toString(),
    borrower:        loan.borrower,
    nftContract:     loan.nftContract,
    streamId:        loan.streamId.toString(),
    escrowId:        loan.escrowId.toString(),
    token:           loan.token,
    quantity:        loan.quantity.toString(),
    unlockTime:      Number(loan.unlockTime),
    principal:       loan.principal.toString(),
    debt:            debt.toString(),
    openedAt:        Number(loan.openedAt),
    maturity:        Number(loan.maturity),
    rank:            loan.rank,
    status:          STATUS[loan.status] ?? 'unknown',
    healthFactorBps: healthFactorBps.toString(),
    isLiquidatable,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/loans
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const wallet  = searchParams.get('wallet');
  const loanId  = searchParams.get('loanId');
  const chainId = parseInt(searchParams.get('chainId') ?? '11155111', 10);

  const ctx = clientFor(chainId);
  if (!ctx) return NextResponse.json({ error: 'Unsupported chainId' }, { status: 400 });

  try {
    if (loanId) {
      if (!/^\d+$/.test(loanId)) return NextResponse.json({ error: 'Invalid loanId' }, { status: 400 });
      const loan = await readLoan(ctx.client, ctx.loanManager, BigInt(loanId));
      if (loan.status === 'none') return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
      return NextResponse.json({ loan });
    }

    if (wallet) {
      if (!isAddress(wallet)) {
        return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
      }
      const ids = await ctx.client.readContract({
        address: ctx.loanManager,
        abi: LOAN_MANAGER_ABI,
        functionName: 'loansOf',
        args: [getAddress(wallet)],
      });
      const loans = await Promise.all(ids.map((id) => readLoan(ctx.client, ctx.loanManager, id)));
      return NextResponse.json({ loans });
    }

    return NextResponse.json({ error: 'Provide wallet or loanId' }, { status: 400 });
  } catch (err: any) {
    console.error('[GET /api/loans]', err);
    return NextResponse.json({ error: err.shortMessage ?? err.message ?? 'Internal error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/loans  — borrow quote (reads on-chain dDPV, no state change)
// Body: { collateralToken, quantity, unlockTime, nftContract, chainId }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { collateralToken, quantity, unlockTime, nftContract, chainId = 11155111 } = body;

    // Input validation
    if (!isAddress(collateralToken)) return NextResponse.json({ error: 'Invalid collateralToken' }, { status: 400 });
    if (!isAddress(nftContract))     return NextResponse.json({ error: 'Invalid nftContract' }, { status: 400 });
    if (!quantity || BigInt(quantity) === 0n) return NextResponse.json({ error: 'quantity=0' }, { status: 400 });
    if (!unlockTime || unlockTime <= Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: 'unlockTime in past' }, { status: 400 });
    }

    const ctx = clientFor(Number(chainId));
    if (!ctx) return NextResponse.json({ error: 'Unsupported chainId' }, { status: 400 });

    const lm = { address: ctx.loanManager, abi: LOAN_MANAGER_ABI } as const;
    const [[maxBorrow, pv, ltvBps], feeBps, rateBps] = await Promise.all([
      ctx.client.readContract({
        ...lm,
        functionName: 'quoteMaxBorrow',
        args: [getAddress(collateralToken), BigInt(quantity), BigInt(unlockTime), getAddress(nftContract)],
      }),
      ctx.client.readContract({ ...lm, functionName: 'originationFeeBps' }),
      ctx.client.readContract({ ...lm, functionName: 'currentRateBps' }),
    ]);

    const fee          = (maxBorrow * feeBps) / 10_000n;
    const disbursement = maxBorrow - fee;

    return NextResponse.json({
      pvUsdc:             pv.toString(),
      ltvBps:             ltvBps.toString(),
      maxBorrowUsdc:      maxBorrow.toString(),     // pre-fee
      disbursementUsdc:   disbursement.toString(),  // post-fee
      originationFeeUsdc: fee.toString(),
      borrowRateBps:      rateBps.toString(),       // floating APR
    });
  } catch (err: any) {
    console.error('[POST /api/loans]', err);
    return NextResponse.json({ error: err.shortMessage ?? err.message ?? 'Internal error' }, { status: 500 });
  }
}
