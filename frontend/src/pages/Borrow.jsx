import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import BorrowWizard from '../components/borrow/BorrowWizard.jsx';
import FaucetCard from '../components/borrow/FaucetCard.jsx';
import BorrowActions from '../components/borrow/BorrowActions.jsx';
import TokenAssessment from '../components/borrow/TokenAssessment.jsx';
import ValuationForm from '../components/borrow/ValuationForm.jsx';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import FundWallet from '../components/common/FundWallet.jsx';
import { generateRiskPaths } from '../utils/riskPaths.js';
import { requestMatchQuote, fetchPoolsBrowse } from '../utils/api.js';

const ValuationPreview3D = lazy(() =>
  import('../components/borrow/ValuationPreview3D.jsx')
);

export default function Borrow() {
  const { address } = useAccount();
  const chainId = useChainId();
  const chainName = [8453, 84532].includes(chainId) ? 'base' : 'base';
  const [valuationState, setValuationState] = useState({
    pv: 0n,
    ltvBps: 0n
  });
  const [vestingDetails, setVestingDetails] = useState(null);
  const [assessment, setAssessment] = useState({
    maxLoan: 0,
    coverageP1: 0,
    coverageP5: 0,
    adjustedPrice: 0,
    haircut: 0
  });
  const [fundingStatus, setFundingStatus] = useState(null);
  const [matchOffers, setMatchOffers] = useState([]);
  const [matchError, setMatchError] = useState('');
  const [matchLoading, setMatchLoading] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [browsePools, setBrowsePools] = useState([]);
  const [browseFilter, setBrowseFilter] = useState('all');

  const coverageP5 = Number(assessment.coverageP5 || 0);
  const riskLabel =
    coverageP5 > 0
      ? coverageP5 >= 1.2
        ? 'Low Risk'
        : coverageP5 >= 1
          ? 'Moderate Risk'
          : 'High Risk'
      : 'Risk Pending';
  const riskTagClass =
    coverageP5 > 0 ? (coverageP5 >= 1.2 ? 'success' : 'warn') : '';

  const simPaths = useMemo(
    () =>
      generateRiskPaths({
        pv: Number(valuationState.pv),
        ltvBps: Number(valuationState.ltvBps)
      }),
    [valuationState]
  );

  const matchKey = `${vestingDetails?.verified ? '1' : '0'}:${vestingDetails?.collateralId || ''}:${assessment.maxLoan || 0}:${address || ''}`;

  useEffect(() => {
    let active = true;
    const loadOffers = async () => {
      const collateralId = vestingDetails?.collateralId;
      const desiredAmountUsd = Number(assessment.maxLoan || 0);
      if (!vestingDetails?.verified || !collateralId || desiredAmountUsd <= 0) {
        if (active) {
          setMatchOffers([]);
          setSelectedOffer(null);
          setMatchError('');
        }
        return;
      }
      setMatchLoading(true);
      try {
        const data = await requestMatchQuote({
          chain: chainName,
          desiredAmountUsd,
          collateralId: String(collateralId),
          borrowerWallet: address || undefined
        });
        if (!active) return;
        const offers = data?.offers || [];
        setMatchOffers(offers);
        setMatchError('');
        if (!selectedOffer && offers.length) {
          const firstAccessible = offers.find((o) => o.canAccess);
          setSelectedOffer(firstAccessible || offers[0]);
        }
      } catch (error) {
        if (!active) return;
        setMatchError(error?.message || 'Unable to fetch matching offers.');
        setMatchOffers([]);
      } finally {
        if (active) {
          setMatchLoading(false);
        }
      }
    };
    loadOffers();
    return () => {
      active = false;
    };
  }, [matchKey]);

  const offerBorrowUsd =
    selectedOffer && selectedOffer.canAccess
      ? Math.min(Number(assessment.maxLoan || 0), Number(selectedOffer.maxBorrowUsd || 0))
      : null;

  useEffect(() => {
    let active = true;
    const loadBrowse = async () => {
      try {
        const pools = await fetchPoolsBrowse({
          chain: chainName,
          borrowerWallet: address || undefined,
          accessFilter: browseFilter
        });
        if (active) setBrowsePools(pools);
      } catch {
        if (active) setBrowsePools([]);
      }
    };
    loadBrowse();
    return () => { active = false; };
  }, [chainName, address, browseFilter]);

  const holoFallback = (
    <div className="holo-card">
      <div className="loading-row">
        <div className="spinner" />
      </div>
    </div>
  );

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Borrow</h1>
        <div className="page-subtitle">
          Escrow a vesting position, preview risk, and confirm conservative terms.
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration variant="borrow" />
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Available Borrow</div>
          <div className="stat-value">$92,110</div>
          <div className="stat-delta">Based on DPV</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg LTV</div>
          <div className="stat-value">38.4%</div>
          <div className="stat-delta">Conservative target</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unlock Window</div>
          <div className="stat-value">6-12 mo</div>
          <div className="stat-delta">Sample schedule</div>
        </div>
      </div>
      <div className="holo-card">
        <h3 className="holo-title">Testnet Notice</h3>
        <div className="muted">
          This flow is a prototype. Risk previews are illustrative and depend on
          the connected testnet contracts.
        </div>
      </div>
      <FundWallet mode="borrow" onStatusChange={setFundingStatus} />
      <BorrowWizard />
      <div className="grid-2">
        <ValuationForm
          onUpdate={setValuationState}
          prefill={vestingDetails?.verified ? vestingDetails : null}
        />
        <BorrowActions
          onDetails={setVestingDetails}
          maxBorrowUsd={assessment.maxLoan}
          fundingStatus={fundingStatus}
          offerBorrowUsd={offerBorrowUsd}
        />
      </div>
      <TokenAssessment
        vestingDetails={vestingDetails}
        ltvBps={valuationState.ltvBps}
        onEstimate={setAssessment}
      />
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Matching Offers</h3>
            <div className="section-subtitle">
              Advisory pool matches based on your vesting profile.
            </div>
          </div>
          <span className="tag">{matchLoading ? 'Matching' : `${matchOffers.length} offers`}</span>
        </div>
        {matchError && <div className="error-banner">{matchError}</div>}
        {!matchLoading && !matchOffers.length && (
          <div className="muted">
            No offers available yet. Create a lender pool to unlock matching.
          </div>
        )}
        {Boolean(matchOffers.length) && (
          <div className="data-table">
            <div className="table-row header">
              <div>Pool</div>
              <div>Access</div>
              <div>Risk</div>
              <div>Interest</div>
              <div>Max Borrow</div>
              <div>Action</div>
            </div>
            {matchOffers.map((offer) => (
              <div key={offer.offerId} className={`table-row ${!offer.canAccess ? 'muted' : ''}`}>
                <div>{offer.poolName || offer.poolId?.slice(0, 8)}...</div>
                <div>
                  <span className={`tag ${offer.canAccess ? 'success' : ''}`}>
                    {offer.accessType || 'open'}
                  </span>
                  {offer.lockReason && (
                    <div className="muted" style={{ fontSize: '0.75em', marginTop: 2 }}>
                      {offer.lockReason}
                    </div>
                  )}
                </div>
                <div>{offer.riskTier}</div>
                <div>{offer.interestBps} bps</div>
                <div>${Number(offer.maxBorrowUsd || 0).toFixed(2)}</div>
                <div>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => setSelectedOffer(offer)}
                    disabled={!offer.canAccess}
                    title={!offer.canAccess ? offer.lockReason : ''}
                  >
                    {offer.canAccess ? 'Use offer' : 'Peek'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="card-list">
          <div className="pill">Offers are advisory; final terms settle onchain.</div>
          <div className="pill">Premium/community pools require holding the pool token to borrow.</div>
        </div>
      </div>

      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Browse Pools</h3>
            <div className="section-subtitle">
              Discover open, premium, and community-gated lending pools.
            </div>
          </div>
        </div>
        <div className="inline-actions" style={{ gap: 8, marginBottom: 16 }}>
          {['all', 'open', 'accessible'].map((filter) => (
            <button
              key={filter}
              className={`button ghost ${browseFilter === filter ? 'active' : ''}`}
              type="button"
              onClick={() => setBrowseFilter(filter)}
            >
              {filter === 'all' ? 'All Pools' : filter === 'open' ? 'Open Only' : 'Accessible'}
            </button>
          ))}
        </div>
        {browsePools.length === 0 ? (
          <div className="muted">No pools found. Lenders can create pools on the Lender page.</div>
        ) : (
          <div className="data-table">
            <div className="table-row header">
              <div>Pool</div>
              <div>Access</div>
              <div>Status</div>
              <div>Description</div>
            </div>
            {browsePools.map((pool) => (
              <div key={pool.id} className={`table-row ${!pool.canAccess ? 'muted' : ''}`}>
                <div>{pool.name}</div>
                <div>
                  <span className={`tag ${pool.canAccess ? 'success' : ''}`}>
                    {pool.accessType || 'open'}
                  </span>
                  {pool.lockReason && (
                    <span className="muted" style={{ fontSize: '0.8em', marginLeft: 4 }}>
                      ({pool.lockReason})
                    </span>
                  )}
                </div>
                <div>{pool.canAccess ? 'Can borrow' : 'Peek only'}</div>
                <div>{pool.preferences?.description || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Borrow Checklist</h3>
              <div className="section-subtitle">Before minting a loan</div>
            </div>
            <span className="tag">Step 2/4</span>
          </div>
          <div className="card-list">
            <div className="pill">Verify vesting ownership</div>
            <div className="pill">Confirm unlock schedule</div>
            <div className="pill">Review valuation + LTV</div>
            <div className="pill">Sign loan terms</div>
          </div>
        </div>
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Risk Summary</h3>
              <div className="section-subtitle">Auto-generated from data inputs</div>
            </div>
            <span className={`tag ${riskTagClass}`}>{riskLabel}</span>
          </div>
          <div className="card-list">
            <div className="pill">Haircut: {assessment.haircut ? `${(assessment.haircut * 100).toFixed(1)}%` : '--'}</div>
            <div className="pill">Adj Price: {assessment.adjustedPrice ? `$${assessment.adjustedPrice.toFixed(2)}` : '--'}</div>
            <div className="pill">Max Borrow: {assessment.maxLoan ? `$${assessment.maxLoan.toFixed(2)}` : '--'}</div>
            <div className="pill">Coverage P5: {assessment.coverageP5 ? `${assessment.coverageP5.toFixed(2)}x` : '--'}</div>
            <div className="pill">Coverage P1: {assessment.coverageP1 ? `${assessment.coverageP1.toFixed(2)}x` : '--'}</div>
          </div>
        </div>
      </div>
      <FaucetCard />
      <Suspense fallback={holoFallback}>
        <ValuationPreview3D paths={simPaths} />
      </Suspense>
    </div>
  );
}
