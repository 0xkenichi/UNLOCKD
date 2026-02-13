import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import BorrowWizard from '../components/borrow/BorrowWizard.jsx';
import BorrowActions from '../components/borrow/BorrowActions.jsx';
import TokenAssessment from '../components/borrow/TokenAssessment.jsx';
import ValuationForm from '../components/borrow/ValuationForm.jsx';
import FaucetCard from '../components/borrow/FaucetCard.jsx';
import FundWallet from '../components/common/FundWallet.jsx';
import AdvancedSection from '../components/common/AdvancedSection.jsx';
import { generateRiskPaths } from '../utils/riskPaths.js';
import { requestMatchQuote, fetchPoolsBrowse } from '../utils/api.js';

const ASSESSMENT_TESTNET_CHAIN_IDS = new Set([31337, 11155111, 84532]);

const ValuationPreview3D = lazy(() =>
  import('../components/borrow/ValuationPreview3D.jsx')
);

export default function Borrow() {
  const location = useLocation();
  const prefill = location.state?.prefill;
  const { address } = useAccount();
  const chainId = useChainId();
  const chainName = [8453, 84532].includes(chainId) ? 'base' : 'base';
  const isAssessmentTestnet = ASSESSMENT_TESTNET_CHAIN_IDS.has(chainId);
  const [valuationState, setValuationState] = useState({ pv: 0n, ltvBps: 0n });
  const [vestingDetails, setVestingDetails] = useState(null);
  const [assessment, setAssessment] = useState({
    maxLoan: 0,
    coverageP5: 0,
    coverageP1: 0,
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
        if (active) setMatchLoading(false);
      }
    };
    loadOffers();
    return () => { active = false; };
  }, [matchKey]);

  useEffect(() => {
    let active = true;
    const loadBrowse = async () => {
      try {
        const browseData = await fetchPoolsBrowse({
          chain: chainName,
          borrowerWallet: address || undefined,
          accessFilter: browseFilter
        });
        const pools = Array.isArray(browseData)
          ? browseData
          : Array.isArray(browseData?.pools)
            ? browseData.pools
            : [];
        if (active) setBrowsePools(pools);
      } catch {
        if (active) setBrowsePools([]);
      }
    };
    loadBrowse();
    return () => { active = false; };
  }, [chainName, address, browseFilter]);

  const offerBorrowUsd =
    selectedOffer && selectedOffer.canAccess
      ? Math.min(Number(assessment.maxLoan || 0), Number(selectedOffer.maxBorrowUsd || 0))
      : null;

  const simPaths = useMemo(
    () =>
      generateRiskPaths({
        pv: Number(valuationState.pv),
        ltvBps: Number(valuationState.ltvBps)
      }),
    [valuationState]
  );

  const holoFallback = (
    <div className="holo-card">
      <div className="loading-row"><div className="spinner" /></div>
    </div>
  );

  return (
    <motion.div
      className="stack page-minimal borrow-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div className="page-header">
        <h1 className="page-title holo-glow">Borrow</h1>
        <p className="page-subtitle">Escrow vesting, get USDC.</p>
      </div>

      {prefill?.fromFundraise && prefill?.projectId && (
        <div className="holo-card" style={{ marginBottom: 16 }}>
          <span className="tag success">From fundraising</span>
          <p className="muted" style={{ marginTop: 8 }}>
            Project: <strong>{prefill.projectId}</strong>
            {prefill.chain && ` · Chain: ${prefill.chain}`}
            {' — '}
            Enter your vesting contract (or use Import from Sablier v2) and collateral ID below to escrow and borrow.
          </p>
        </div>
      )}

      <FundWallet mode="borrow" onStatusChange={setFundingStatus} />

      <div className="grid-2">
        {isAssessmentTestnet ? (
          <ValuationForm
            onUpdate={setValuationState}
            prefill={vestingDetails}
          />
        ) : (
          <div className="holo-card">
            <div className="section-head">
              <div>
                <h3 className="section-title">Valuation Engine</h3>
                <div className="section-subtitle">
                  Unavailable on this network.
                </div>
              </div>
              <span className="chip">Testnet Only</span>
            </div>
            <div className="muted">
              Switch to localhost, Sepolia, or Base Sepolia to use live valuation and token assessment.
            </div>
          </div>
        )}
        <BorrowActions
          onDetails={setVestingDetails}
          maxBorrowUsd={assessment.maxLoan}
          fundingStatus={fundingStatus}
          offerBorrowUsd={offerBorrowUsd}
        />
      </div>

      {isAssessmentTestnet && (
        <TokenAssessment
          vestingDetails={vestingDetails}
          ltvBps={valuationState.ltvBps}
          onEstimate={setAssessment}
        />
      )}

      <AdvancedSection title="Advanced">
        <BorrowWizard />
        <div className="advanced-block">
          <h4 className="section-title">Matching offers</h4>
          {matchError && <div className="error-banner">{matchError}</div>}
          {!matchLoading && !matchOffers.length && (
            <p className="muted">No offers yet. Lenders create pools on the Lender page.</p>
          )}
          {Boolean(matchOffers.length) && (
            <div className="data-table">
              <div className="table-row header">
                <div>Pool</div>
                <div>Access</div>
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
                  </div>
                  <div>${Number(offer.maxBorrowUsd || 0).toFixed(2)}</div>
                  <div>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => setSelectedOffer(offer)}
                      disabled={!offer.canAccess}
                    >
                      {offer.canAccess ? 'Use' : 'Peek'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="advanced-block">
          <h4 className="section-title">Browse pools</h4>
          <div className="stack-row" style={{ marginBottom: 12 }}>
            {['all', 'open', 'accessible'].map((f) => (
              <button
                key={f}
                className={`button ghost ${browseFilter === f ? 'active' : ''}`}
                type="button"
                onClick={() => setBrowseFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Accessible'}
              </button>
            ))}
          </div>
          {browsePools.length === 0 ? (
            <p className="muted">No pools found.</p>
          ) : (
            <div className="data-table">
              <div className="table-row header">
                <div>Pool</div>
                <div>Access</div>
                <div>Status</div>
              </div>
              {browsePools.map((pool) => (
                <div key={pool.id} className={`table-row ${!pool.canAccess ? 'muted' : ''}`}>
                  <div>{pool.name}</div>
                  <div>
                    <span className={`tag ${pool.canAccess ? 'success' : ''}`}>
                      {pool.accessType || 'open'}
                    </span>
                  </div>
                  <div>{pool.canAccess ? 'Can borrow' : 'Peek only'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="advanced-block">
          <h4 className="section-title">Risk summary</h4>
          <div className="card-list">
            <div className="pill">Max: ${assessment.maxLoan ? assessment.maxLoan.toFixed(2) : '--'}</div>
            <div className="pill">Coverage P5: {assessment.coverageP5 ? `${assessment.coverageP5.toFixed(2)}x` : '--'}</div>
          </div>
        </div>
        <FaucetCard />
        <Suspense fallback={holoFallback}>
          <ValuationPreview3D paths={simPaths} />
        </Suspense>
      </AdvancedSection>
    </motion.div>
  );
}
