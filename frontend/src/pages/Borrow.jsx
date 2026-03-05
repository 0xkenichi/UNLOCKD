// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import BorrowWizard from '../components/borrow/BorrowWizard.jsx';
import BorrowActions from '../components/borrow/BorrowActions.jsx';
import TokenAssessment from '../components/borrow/TokenAssessment.jsx';
import ValuationForm from '../components/borrow/ValuationForm.jsx';
import FaucetCard from '../components/borrow/FaucetCard.jsx';
import FundWallet from '../components/common/FundWallet.jsx';
import DemoAccessCard from '../components/common/DemoAccessCard.jsx';
import AdvancedSection from '../components/common/AdvancedSection.jsx';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PassportSummary from '../components/common/PassportSummary.jsx';
import PrivacyModeToggle from '../components/privacy/PrivacyModeToggle.jsx';
import PrivacyUpgradeWizard from '../components/privacy/PrivacyUpgradeWizard.jsx';
import { generateRiskPaths } from '../utils/riskPaths.js';
import { requestChainSupport, requestMatchQuote, fetchPoolsBrowse } from '../utils/api.js';
import { trackEvent } from '../utils/analytics.js';
import usePassportSnapshot from '../utils/usePassportSnapshot.js';
import { usePrivacyMode } from '../utils/privacyMode.js';

const ASSESSMENT_TESTNET_CHAIN_IDS = new Set([31337, 11155111, 84532]);
const SUPPORTED_SETTLEMENT_CHAIN_IDS = new Set([8453, 84532, 11155111, 31337]);

const ValuationPreview3D = lazy(() =>
  import('../components/borrow/ValuationPreview3D.jsx')
);

export default function Borrow() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = location.state?.prefill;
  const { address } = useAccount();
  const chainId = useChainId();
  const { enabled: privacyMode } = usePrivacyMode();
  const chainName = useMemo(() => {
    if ([8453, 84532, 11155111, 31337].includes(chainId)) return 'base';
    return 'base';
  }, [chainId]);
  const isAssessmentTestnet = ASSESSMENT_TESTNET_CHAIN_IDS.has(chainId);
  const isSupportedSettlementChain = SUPPORTED_SETTLEMENT_CHAIN_IDS.has(chainId);
  const [chainRequestState, setChainRequestState] = useState({ status: 'idle', error: '' });
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
  const [desiredBorrowUsd, setDesiredBorrowUsd] = useState(() => {
    const raw = Number(prefill?.desiredAmountUsd ?? prefill?.borrowAmountUsd ?? 0);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  });
  const [desiredBorrowUsdDebounced, setDesiredBorrowUsdDebounced] = useState(desiredBorrowUsd);
  const [browsePools, setBrowsePools] = useState([]);
  const [browseFilter, setBrowseFilter] = useState('all');
  const passportSummary = usePassportSnapshot(address);

  const preferredOfferId = prefill?.preferredOfferId ? String(prefill.preferredOfferId) : '';

  const submitChainRequest = async () => {
    setChainRequestState({ status: 'submitting', error: '' });
    try {
      await requestChainSupport({
        chainId,
        feature: 'borrow_settlement',
        page: 'borrow',
        walletAddress: address || undefined,
        message: 'User requested chain support from Borrow page'
      });
      trackEvent('chain_support_requested', { chainId, page: 'borrow' });
      setChainRequestState({ status: 'submitted', error: '' });
    } catch (error) {
      setChainRequestState({ status: 'error', error: error?.message || 'Unable to submit request' });
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDesiredBorrowUsdDebounced(desiredBorrowUsd);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [desiredBorrowUsd]);

  const matchKey = `${vestingDetails?.verified ? '1' : '0'}:${vestingDetails?.collateralId || ''}:${desiredBorrowUsdDebounced || 0}:${assessment.maxLoan || 0}:${address || ''}`;

  useEffect(() => {
    let active = true;
    const loadOffers = async () => {
      const collateralId = vestingDetails?.collateralId;
      const desiredAmountUsd = Number(desiredBorrowUsdDebounced || assessment.maxLoan || 0);
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
          borrowerWallet: privacyMode ? undefined : address || undefined
        });
        if (!active) return;
        const offers = data?.offers || [];
        setMatchOffers(offers);
        setMatchError('');
        trackEvent('quote_requested', {
          chain: chainName,
          collateralId: String(collateralId),
          desiredAmountUsd,
          offersReturned: offers.length
        });
        if (offers.length) {
          if (preferredOfferId) {
            const preferred = offers.find((o) => String(o.offerId) === preferredOfferId);
            if (preferred) {
              setSelectedOffer(preferred);
              return;
            }
          }
          if (!selectedOffer) {
            const firstAccessible = offers.find((o) => o.canAccess);
            setSelectedOffer(firstAccessible || offers[0]);
          }
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
  }, [matchKey, privacyMode]);

  useEffect(() => {
    if (!preferredOfferId || !matchOffers.length) return;
    const preferred = matchOffers.find((o) => String(o.offerId) === preferredOfferId);
    if (preferred) setSelectedOffer(preferred);
  }, [preferredOfferId, matchOffers]);

  useEffect(() => {
    let active = true;
    const loadBrowse = async () => {
      try {
        const browseData = await fetchPoolsBrowse({
          chain: chainName,
          borrowerWallet: privacyMode ? undefined : address || undefined,
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
  }, [chainName, address, browseFilter, privacyMode]);

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
        <div className="inline-actions" style={{ marginTop: 8 }}>
          <span className="chip">Testnet readiness mode</span>
          <span className="chip">Mainnet launch disabled</span>
          <span className="chip">Settlement: Base-only (MVP)</span>
          <span className="chip">Solana: discovery + advisory quotes</span>
        </div>
        <div className="inline-actions" style={{ marginTop: 10 }}>
          <PrivacyModeToggle />
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/features')}>
            How borrowing works
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=risk-models')}>
            Risk model docs
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/community-pools')}>
            Community pools
          </button>
        </div>
      </div>
      <PassportSummary
        as="div"
        className="muted"
        style={{ marginTop: -4 }}
        loading={passportSummary.loading}
        score={passportSummary.score}
        stamps={passportSummary.stamps}
      />
      <EssentialsPanel />
      {!isSupportedSettlementChain && (
        <div className="holo-card" style={{ marginTop: 12 }}>
          <span className="tag danger">Unsupported chain</span>
          <p className="muted" style={{ marginTop: 8 }}>
            Borrowing/settlement is currently supported on Base-first networks only. Switch networks, or request support for this chain to prioritize expansion.
          </p>
          {chainRequestState.status === 'error' && (
            <div className="error-banner">{chainRequestState.error}</div>
          )}
          <div className="inline-actions" style={{ marginTop: 10 }}>
            <button
              className="button ghost"
              type="button"
              onClick={submitChainRequest}
              disabled={chainRequestState.status === 'submitting' || chainRequestState.status === 'submitted'}
            >
              {chainRequestState.status === 'submitted'
                ? 'Request submitted'
                : chainRequestState.status === 'submitting'
                  ? 'Submitting…'
                  : 'Request chain support'}
            </button>
          </div>
        </div>
      )}
      <PrivacyUpgradeWizard enabled={privacyMode} />
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Borrower journey</h3>
            <div className="section-subtitle">Prepare collateral, verify risk, borrow, and repay</div>
          </div>
        </div>
        <div className="card-list">
          <div className="pill">1. Connect wallet and verify vesting details</div>
          <div className="pill">2. Run valuation and inspect risk output</div>
          <div className="pill">3. Select a pool offer and borrow within limits</div>
          <div className="pill">4. Track repayment schedule to avoid fallback paths</div>
        </div>
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

      {prefill?.fromAgent && (
        <div className="holo-card" style={{ marginBottom: 16 }}>
          <span className="tag success">From Vestra AI</span>
          <p className="muted" style={{ marginTop: 8 }}>
            Collateral ID: <strong>{prefill.collateralId || '--'}</strong>
            {prefill.desiredAmountUsd ? ` · Desired: $${Number(prefill.desiredAmountUsd).toFixed(2)}` : ''}
            {prefill.preferredOfferId ? ' · Offer pre-selected' : ''}
          </p>
          {String(prefill.chain || '').toLowerCase() === 'solana' && (
            <div className="error-banner" style={{ marginTop: 10 }}>
              Solana streams can be discovered/scored in this MVP, but borrowing/settlement is Base-only. Switch to Base to proceed.
            </div>
          )}
        </div>
      )}

      <FundWallet mode="borrow" onStatusChange={setFundingStatus} />
      <DemoAccessCard />

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
          privacyMode={privacyMode}
          prefill={prefill}
          onDetails={setVestingDetails}
          maxBorrowUsd={assessment.maxLoan}
          fundingStatus={fundingStatus}
          offerBorrowUsd={offerBorrowUsd}
          ltvBps={valuationState.ltvBps}
          selectedOffer={selectedOffer}
          matchOffers={matchOffers}
          matchLoading={matchLoading}
          matchError={matchError}
          onSelectOffer={setSelectedOffer}
          onBorrowAmountUsdChange={setDesiredBorrowUsd}
          matchContext={{
            chain: chainName,
            collateralId: vestingDetails?.collateralId ? String(vestingDetails.collateralId) : '',
            desiredAmountUsd: Number(desiredBorrowUsdDebounced || assessment.maxLoan || 0)
          }}
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
          <p className="muted" style={{ marginTop: 6 }}>
            Offers are advisory in this MVP; settlement happens on Base. Use the main offer picker in Borrow Actions for the primary flow.
          </p>
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
                      onClick={() => {
                        setSelectedOffer(offer);
                        trackEvent('quote_accepted', {
                          chain: chainName,
                          poolId: offer.poolId,
                          offerId: offer.offerId,
                          maxBorrowUsd: offer.maxBorrowUsd
                        });
                      }}
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
