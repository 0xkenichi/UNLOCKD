import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import { fetchCommunityPool, fetchCommunityPools } from '../utils/api.js';
import {
  getContractAddress,
  lendingPoolAbi,
  usdcAbi
} from '../utils/contracts.js';
import { formatValue, toUnits } from '../utils/format.js';

const STATE_BADGE = {
  FUNDRAISING: 'tag',
  ACTIVE: 'tag success',
  REFUNDING: 'tag warn',
  CLOSED: 'tag'
};

export default function CommunityPools() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const lendingPool = getContractAddress(chainId, 'lendingPool');
  const usdc = getContractAddress(chainId, 'usdc');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPoolDetails, setSelectedPoolDetails] = useState(null);
  const [error, setError] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState('');

  const [createName, setCreateName] = useState('Community Builders Fund');
  const [createTarget, setCreateTarget] = useState('2000');
  const [createMax, setCreateMax] = useState('2500');
  const [createDeadlineHours, setCreateDeadlineHours] = useState('24');
  const [createBuildingWeight, setCreateBuildingWeight] = useState(true);

  const [approveAmount, setApproveAmount] = useState('1000');
  const [contributionAmount, setContributionAmount] = useState('500');
  const [buildingUnits, setBuildingUnits] = useState('100');
  const [rewardAmount, setRewardAmount] = useState('100');

  const approveUnits = useMemo(() => toUnits(approveAmount, 6), [approveAmount]);
  const contributionUnits = useMemo(() => toUnits(contributionAmount, 6), [contributionAmount]);
  const rewardUnits = useMemo(() => toUnits(rewardAmount, 6), [rewardAmount]);

  const {
    data: approveHash,
    writeContract: writeApprove,
    isPending: approvePending,
    error: approveError
  } = useWriteContract();
  const {
    data: actionHash,
    writeContract: writeAction,
    isPending: actionPending,
    error: actionError
  } = useWriteContract();

  const { isLoading: approveMining } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: actionMining, isSuccess: actionConfirmed } = useWaitForTransactionReceipt({
    hash: actionHash
  });

  const loadCommunityPools = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCommunityPools({ walletAddress: address });
      setItems(data);
      if (!selectedPoolId && data.length) {
        setSelectedPoolId(String(data[0].poolId));
      }
    } catch (err) {
      setError(err?.message || 'Unable to load community pools.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommunityPools();
  }, [address]);

  useEffect(() => {
    if (actionConfirmed) {
      loadCommunityPools();
    }
  }, [actionConfirmed]);

  const selectedPool = items.find((item) => String(item.poolId) === selectedPoolId) || null;
  const selectedPoolView = selectedPoolDetails || selectedPool;

  useEffect(() => {
    let active = true;
    const loadSelectedPoolDetails = async () => {
      if (!selectedPoolId) {
        setSelectedPoolDetails(null);
        return;
      }
      try {
        const detailed = await fetchCommunityPool(selectedPoolId, address);
        if (!active) return;
        setSelectedPoolDetails(detailed || null);
      } catch {
        if (!active) return;
        setSelectedPoolDetails(null);
      }
    };
    loadSelectedPoolDetails();
    return () => {
      active = false;
    };
  }, [selectedPoolId, address, actionConfirmed]);

  const handleApprove = () => {
    if (!address || !usdc || !lendingPool || !approveUnits) return;
    writeApprove({
      address: usdc,
      abi: usdcAbi,
      functionName: 'approve',
      args: [lendingPool, approveUnits]
    });
  };

  const handleCreate = () => {
    if (!lendingPool) return;
    const deadlineHours = Number(createDeadlineHours || 0);
    const deadline = Math.floor(Date.now() / 1000) + Math.max(1, deadlineHours) * 3600;
    writeAction({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'createCommunityPool',
      args: [
        createName.trim(),
        toUnits(createTarget, 6),
        toUnits(createMax, 6),
        BigInt(deadline),
        createBuildingWeight
      ]
    });
  };

  const handleContribute = () => {
    if (!selectedPoolId || !contributionUnits) return;
    writeAction({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'contributeToCommunityPool',
      args: [
        BigInt(selectedPoolId),
        contributionUnits,
        BigInt(Math.max(0, Number(buildingUnits || 0)))
      ]
    });
  };

  const handleFundRewards = () => {
    if (!selectedPoolId || !rewardUnits) return;
    writeAction({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'fundCommunityPoolRewards',
      args: [BigInt(selectedPoolId), rewardUnits]
    });
  };

  const handleClaimRewards = () => {
    if (!selectedPoolId) return;
    writeAction({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'claimCommunityPoolRewards',
      args: [BigInt(selectedPoolId)]
    });
  };

  const handleClaimRefund = () => {
    if (!selectedPoolId) return;
    writeAction({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'claimCommunityPoolRefund',
      args: [BigInt(selectedPoolId)]
    });
  };

  const handleClose = () => {
    if (!selectedPoolId) return;
    writeAction({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'closeCommunityPool',
      args: [BigInt(selectedPoolId)]
    });
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Community Pools</h1>
          <p className="muted">
            Create shared fundraising pools, activate lending at target, and share rewards by
            building size or contribution size.
          </p>
          <div className="inline-actions" style={{ marginTop: 10 }}>
            <button className="button" type="button" onClick={() => navigate('/features')}>
              How it works
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/lender')}>
              Lender view
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=technical-spec')}>
              Technical spec
            </button>
          </div>
        </div>
      </div>

      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Community pool lifecycle</h3>
            <div className="section-subtitle">From campaign launch to funding, rewards, and closeout</div>
          </div>
        </div>
        <div className="card-list">
          <div className="pill">1. Create pool with target, cap, deadline, and reward model</div>
          <div className="pill">2. Approve and contribute USDC from participating wallets</div>
          <div className="pill">3. Activate lending once thresholds are reached</div>
          <div className="pill">4. Fund rewards, distribute claims, or process refunds if needed</div>
        </div>
      </div>

      {(error || approveError || actionError) && (
        <div className="error-banner">
          {error || approveError?.message || actionError?.message}
        </div>
      )}

      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <h3 className="section-title">Create Community Pool</h3>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Name
              <input
                className="form-input"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </label>
            <label className="form-field">
              Target (USDC)
              <input
                className="form-input"
                value={createTarget}
                onChange={(event) => setCreateTarget(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="form-field">
              Max cap (USDC)
              <input
                className="form-input"
                value={createMax}
                onChange={(event) => setCreateMax(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="form-field">
              Deadline (hours from now)
              <input
                className="form-input"
                value={createDeadlineHours}
                onChange={(event) => setCreateDeadlineHours(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              Rewards weighted by building size
              <input
                type="checkbox"
                className="form-checkbox"
                checked={createBuildingWeight}
                onChange={(event) => setCreateBuildingWeight(event.target.checked)}
              />
            </label>
          </div>
          <div className="inline-actions">
            <button
              className="button"
              type="button"
              onClick={handleCreate}
              disabled={actionPending || actionMining}
            >
              {actionPending || actionMining ? 'Creating...' : 'Create Pool'}
            </button>
            <button className="button ghost" type="button" onClick={loadCommunityPools}>
              Refresh
            </button>
          </div>
        </div>

        <div className="holo-card">
          <div className="section-head">
            <h3 className="section-title">Approve USDC</h3>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Allowance amount (USDC)
              <input
                className="form-input"
                value={approveAmount}
                onChange={(event) => setApproveAmount(event.target.value)}
                inputMode="decimal"
              />
            </label>
          </div>
          <div className="inline-actions">
            <button
              className="button ghost"
              type="button"
              onClick={handleApprove}
              disabled={approvePending || approveMining || !approveUnits}
            >
              {approvePending || approveMining ? 'Approving...' : 'Approve Pool Contract'}
            </button>
          </div>
          <p className="muted small">
            Contribute and reward-funding actions pull USDC using `transferFrom`, so approve first.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <h3 className="section-title">Pools</h3>
            <span className="tag">{loading ? 'Loading' : `${items.length} pools`}</span>
          </div>
          {!items.length && <p className="muted">No community pools found yet.</p>}
          {Boolean(items.length) && (
            <div className="data-table">
              <div className="table-row header">
                <div>Pool</div>
                <div>State</div>
                <div>Contributed</div>
                <div>Target</div>
              </div>
              {items.map((item) => (
                <div
                  key={item.poolId}
                  className="table-row"
                  onClick={() => setSelectedPoolId(String(item.poolId))}
                  style={{
                    cursor: 'pointer',
                    background:
                      String(item.poolId) === selectedPoolId ? 'rgba(88, 166, 255, 0.08)' : ''
                  }}
                >
                  <div data-label="Pool">
                    #{item.poolId} {item.name || 'Untitled'}
                  </div>
                  <div data-label="State">
                    <span className={STATE_BADGE[item.stateLabel] || 'tag'}>{item.stateLabel}</span>
                  </div>
                  <div data-label="Contributed">{formatValue(item.totalContributed, 6)} USDC</div>
                  <div data-label="Target">{formatValue(item.targetAmount, 6)} USDC</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="holo-card">
          <div className="section-head">
            <h3 className="section-title">Selected Pool Actions</h3>
            <span className="tag">{selectedPoolView ? `#${selectedPoolView.poolId}` : 'None'}</span>
          </div>
          {!selectedPoolView && <p className="muted">Select a pool from the table.</p>}
          {selectedPoolView && (
            <>
              <div className="card-list">
                <div className="pill">
                  Contribution: {formatValue(selectedPoolView.totalContributed, 6)} /{' '}
                  {formatValue(selectedPoolView.targetAmount, 6)} USDC
                </div>
                <div className="pill">
                  Reward model:{' '}
                  {selectedPoolView.rewardsByBuildingSize ? 'Building-size weighted' : 'Capital weighted'}
                </div>
                <div className="pill">
                  Rewards funded: {formatValue(selectedPoolView.totalRewardFunded, 6)} USDC
                </div>
                <div className="pill">
                  Your pending rewards:{' '}
                  {selectedPoolView.pendingRewards == null
                    ? 'Connect wallet'
                    : `${formatValue(selectedPoolView.pendingRewards, 6)} USDC`}
                </div>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  Contribution (USDC)
                  <input
                    className="form-input"
                    value={contributionAmount}
                    onChange={(event) => setContributionAmount(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="form-field">
                  Building units
                  <input
                    className="form-input"
                    value={buildingUnits}
                    onChange={(event) => setBuildingUnits(event.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label className="form-field">
                  Reward funding (USDC)
                  <input
                    className="form-input"
                    value={rewardAmount}
                    onChange={(event) => setRewardAmount(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
              <div className="inline-actions">
                <button
                  className="button"
                  type="button"
                  onClick={handleContribute}
                  disabled={actionPending || actionMining || !contributionUnits}
                >
                  Contribute
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={handleFundRewards}
                  disabled={actionPending || actionMining || !rewardUnits}
                >
                  Fund Rewards
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={handleClaimRewards}
                  disabled={actionPending || actionMining}
                >
                  Claim Rewards
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={handleClaimRefund}
                  disabled={actionPending || actionMining}
                >
                  Claim Refund
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={handleClose}
                  disabled={actionPending || actionMining}
                >
                  Close Pool
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
