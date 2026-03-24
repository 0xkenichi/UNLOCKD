import { createPublicClient, http, parseAbiItem, Log } from 'viem';
import { sepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';

const logger = pino({ name: 'EventListener' });

const LOAN_EVENTS = [
  parseAbiItem('event LoanOriginated(uint256 indexed loanId, address indexed borrower, uint256 streamId, uint256 borrowedUsdc, uint256 dpvAtOrigination, uint256 nftTokenId)'),
  parseAbiItem('event LoanRepaid(uint256 indexed loanId, address indexed repayer, uint256 principal, uint256 interest)'),
  parseAbiItem('event LoanSettled(uint256 indexed loanId, address indexed borrower, uint256 recoveredUsdc, bool fullRecovery)'),
] as const;

export class LoanEventListener {
  private client:   ReturnType<typeof createPublicClient>;
  private supabase: ReturnType<typeof createClient>;
  private loanManager: `0x${string}`;

  constructor(rpcUrl: string, supabaseUrl: string, supabaseKey: string, loanManager: string) {
    this.client      = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    this.supabase    = createClient(supabaseUrl, supabaseKey);
    this.loanManager = loanManager as `0x${string}`;
  }

  start(): void {
    logger.info('LoanEventListener started');

    // Watch LoanOriginated
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     [LOAN_EVENTS[0]],
      eventName: 'LoanOriginated',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { loanId, borrower, streamId, borrowedUsdc, dpvAtOrigination, nftTokenId } = (log as any).args;
          await this.supabase.from('loans').upsert({
            loan_id_onchain:  Number(loanId),
            chain_id:         11155111,
            borrower_wallet:  borrower!.toLowerCase(),
            stream_contract:  '',       // pull from tx data if needed
            stream_id:        Number(streamId),
            collateral_token: '',
            borrowed_usdc:    Number(borrowedUsdc!) / 1e6,
            dpv_at_origin:    (Number(dpvAtOrigination!) / 1e18).toString(),
            interest_rate_bps: 0,       // pull from contract read
            nft_token_id:     Number(nftTokenId),
            originated_at:    new Date().toISOString(),
            due_at:           new Date().toISOString(), // read from contract
            status:           'active',
          }, { onConflict: 'loan_id_onchain' });
          logger.info({ loanId: loanId?.toString(), borrower }, 'Loan originated synced');
        }
      },
    });

    // Watch LoanRepaid
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     [LOAN_EVENTS[1]],
      eventName: 'LoanRepaid',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { loanId } = (log as any).args;
          await this.supabase.from('loans')
            .update({ status: 'repaid', repaid_at: new Date().toISOString() })
            .eq('loan_id_onchain', Number(loanId));
          logger.info({ loanId: loanId?.toString() }, 'Loan repaid synced');
        }
      },
    });

    // Watch LoanSettled
    this.client.watchContractEvent({
      address: this.loanManager,
      abi:     [LOAN_EVENTS[2]],
      eventName: 'LoanSettled',
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          const { loanId } = (log as any).args;
          await this.supabase.from('loans')
            .update({ status: 'settled', repaid_at: new Date().toISOString() })
            .eq('loan_id_onchain', Number(loanId));
          logger.info({ loanId: loanId?.toString() }, 'Loan settled synced');
        }
      },
    });
  }
}
