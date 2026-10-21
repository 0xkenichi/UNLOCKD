import { createPublicClient, http, Log } from 'viem';
import { sepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import { oracleQueue } from '../queue.js';
import { LOAN_MANAGER_ABI, LENDING_POOL_EVENTS_ABI } from '../contracts/vestraAbi';

const logger = pino({ name: 'EventListener' });

export class LoanEventListener {
  private client:   ReturnType<typeof createPublicClient>;
  private supabase: ReturnType<typeof createClient>;
  private loanManager: `0x${string}`;
  private lendingPool: `0x${string}`;

  constructor(rpcUrl: string, supabaseUrl: string, supabaseKey: string, loanManager: string, lendingPool: string) {
    this.client      = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    this.supabase    = createClient(supabaseUrl, supabaseKey);
    this.loanManager = loanManager as `0x${string}`;
    this.lendingPool = lendingPool as `0x${string}`;
  }

  private setLoanStatus(loanId: bigint, fields: Record<string, unknown>) {
    return (this.supabase.from('loans') as any).update(fields).eq('loan_id_onchain', Number(loanId));
  }

  start(): void {
    logger.info('LoanEventListener started');

    // Watch LoanOpened
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     LOAN_MANAGER_ABI,
      eventName: 'LoanOpened',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { loanId, borrower, token, escrowId, principal, maturity, pv } = (log as any).args;
          // Stream details are read from the loan; the event only carries the escrow id.
          const [loan, rateBps] = await Promise.all([
            this.client.readContract({ address: this.loanManager, abi: LOAN_MANAGER_ABI, functionName: 'getLoan', args: [loanId] }),
            this.client.readContract({ address: this.loanManager, abi: LOAN_MANAGER_ABI, functionName: 'currentRateBps' }),
          ]);
          await (this.supabase.from('loans') as any).upsert({
            loan_id_onchain:  Number(loanId),
            chain_id:         11155111,
            borrower_wallet:  borrower!.toLowerCase(),
            stream_contract:  loan.nftContract.toLowerCase(),
            stream_id:        Number(loan.streamId),
            collateral_token: token!.toLowerCase(),
            borrowed_usdc:    Number(principal!) / 1e6,
            dpv_at_origin:    (Number(pv!) / 1e6).toString(),
            interest_rate_bps: Number(rateBps), // floating; rate at origination
            nft_token_id:     Number(escrowId),
            originated_at:    new Date(Number(loan.openedAt) * 1000).toISOString(),
            due_at:           new Date(Number(maturity) * 1000).toISOString(),
            status:           'active',
          }, { onConflict: 'loan_id_onchain' });
          logger.info({ loanId: loanId?.toString(), borrower }, 'Loan opened synced');
        }
      },
    });

    // Watch LoanRepaid (partial repayments leave the loan active)
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     LOAN_MANAGER_ABI,
      eventName: 'LoanRepaid',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { loanId, closed } = (log as any).args;
          if (!closed) continue;
          await this.setLoanStatus(loanId, { status: 'repaid', repaid_at: new Date().toISOString() });
          logger.info({ loanId: loanId?.toString() }, 'Loan repaid synced');
        }
      },
    });

    // Watch LiquidationStarted (loan is now in a Dutch auction)
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     LOAN_MANAGER_ABI,
      eventName: 'LiquidationStarted',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { loanId } = (log as any).args;
          await this.setLoanStatus(loanId, { status: 'auction' });
          logger.info({ loanId: loanId?.toString() }, 'Loan auction started synced');
        }
      },
    });

    // Watch LoanLiquidated (auction settled)
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     LOAN_MANAGER_ABI,
      eventName: 'LoanLiquidated',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { loanId } = (log as any).args;
          await this.setLoanStatus(loanId, { status: 'liquidated', repaid_at: new Date().toISOString() });
          logger.info({ loanId: loanId?.toString() }, 'Loan liquidated synced');
        }
      },
    });

    // Watch LendingPool (ERC-4626) deposits
    this.client.watchContractEvent({
      address: this.lendingPool,
      abi: LENDING_POOL_EVENTS_ABI,
      eventName: 'Deposit',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { owner, assets, shares } = (log as any).args;
          await oracleQueue.add('lending-position-update', {
            type: 'DEPOSIT',
            user: owner!.toLowerCase(),
            amount: Number(assets) / 1e6,
            shares: shares!.toString(),
            txHash: log.transactionHash,
            timestamp: new Date().toISOString()
          });
          logger.info({ owner, assets: assets?.toString() }, 'Lending deposit queued');
        }
      }
    });

    // Watch LendingPool (ERC-4626) withdrawals
    this.client.watchContractEvent({
      address: this.lendingPool,
      abi: LENDING_POOL_EVENTS_ABI,
      eventName: 'Withdraw',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { owner, assets, shares } = (log as any).args;
          await oracleQueue.add('lending-position-update', {
            type: 'WITHDRAW',
            user: owner!.toLowerCase(),
            amount: Number(assets) / 1e6,
            shares: shares!.toString(),
            txHash: log.transactionHash,
            timestamp: new Date().toISOString()
          });
          logger.info({ owner, assets: assets?.toString() }, 'Lending withdrawal queued');
        }
      }
    });
  }
}
