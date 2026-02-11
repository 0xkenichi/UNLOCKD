import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import { createPool, fetchPools, updatePoolPreferences } from '../utils/api.js';
import { getContractAddress, lendingPoolAbi, usdcAbi } from '../utils/contracts.js';
import { formatValue, toUnits } from '../utils/format.js';

const DEFAULT_PREFS = {
  riskTier: 'balanced',
  maxLtvBps: 3500,
  interestBps: 900,
  minLoanUsd: 100,
  maxLoanUsd: 2500,
  unlockWindowDays: { min: 30, max: 720 },
  chains: ['base']
};

const chainOptions = [
  { label: 'Base', value: 'base' },
  { label: 'Solana', value: 'solana' },
  { label: 'Base + Solana (advisory)', value: 'both' }
];

export default function Lender() {
  const { address } = useAccount();
  const chainId = useChainId();
  const lendingPool = getContractAddress(chainId, 'lendingPool');
  const usdc = getContractAddress(chainId, 'usdc');
  const [pools, setPools] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState('');
  const [depositAmount, setDepositAmount] = useState('500');
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [selectedPoolId, setSelectedPoolId] = useState('');
  const [updateState, setUpdateState] = useState('idle');

  const [poolName, setPoolName] = useState('Vestra Pool');
  const [poolChain, setPoolChain] = useState('base');
  const [riskTier, setRiskTier] = useState(DEFAULT_PREFS.riskTier);
  const [maxLtvBps, setMaxLtvBps] = useState(DEFAULT_PREFS.maxLtvBps);
  const [interestBps, setInterestBps] = useState(DEFAULT_PREFS.interestBps);
  const [minLoanUsd, setMinLoanUsd] = useState(DEFAULT_PREFS.minLoanUsd);
  const [maxLoanUsd, setMaxLoanUsd] = useState(DEFAULT_PREFS.maxLoanUsd);
  const [unlockMin, setUnlockMin] = useState(DEFAULT_PREFS.unlockWindowDays.min);
  const [unlockMax, setUnlockMax] = useState(DEFAULT_PREFS.unlockWindowDays.max);
  const [accessType, setAccessType] = useState('open');
  const [premiumToken, setPremiumToken] = useState('');
  const [communityToken, setCommunityToken] = useState('');
  const [allowedTokenTypes, setAllowedTokenTypes] = useState('');
  const [vestCliffMin, setVestCliffMin] = useState('');
  const [vestCliffMax, setVestCliffMax] = useState('');
  const [vestDurationMin, setVestDurationMin] = useState('');
  const [vestDurationMax, setVestDurationMax] = useState('');
  const [poolDescription, setPoolDescription] = useState('');

  const ownerWallet = useMemo(() => address || '', [address]);
  const depositUnits = useMemo(() => toUnits(depositAmount, 6), [depositAmount]);
  const withdrawUnits = useMemo(() => toUnits(withdrawAmount, 6), [withdrawAmount]);

  const { data: usdcBalance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [address || '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(usdc && address) }
  });

  const { data: allowance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'allowance',
    args: [
      address || '0x0000000000000000000000000000000000000000',
      lendingPool || '0x0000000000000000000000000000000000000000'
    ],
    query: { enabled: Boolean(usdc && lendingPool && address) }
  });

  const { data: totalDeposits } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'totalDeposits',
    query: { enabled: Boolean(lendingPool) }
  });

  const { data: totalBorrowed } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'totalBorrowed',
    query: { enabled: Boolean(lendingPool) }
  });

  const { data: utilizationRate } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'utilizationRateBps',
    query: { enabled: Boolean(lendingPool) }
  });

  const { data: poolRate } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'getInterestRateBps',
    query: { enabled: Boolean(lendingPool) }
  });

  const {
    data: approveHash,
    writeContract: writeApprove,
    isPending: isApprovePending,
    error: approveError
  } = useWriteContract();
  const {
    data: depositHash,
    writeContract: writeDeposit,
    isPending: isDepositPending,
    error: depositError
  } = useWriteContract();
  const {
    data: withdrawHash,
    writeContract: writeWithdraw,
    isPending: isWithdrawPending,
    error: withdrawError
  } = useWriteContract();

  const { isLoading: approveMining } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: depositMining } = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: withdrawMining } = useWaitForTransactionReceipt({ hash: withdrawHash });

  const { data: walletDeposits } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'deposits',
    args: [address || '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(lendingPool && address) }
  });

  const loadPools = async () => {
    if (!ownerWallet) return;
    setIsLoading(true);
    try {
      const data = await fetchPools({ ownerWallet });
      setPools(data);
      setError('');
    } catch (err) {
      setError(err?.message || 'Unable to load pools.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPools();
  }, [ownerWallet]);

  useEffect(() => {
    const selected = pools.find((pool) => pool.id === selectedPoolId);
    if (!selected) return;
    setPoolName(selected.name || 'Vestra Pool');
    const preference = selected.preferences || {};
    setRiskTier(preference.riskTier || 'balanced');
    setMaxLtvBps(preference.maxLtvBps ?? DEFAULT_PREFS.maxLtvBps);
    setInterestBps(preference.interestBps ?? DEFAULT_PREFS.interestBps);
    setMinLoanUsd(preference.minLoanUsd ?? DEFAULT_PREFS.minLoanUsd);
    setMaxLoanUsd(preference.maxLoanUsd ?? DEFAULT_PREFS.maxLoanUsd);
    setUnlockMin(preference.unlockWindowDays?.min ?? DEFAULT_PREFS.unlockWindowDays.min);
    setUnlockMax(preference.unlockWindowDays?.max ?? DEFAULT_PREFS.unlockWindowDays.max);
    setAccessType(preference.accessType || 'open');
    setPremiumToken(preference.premiumToken || '');
    setCommunityToken(preference.communityToken || '');
    setAllowedTokenTypes((preference.allowedTokenTypes || []).join(', '));
    setVestCliffMin(preference.vestPreferences?.cliffMinDays ?? '');
    setVestCliffMax(preference.vestPreferences?.cliffMaxDays ?? '');
    setVestDurationMin(preference.vestPreferences?.durationMinDays ?? '');
    setVestDurationMax(preference.vestPreferences?.durationMaxDays ?? '');
    setPoolDescription(preference.description || '');
  }, [pools, selectedPoolId]);

  const handleCreatePool = async () => {
    setSaveState('saving');
    try {
      const chains =
        poolChain === 'both' ? ['base', 'solana'] : poolChain ? [poolChain] : [];
      const tokenTypes = allowedTokenTypes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        name: poolName.trim() || 'Vestra Pool',
        chain: poolChain === 'both' ? '' : poolChain,
        preferences: {
          riskTier,
          maxLtvBps: Number(maxLtvBps),
          interestBps: Number(interestBps),
          minLoanUsd: Number(minLoanUsd),
          maxLoanUsd: Number(maxLoanUsd),
          unlockWindowDays: {
            min: Number(unlockMin),
            max: Number(unlockMax)
          },
          chains,
          accessType,
          premiumToken: premiumToken.trim() || undefined,
          communityToken: communityToken.trim() || undefined,
          allowedTokenTypes: tokenTypes.length ? tokenTypes : undefined,
          vestPreferences:
            vestCliffMin || vestCliffMax || vestDurationMin || vestDurationMax
              ? {
                  cliffMinDays: vestCliffMin ? Number(vestCliffMin) : undefined,
                  cliffMaxDays: vestCliffMax ? Number(vestCliffMax) : undefined,
                  durationMinDays: vestDurationMin ? Number(vestDurationMin) : undefined,
                  durationMaxDays: vestDurationMax ? Number(vestDurationMax) : undefined
                }
              : undefined,
          description: poolDescription.trim() || undefined
        }
      };
      await createPool(payload);
      await loadPools();
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('idle');
      setError(err?.message || 'Unable to create pool.');
    }
  };

  const handleUpdatePool = async () => {
    if (!selectedPoolId) return;
    setUpdateState('saving');
    try {
      const chains =
        poolChain === 'both' ? ['base', 'solana'] : poolChain ? [poolChain] : [];
      const tokenTypes = allowedTokenTypes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        preferences: {
          riskTier,
          maxLtvBps: Number(maxLtvBps),
          interestBps: Number(interestBps),
          minLoanUsd: Number(minLoanUsd),
          maxLoanUsd: Number(maxLoanUsd),
          unlockWindowDays: {
            min: Number(unlockMin),
            max: Number(unlockMax)
          },
          chains,
          accessType,
          premiumToken: premiumToken.trim() || undefined,
          communityToken: communityToken.trim() || undefined,
          allowedTokenTypes: tokenTypes.length ? tokenTypes : undefined,
          vestPreferences:
            vestCliffMin || vestCliffMax || vestDurationMin || vestDurationMax
              ? {
                  cliffMinDays: vestCliffMin ? Number(vestCliffMin) : undefined,
                  cliffMaxDays: vestCliffMax ? Number(vestCliffMax) : undefined,
                  durationMinDays: vestDurationMin ? Number(vestDurationMin) : undefined,
                  durationMaxDays: vestDurationMax ? Number(vestDurationMax) : undefined
                }
              : undefined,
          description: poolDescription.trim() || undefined
        }
      };
      await updatePoolPreferences(selectedPoolId, payload);
      await loadPools();
      setUpdateState('saved');
      setTimeout(() => setUpdateState('idle'), 1500);
    } catch (err) {
      setUpdateState('idle');
      setError(err?.message || 'Unable to update pool.');
    }
  };

  const handleApprove = () => {
    if (!usdc || !lendingPool || !depositUnits) return;
    writeApprove({
      address: usdc,
      abi: usdcAbi,
      functionName: 'approve',
      args: [lendingPool, depositUnits]
    });
  };

  const handleDeposit = () => {
    if (!lendingPool || !depositUnits) return;
    writeDeposit({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'deposit',
      args: [depositUnits]
    });
  };

  const handleWithdraw = () => {
    if (!lendingPool || !withdrawUnits) return;
    writeWithdraw({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'withdraw',
      args: [withdrawUnits]
    });
  };

  const allowanceEnough =
    allowance !== null && allowance !== undefined && depositUnits
      ? allowance >= depositUnits
      : false;
  const withdrawEnough =
    walletDeposits !== null && walletDeposits !== undefined && withdrawUnits
      ? walletDeposits >= withdrawUnits
      : false;

  return (
    <section className="page">
      <PageIllustration variant="lender" />
      <div className="page-header">
        <div>
          <h1>Lender Pools</h1>
          <p className="muted">
            Configure liquidity pools and matching preferences. Preferences are advisory for
            this MVP and do not custody funds.
          </p>
        </div>
        <EssentialsPanel />
      </div>

      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Create a Pool</h3>
              <div className="section-subtitle">Tune risk and matching rules for borrowers.</div>
            </div>
            <span className="tag">Advisory</span>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="form-grid">
            <label className="form-field">
              Existing pool
              <select
                className="form-select"
                value={selectedPoolId}
                onChange={(event) => setSelectedPoolId(event.target.value)}
              >
                <option value="">New pool</option>
                {pools.map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name || pool.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Pool name
              <input
                className="form-input"
                value={poolName}
                onChange={(event) => setPoolName(event.target.value)}
              />
            </label>
            <label className="form-field">
              Chain focus
              <select
                className="form-select"
                value={poolChain}
                onChange={(event) => setPoolChain(event.target.value)}
              >
                {chainOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Risk tier
              <select
                className="form-select"
                value={riskTier}
                onChange={(event) => setRiskTier(event.target.value)}
              >
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>
            <label className="form-field">
              Max LTV (bps)
              <input
                className="form-input"
                value={maxLtvBps}
                onChange={(event) => setMaxLtvBps(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              Target interest (bps)
              <input
                className="form-input"
                value={interestBps}
                onChange={(event) => setInterestBps(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              Min loan (USD)
              <input
                className="form-input"
                value={minLoanUsd}
                onChange={(event) => setMinLoanUsd(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              Max loan (USD)
              <input
                className="form-input"
                value={maxLoanUsd}
                onChange={(event) => setMaxLoanUsd(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              Unlock window min (days)
              <input
                className="form-input"
                value={unlockMin}
                onChange={(event) => setUnlockMin(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              Unlock window max (days)
              <input
                className="form-input"
                value={unlockMax}
                onChange={(event) => setUnlockMax(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              Access type
              <select
                className="form-select"
                value={accessType}
                onChange={(event) => setAccessType(event.target.value)}
              >
                <option value="open">Open (all borrowers)</option>
                <option value="premium">Premium (requires token)</option>
                <option value="community">Community (requires community token)</option>
              </select>
            </label>
            {accessType === 'premium' && (
              <label className="form-field">
                Premium token address
                <input
                  className="form-input"
                  value={premiumToken}
                  onChange={(event) => setPremiumToken(event.target.value)}
                  placeholder="0x..."
                />
              </label>
            )}
            {accessType === 'community' && (
              <label className="form-field">
                Community token address
                <input
                  className="form-input"
                  value={communityToken}
                  onChange={(event) => setCommunityToken(event.target.value)}
                  placeholder="0x..."
                />
              </label>
            )}
            <label className="form-field">
              Allowed token types (comma-separated)
              <input
                className="form-input"
                value={allowedTokenTypes}
                onChange={(event) => setAllowedTokenTypes(event.target.value)}
                placeholder="VEST, USDC, project_tokens"
              />
            </label>
            <label className="form-field">
              Vest cliff min (days)
              <input
                className="form-input"
                value={vestCliffMin}
                onChange={(event) => setVestCliffMin(event.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </label>
            <label className="form-field">
              Vest cliff max (days)
              <input
                className="form-input"
                value={vestCliffMax}
                onChange={(event) => setVestCliffMax(event.target.value)}
                inputMode="numeric"
                placeholder="365"
              />
            </label>
            <label className="form-field">
              Vest duration min (days)
              <input
                className="form-input"
                value={vestDurationMin}
                onChange={(event) => setVestDurationMin(event.target.value)}
                inputMode="numeric"
                placeholder="30"
              />
            </label>
            <label className="form-field">
              Vest duration max (days)
              <input
                className="form-input"
                value={vestDurationMax}
                onChange={(event) => setVestDurationMax(event.target.value)}
                inputMode="numeric"
                placeholder="720"
              />
            </label>
            <label className="form-field">
              Pool description
              <input
                className="form-input"
                value={poolDescription}
                onChange={(event) => setPoolDescription(event.target.value)}
                placeholder="Lending for early-stage projects..."
              />
            </label>
          </div>
          <div className="inline-actions">
            <button className="button" onClick={handleCreatePool} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving...' : 'Create Pool'}
            </button>
            <button
              className="button ghost"
              onClick={handleUpdatePool}
              disabled={!selectedPoolId || updateState === 'saving'}
            >
              {updateState === 'saving' ? 'Updating...' : 'Update Preferences'}
            </button>
            <div className="muted">
              Matching uses pool preferences; funds remain under your custody.
            </div>
          </div>
        </div>

        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Your Pools</h3>
              <div className="section-subtitle">Active pools linked to your wallet.</div>
            </div>
            <span className="tag">{isLoading ? 'Loading' : `${pools.length} pools`}</span>
          </div>
          {!ownerWallet && <div className="muted">Connect a wallet to view pools.</div>}
          {ownerWallet && !isLoading && !pools.length && (
            <div className="muted">No pools yet. Create one to start matching.</div>
          )}
          {Boolean(pools.length) && (
            <div className="data-table">
              <div className="table-row header">
                <div>Name</div>
                <div>Chain</div>
                <div>Risk</div>
                <div>Max LTV</div>
              </div>
              {pools.map((pool) => (
                <div key={pool.id} className="table-row">
                  <div>{pool.name}</div>
                  <div>{pool.chain || 'multi-chain'}</div>
                  <div>{pool.preferences?.riskTier || 'balanced'}</div>
                  <div>{pool.preferences?.maxLtvBps || '--'}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card-list">
            <div className="pill">Base settlement live; Solana offers are advisory.</div>
            <div className="pill">Pool preferences are enforced offchain for this MVP.</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Deposit Liquidity</h3>
              <div className="section-subtitle">USDC is deposited into the protocol pool.</div>
            </div>
            <span className="tag">Onchain</span>
          </div>
          {(approveError || depositError || withdrawError) && (
            <div className="error-banner">
              {approveError?.message || depositError?.message || withdrawError?.message}
            </div>
          )}
          <div className="form-grid">
            <label className="form-field">
              Deposit amount (USDC)
              <input
                className="form-input"
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="form-field">
              Wallet balance
              <div className="form-value">{formatValue(usdcBalance, 6)} USDC</div>
            </label>
            <label className="form-field">
              Your pool deposits
              <div className="form-value">{formatValue(walletDeposits, 6)} USDC</div>
            </label>
            <label className="form-field">
              Withdraw amount (USDC)
              <input
                className="form-input"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                inputMode="decimal"
              />
            </label>
          </div>
          <div className="inline-actions">
            <button
              className="button ghost"
              type="button"
              onClick={handleApprove}
              disabled={!depositUnits || isApprovePending || approveMining}
            >
              {approveMining || isApprovePending ? 'Approving...' : 'Approve'}
            </button>
            <button
              className="button"
              type="button"
              onClick={handleDeposit}
              disabled={!depositUnits || !allowanceEnough || isDepositPending || depositMining}
            >
              {depositMining || isDepositPending ? 'Depositing...' : 'Deposit'}
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={handleWithdraw}
              disabled={!withdrawUnits || !withdrawEnough || isWithdrawPending || withdrawMining}
            >
              {withdrawMining || isWithdrawPending ? 'Withdrawing...' : 'Withdraw'}
            </button>
            <div className="muted">
              {allowanceEnough ? 'Allowance ready.' : 'Approve USDC before depositing.'}
            </div>
          </div>
        </div>

        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Pool Metrics</h3>
              <div className="section-subtitle">Live metrics from the lending pool contract.</div>
            </div>
            <span className="tag">Live</span>
          </div>
          <div className="card-list">
            <div className="pill">Total deposits: {formatValue(totalDeposits, 6)} USDC</div>
            <div className="pill">Total borrowed: {formatValue(totalBorrowed, 6)} USDC</div>
            <div className="pill">
              Utilization: {utilizationRate ? `${Number(utilizationRate) / 100}%` : '--'}
            </div>
            <div className="pill">
              Current pool rate: {poolRate ? `${Number(poolRate)} bps` : '--'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
