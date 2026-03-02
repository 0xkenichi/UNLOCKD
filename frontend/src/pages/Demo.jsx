import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAccount, useChainId, useReadContracts } from 'wagmi';
import demoConfig from '../config/demoConfig.json';
import { vestingWalletAbi } from '../utils/contracts.js';

function ScenarioCard({ title, description, address, tag }) {
    const navigate = useNavigate();

    const { data: metrics } = useReadContracts({
        contracts: address ? [
            { address, abi: vestingWalletAbi, functionName: 'totalAllocation' },
            { address, abi: vestingWalletAbi, functionName: 'start' },
            { address, abi: vestingWalletAbi, functionName: 'duration' }
        ] : [],
        query: { enabled: Boolean(address) }
    });

    const totalAllocation = metrics?.[0]?.status === 'success' ? Number(metrics[0].result) / 1e18 : 0;
    const start = metrics?.[1]?.status === 'success' ? Number(metrics[1].result) : 0;
    const duration = metrics?.[2]?.status === 'success' ? Number(metrics[2].result) : 0;

    const now = Math.floor(Date.now() / 1000);
    const isStarted = now > start;
    const isFinished = now > start + duration;

    const handleBorrow = () => {
        navigate('/borrow', {
            state: {
                prefill: {
                    vestingContract: address
                }
            }
        });
    };

    return (
        <div className="holo-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="section-head" style={{ marginBottom: '16px' }}>
                <div>
                    <h3 className="section-title">{title}</h3>
                    <div className="section-subtitle">{description}</div>
                </div>
                {tag && <span className={`tag ${tag.type}`}>{tag.text}</span>}
            </div>

            <div className="data-table" style={{ flexGrow: 1, marginBottom: '20px' }}>
                <div className="table-row">
                    <div className="muted">Contract</div>
                    <div>{address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Loading...'}</div>
                </div>
                <div className="table-row">
                    <div className="muted">Total Allocation</div>
                    <div>{totalAllocation.toLocaleString()} MPT</div>
                </div>
                <div className="table-row">
                    <div className="muted">Status</div>
                    <div>{isFinished ? 'Fully Vested' : isStarted ? 'Vesting Active' : 'Not Started'}</div>
                </div>
                <div className="table-row">
                    <div className="muted">Duration</div>
                    <div>{duration ? `${Math.round(duration / 86400 / 30)} months` : '--'}</div>
                </div>
            </div>

            <button className="button" style={{ width: '100%' }} onClick={handleBorrow}>
                Borrow against this position
            </button>
        </div>
    );
}

export default function Demo() {
    const { address } = useAccount();
    const chainId = useChainId();
    const [config, setConfig] = useState(null);

    useEffect(() => {
        if (demoConfig) {
            setConfig(demoConfig);
        }
    }, []);

    if (!config) {
        return (
            <div className="page-minimal">
                <div className="holo-card">
                    <div className="loading-row"><div className="spinner" /></div>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            className="stack page-minimal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
        >
            <div className="page-header">
                <h1 className="page-title holo-glow">Vesting Credit Demo</h1>
                <p className="page-subtitle">Experience three typical vesting scenarios and see how Vestra unlocks liquidity.</p>
            </div>

            <div className="holo-card">
                <h3 className="section-title">Demo Configuration</h3>
                <p className="muted" style={{ marginTop: '8px' }}>
                    This environment is pre-configured with mock project tokens (MPT) and mock USDC liquidity.
                    Three standard vesting contracts have been deployed on-chain for the demo borrower wallet.
                    You can borrow against them directly below.
                </p>

                <div className="card-list" style={{ marginTop: '16px' }}>
                    <div className="pill">Demo Borrower: {config.demoBorrower.substring(0, 8)}...</div>
                    <div className="pill">Lending Pool Active</div>
                    <div className="pill">Oracle Configured @ $2.00/MPT</div>
                </div>

                {address?.toLowerCase() !== config.demoBorrower.toLowerCase() && (
                    <div className="error-banner" style={{ marginTop: '16px' }}>
                        Warning: You are currently connected with {address?.substring(0, 6)}... but the demo wallets were minted for {config.demoBorrower.substring(0, 6)}... Please connect with the demo account to borrow against these positions natively.
                    </div>
                )}
            </div>

            <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginTop: '24px' }}>
                <ScenarioCard
                    title="Scenario 1: Not Live Yet"
                    description="A typical pre-TGE position."
                    address={config.scenarios?.notLive}
                    tag={{ text: 'Future', type: 'warning' }}
                />
                <ScenarioCard
                    title="Scenario 2: Currently Live"
                    description="In the middle of active vesting."
                    address={config.scenarios?.liveVesting}
                    tag={{ text: 'Active', type: 'success' }}
                />
                <ScenarioCard
                    title="Scenario 3: Custom Timeline"
                    description="A long-term 4-year team vesting schedule."
                    address={config.scenarios?.customVesting}
                    tag={{ text: 'Long-term', type: 'danger' }}
                />
            </div>

        </motion.div>
    );
}
