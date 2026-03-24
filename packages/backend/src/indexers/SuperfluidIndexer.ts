import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { ddpvService } from './dDPVService';

// CFAv1 Address on Base
const CFA_V1_FORWARDER = process.env.CFA_V1_FORWARDER || '0xcfA132E353cB4E398080B9700609bb008eceB125';

export class SuperfluidIndexer {
  private client;

  constructor() {
    this.client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL)
    });
  }

  /**
   * Starts listening to Superfluid Constant Flow Agreement stream creations.
   */
  public async startIndexer() {
    console.log('[SuperfluidIndexer] Starting to listen for CFAv1 FlowCreated events on Base...');

    this.client.watchEvent({
      address: CFA_V1_FORWARDER as any,
      event: parseAbiItem('event FlowCreated(address indexed token, address indexed sender, address indexed receiver, int96 flowRate, int256 totalSenderFlowRate, int256 totalReceiverFlowRate, bytes userData)'),
      onLogs: (logs) => this.processFlowEvents(logs)
    });
  }

  private async processFlowEvents(logs: any[]) {
    for (const log of logs) {
      try {
        const { token, receiver, flowRate } = log.args;
        console.log(`[SuperfluidIndexer] Detected new stream. Token: ${token}, Receiver: ${receiver}, Rate: ${flowRate}`);

        // Trigger dDPV Service for the new stream context
        // Treat as a 30 day LINEAR stream for valuation projection
        const thirtyDaysAmount = BigInt(flowRate) * BigInt(30 * 86400);

        await ddpvService.scheduleUpdate({
          token: token,
          chainId: base.id,
          quantity: thirtyDaysAmount,
          unlockTime: Math.floor(Date.now() / 1000) + (30 * 86400),
          schedule: 'LINEAR',
          loanDurationSecs: 30 * 86400,
        });

      } catch (err: any) {
        console.error(`[SuperfluidIndexer] Failed to process event log:`, err.message);
      }
    }
  }
}

export const superfluidIndexer = new SuperfluidIndexer();
