import '@solana/wallet-adapter-react-ui/styles.css';
import SolanaProvider from './SolanaProvider.jsx';
import SolanaWalletCard from './SolanaWalletCard.jsx';

export default function SolanaWalletCardWithProvider() {
  return (
    <SolanaProvider>
      <SolanaWalletCard />
    </SolanaProvider>
  );
}
