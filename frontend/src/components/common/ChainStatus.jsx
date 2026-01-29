import { useChainId } from 'wagmi';
import { mainnet, sepolia, base, baseSepolia, avalancheFuji } from 'viem/chains';

const chainMap = new Map([
  [mainnet.id, mainnet],
  [sepolia.id, sepolia],
  [base.id, base],
  [baseSepolia.id, baseSepolia],
  [avalancheFuji.id, avalancheFuji]
]);

export default function ChainStatus() {
  const chainId = useChainId();
  const chain = chainMap.get(chainId);

  return (
    <div className="chain-status">
      <div className="pill">Network</div>
      <div className="chain-name">
        {chain ? chain.name : `Chain ${chainId || 'unknown'}`}
      </div>
      <div className="muted">Auto-switch supported</div>
    </div>
  );
}
