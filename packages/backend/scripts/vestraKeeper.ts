import { createClient } from '@supabase/supabase-js';
import { createPublicClient, createWalletClient, http, parseAbiItem, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from root or current dir
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const KEEPER_KEY = (process.env.EVM_RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY) as `0x${string}`;
const LOAN_MANAGER = process.env.SEPOLIA_LOAN_MANAGER as `0x${string}`;
const RPC_URL = process.env.SEPOLIA_HTTP_RPC!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const account = privateKeyToAccount(KEEPER_KEY);

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(RPC_URL),
});

const LOAN_MANAGER_ABI = [
  {
    name: 'keeperRepay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'quoteRepayment',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

async function runKeeper() {
  console.log(`[VestraKeeper] Starting pulse... Keeper: ${account.address}`);

  // 1. Fetch loans with Vestra Pay enabled that are ACTIVE
  const { data: loans, error } = await supabase
    .from('loans')
    .select('*')
    .eq('vestra_pay_enabled', true)
    .eq('status', 'ACTIVE');

  if (error) {
    console.error('[VestraKeeper] Supabase error:', error);
    return;
  }

  console.log(`[VestraKeeper] Found ${loans?.length || 0} candidate loans.`);

  for (const loan of (loans || [])) {
    const unlockTime = new Date(loan.unlock_time).getTime();
    const now = Date.now();
    const buffer = 24 * 60 * 60 * 1000; // 24h buffer

    // If we are within 24h of unlock or past it
    if (now >= unlockTime - buffer) {
      try {
        console.log(`[VestraKeeper] Processing Loan ${loan.token_id}...`);

        // 2. Quote current debt
        const totalDue = await publicClient.readContract({
          address: LOAN_MANAGER,
          abi: LOAN_MANAGER_ABI,
          functionName: 'quoteRepayment',
          args: [BigInt(loan.token_id)]
        });

        console.log(`[VestraKeeper] Total due: ${formatUnits(totalDue, 6)} USDC. Sending settlement...`);

        // 3. Trigger keeperRepay
        // Note: In reality, we'd check if the borrower has authorized enough USDC or if the protocol
        // is pulling from a specific vault. The user's contract logic expects the borrower's funds
        // to be available if keeper handles it, or protocol liquidity.
        const hash = await walletClient.writeContract({
          address: LOAN_MANAGER,
          abi: LOAN_MANAGER_ABI,
          functionName: 'keeperRepay',
          args: [BigInt(loan.token_id), totalDue]
        });

        console.log(`[VestraKeeper] Multi-chain settlement hash: ${hash}`);
      } catch (err) {
        console.error(`[VestraKeeper] Failed settlement for ${loan.token_id}:`, err);
      }
    }
  }

  console.log('[VestraKeeper] Pulse complete.');
}

// Run immediately, then every 1 hour (simulated for demo)
runKeeper().catch(console.error);
