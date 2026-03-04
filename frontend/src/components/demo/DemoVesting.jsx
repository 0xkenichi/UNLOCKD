import React, { useState } from 'react';
import { parseUnits } from 'viem';

export default function DemoVesting({ onComplete }) {
    const [tokenName, setTokenName] = useState('MyProjectToken');
    const [allocation, setAllocation] = useState('1000000');
    const [duration, setDuration] = useState('12');
    const [isMinting, setIsMinting] = useState(false);

    const handleCreateVesting = async () => {
        setIsMinting(true);
        // Simulate smart contract interactions for the demo playground
        setTimeout(() => {
            setIsMinting(false);
            onComplete({
                tokenName,
                allocation: parseUnits(allocation, 6).toString(),
                duration,
                address: '0xabc123...mockVesting'
            });
        }, 2000);
    };

    return (
        <div className="demo-vesting-panel">
            <h2>Step 2: Create Vested Token</h2>
            <p>Configure your mock project's tokenomics to mint a simulated vested contract.</p>

            <div className="form-group">
                <label>Token Name</label>
                <input
                    type="text"
                    value={tokenName}
                    onChange={e => setTokenName(e.target.value)}
                    className="input-field"
                />
            </div>

            <div className="form-group">
                <label>Total Allocation (Tokens)</label>
                <input
                    type="number"
                    value={allocation}
                    onChange={e => setAllocation(e.target.value)}
                    className="input-field"
                />
            </div>

            <div className="form-group">
                <label>Vesting Duration (Months)</label>
                <input
                    type="number"
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    className="input-field"
                />
            </div>

            <button
                className="button primary"
                onClick={handleCreateVesting}
                disabled={isMinting}
            >
                {isMinting ? 'Deploying to network...' : 'Mint Vested Contract'}
            </button>
        </div>
    );
}
