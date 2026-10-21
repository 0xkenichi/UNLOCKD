// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import SmartWalletOnboardingCard from '../components/lender/SmartWalletOnboardingCard.jsx';
import {
  createPool,
  fetchLenderPortfolioLight,
  fetchLenderProjections,
  fetchPools,
  requestMatchQuote,
  requestChainSupport,
  updatePoolPreferences
} from '../utils/api.js';
import {
  getContractAddress,
  insuranceVaultAbi,
  lendingPoolAbi,
  loanManagerAbi,
  usdcAbi
} from '../utils/contracts.js';
import { formatValue, toUnits } from '../utils/format.js';

const DEFAULT_PREFS = {
  riskTier: 'balanced',
  maxLtvBps: 3500,
  interestBps: 1800,
  minLiquidityUsd: 0,
  minWalletAgeDays: 0,
  minVolumeUsd: 0,
  minLoanUsd: 100,
  maxLoanUsd: 2500,
  unlockWindowDays: { min: 30, max: 720 },
  tokenCategories: [],
  allowedTokens: [],
  chains: ['base']
};

const chainOptions = [
  { label: 'Base', value: 'base' },
  { label: 'Solana', value: 'solana' },
  { label: 'Base + Solana (advisory)', value: 'both' }
];

export default function Lender() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const depositSectionRef = useRef(null);
  const [smartWalletAddress, setSmartWalletAddress] = useState('');
  const lendingPool = getContractAddress(chainId, 'lendingPool');
  const loanManager = getContractAddress(chainId, 'loanManager');
  const insuranceVault = getContractAddress(chainId, 'insuranceVault');
  const usdc = getContractAddress(chainId, 'usdc');
  const [pools, setPools] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState('');
  const [updateState, setUpdateState] = useState('idle');
  const [actionLogs, setActionLogs] = useState([]);
  const [projectionState, setProjectionState] = useState({ status: 'idle', data: null, error: '' });
  const [portfolioLightState, setPortfolioLightState] = useState({ status: 'idle', data: null, error: '' });

  const [poolName, setPoolName] = useState('Vestra Pool');
  const [poolChain, setPoolChain] = useState('base');
  const [riskTier, setRiskTier] = useState(DEFAULT_PREFS.riskTier);
  const [maxLtvBps, setMaxLtvBps] = useState(DEFAULT_PREFS.maxLtvBps);
  const [interestBps, setInterestBps] = useState(DEFAULT_PREFS.interestBps);
  const [minLiquidityUsd, setMinLiquidityUsd] = useState(DEFAULT_PREFS.minLiquidityUsd);
  const [minWalletAgeDays, setMinWalletAgeDays] = useState(DEFAULT_PREFS.minWalletAgeDays);
  const [minVolumeUsd, setMinVolumeUsd] = useState(DEFAULT_PREFS.minVolumeUsd);
  const [minLoanUsd, setMinLoanUsd] = useState(DEFAULT_PREFS.minLoanUsd);
  const [maxLoanUsd, setMaxLoanUsd] = useState(DEFAULT_PREFS.maxLoanUsd);
  const [unlockMin, setUnlockMin] = useState(DEFAULT_PREFS.unlockWindowDays.min);
  const [unlockMax, setUnlockMax] = useState(DEFAULT_PREFS.unlockWindowDays.max);
  const [accessType, setAccessType] = useState('open');
  const [premiumToken, setPremiumToken] = useState('');
  const [communityToken, setCommunityToken] = useState('');
  const [allowedTokenTypes, setAllowedTokenTypes] = useState('');
  const [tokenCategories, setTokenCategories] = useState('');
  const [allowedTokens, setAllowedTokens] = useState('');
  const [vestCliffMin, setVestCliffMin] = useState('');
  const [vestCliffMax, setVestCliffMax] = useState('');
  const [vestDurationMin, setVestDurationMin] = useState('');
  const [vestDurationMax, setVestDurationMax] = useState('');
  const [poolDescription, setPoolDescription] = useState('');
  const [exampleChain, setExampleChain] = useState('base');
  const [exampleCollateralId, setExampleCollateralId] = useState('');
  const [exampleDesiredUsd, setExampleDesiredUsd] = useState('500');
  const [exampleState, setExampleState] = useState({ status: 'idle', offers: [], valuation: null, reason: '' });
  const [exampleError, setExampleError] = useState('');

  const ownerWallet = useMemo(() => address || '', [address]);
  const preferredOnboardingWallet = useMemo(() => smartWalletAddress || address || '', [smartWalletAddress, address]);
  const walletSource = smartWalletAddress ? 'smart_wallet' : address ? 'browser_wallet' : 'none';
  const depositUnits = useMemo(() => toUnits(depositAmount, 6), [depositAmount]);
  const withdrawUnits = useMemo(() => toUnits(withdrawAmount, 6), [withdrawAmount]);

  const formatUsd = useCallback((value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }, []);

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

  const ZERO = '0x0000000000000000000000000000000000000000';
  const { data: totalAssets, refetch: refetchTotalAssets } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'totalAssets',
    query: { enabled: Boolean(lendingPool) }
  });

  const { data: totalBorrowed } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'totalBorrowed',
    query: { enabled: Boolean(lendingPool) }
  });

  const { data: availableLiquidity } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'availableLiquidity',
    query: { enabled: Boolean(lendingPool) }
  });

  const { data: utilizationBps } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'utilizationBps',
    query: { enabled: Boolean(lendingPool) }
  });

  const { data: borrowRateBps } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'borrowRateBps',
    query: { enabled: Boolean(lendingPool) }
  });

  const { data: reserveFactorBps } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'reserveFactorBps',
    query: { enabled: Boolean(loanManager) }
  });

  const { data: walletShares, refetch: refetchShares } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'balanceOf',
    args: [address || ZERO],
    query: { enabled: Boolean(lendingPool && address) }
  });

  const { data: walletShareAssets } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'convertToAssets',
    args: [walletShares ?? 0n],
    query: { enabled: Boolean(lendingPool && walletShares !== undefined) }
  });

  const { data: maxWithdrawable, refetch: refetchMaxWithdraw } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'maxWithdraw',
    args: [address || ZERO],
    query: { enabled: Boolean(lendingPool && address) }
  });

  const { data: insuranceBalance } = useReadContract({
    address: insuranceVault,
    abi: insuranceVaultAbi,
    functionName: 'balance',
    query: { enabled: Boolean(insuranceVault) }
  });

  const { data: insuranceCovered } = useReadContract({
    address: insuranceVault,
    abi: insuranceVaultAbi,
    functionName: 'totalCovered',
    query: { enabled: Boolean(insuranceVault) }
  });

  // Supply APY is not stored on-chain. Lenders earn the borrow rate on the borrowed share of the
  // pool, net of the reserve factor that goes to the InsuranceVault. It moves with utilization.
  const supplyApyPct = useMemo(() => {
    if (borrowRateBps === undefined || utilizationBps === undefined) return null;
    const rf = reserveFactorBps !== undefined ? Number(reserveFactorBps) : 0;
    const apyBps = (Number(borrowRateBps) * Number(utilizationBps)) / 10000 * (1 - rf / 10000);
    return apyBps / 100;
  }, [borrowRateBps, utilizationBps, reserveFactorBps]);

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

  const {
    isLoading: approveMining,
    isSuccess: approveConfirmed,
    error: approveReceiptError
  } = useWaitForTransactionReceipt({ hash: approveHash });
  const {
    isLoading: depositMining,
    isSuccess: depositConfirmed,
    error: depositReceiptError
  } = useWaitForTransactionReceipt({ hash: depositHash });
  const {
    isLoading: withdrawMining,
    isSuccess: withdrawConfirmed,
    error: withdrawReceiptError
  } = useWaitForTransactionReceipt({ hash: withdrawHash });

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
    let cancelled = false;
    setPortfolioLightState((prev) => ({ ...prev, status: 'loading', error: '' }));
    fetchLenderPortfolioLight()
      .then((data) => {
        if (cancelled) return;
        setPortfolioLightState({ status: 'ready', data, error: '' });
      })
      .catch((err) => {
        if (cancelled) return;
        setPortfolioLightState({
          status: 'error',
          data: null,
          error: err?.message || 'Unable to load portfolio stats'
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const amount = Number(depositAmount);
    if (!depositAmount || !Number.isFinite(amount) || amount <= 0) {
      setProjectionState({ status: 'idle', data: null, error: '' });
      return () => {
        cancelled = true;
      };
    }
    setProjectionState((prev) => ({ ...prev, status: 'loading', error: '' }));
    const timer = setTimeout(() => {
      fetchLenderProjections(amount)
        .then((data) => {
          if (cancelled) return;
          setProjectionState({ status: 'ready', data, error: '' });
        })
        .catch((err) => {
          if (cancelled) return;
          setProjectionState({
            status: 'error',
            data: null,
            error: err?.message || 'Unable to load projections'
          });
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [depositAmount]);

  useEffect(() => {
    const selected = pools.find((pool) => pool.id === selectedPoolId);
    if (!selected) return;
    setPoolName(selected.name || 'Vestra Pool');
    const preference = selected.preferences || {};
    setRiskTier(preference.riskTier || 'balanced');
    setMaxLtvBps(preference.maxLtvBps ?? DEFAULT_PREFS.maxLtvBps);
    setInterestBps(preference.interestBps ?? DEFAULT_PREFS.interestBps);
    setMinLiquidityUsd(preference.minLiquidityUsd ?? DEFAULT_PREFS.minLiquidityUsd);
    setMinWalletAgeDays(preference.minWalletAgeDays ?? DEFAULT_PREFS.minWalletAgeDays);
    setMinVolumeUsd(preference.minVolumeUsd ?? DEFAULT_PREFS.minVolumeUsd);
    setMinLoanUsd(preference.minLoanUsd ?? DEFAULT_PREFS.minLoanUsd);
    setMaxLoanUsd(preference.maxLoanUsd ?? DEFAULT_PREFS.maxLoanUsd);
    setUnlockMin(preference.unlockWindowDays?.min ?? DEFAULT_PREFS.unlockWindowDays.min);
    setUnlockMax(preference.unlockWindowDays?.max ?? DEFAULT_PREFS.unlockWindowDays.max);
    setAccessType(preference.accessType || 'open');
    setPremiumToken(preference.premiumToken || '');
    setCommunityToken(preference.communityToken || '');
    setAllowedTokenTypes((preference.allowedTokenTypes || []).join(', '));
    setTokenCategories((preference.tokenCategories || []).join(', '));
    setAllowedTokens((preference.allowedTokens || []).join(', '));
    setVestCliffMin(preference.vestPreferences?.cliffMinDays ?? '');
    setVestCliffMax(preference.vestPreferences?.cliffMaxDays ?? '');
    setVestDurationMin(preference.vestPreferences?.durationMinDays ?? '');
    setVestDurationMax(preference.vestPreferences?.durationMaxDays ?? '');
    setPoolDescription(preference.description || '');
  }, [pools, selectedPoolId]);

  const pushActionLog = useCallback((action, status, message) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      action,
      status,
      message,
      at: new Date().toLocaleTimeString()
    };
    setActionLogs((prev) => [entry, ...prev].slice(0, 18));
  }, []);

  const handleCreatePool = async () => {
    setSaveState('saving');
    try {
      const chains =
        poolChain === 'both' ? ['base', 'solana'] : poolChain ? [poolChain] : [];
      const tokenTypes = allowedTokenTypes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const categories = tokenCategories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const allowlisted = allowedTokens
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
          minLiquidityUsd: Number(minLiquidityUsd) || undefined,
          minWalletAgeDays: Number(minWalletAgeDays) || undefined,
          minVolumeUsd: Number(minVolumeUsd) || undefined,
          minLoanUsd: Number(minLoanUsd),
          maxLoanUsd: Number(maxLoanUsd),
          unlockWindowDays: {
            min: Number(unlockMin),
            max: Number(unlockMax)
          },
          tokenCategories: categories.length ? categories : undefined,
          allowedTokens: allowlisted.length ? allowlisted : undefined,
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
      const categories = tokenCategories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const allowlisted = allowedTokens
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        preferences: {
          riskTier,
          maxLtvBps: Number(maxLtvBps),
          interestBps: Number(interestBps),
          minLiquidityUsd: Number(minLiquidityUsd) || undefined,
          minWalletAgeDays: Number(minWalletAgeDays) || undefined,
          minVolumeUsd: Number(minVolumeUsd) || undefined,
          minLoanUsd: Number(minLoanUsd),
          maxLoanUsd: Number(maxLoanUsd),
          unlockWindowDays: {
            min: Number(unlockMin),
            max: Number(unlockMax)
          },
          tokenCategories: categories.length ? categories : undefined,
          allowedTokens: allowlisted.length ? allowlisted : undefined,
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
    if (!address) {
      const msg = smartWalletAddress
        ? 'Smart wallet connected. Connect an EVM wallet to execute pool contract actions in this MVP.'
        : 'Connect wallet first.';
      setError(msg);
      pushActionLog('Approve', 'blocked', msg);
      return;
    }
    if (!usdc || !lendingPool) {
      setError('Unsupported network. Switch to a configured chain.');
      pushActionLog('Approve', 'blocked', 'Missing contract addresses for this chain.');
      return;
    }
    if (!depositUnits) {
      setError('Enter a valid deposit amount.');
      pushActionLog('Approve', 'blocked', 'Invalid deposit amount.');
      return;
    }
    pushActionLog('Approve', 'started', `Submitting approval for ${depositAmount} USDC`);
    writeApprove({
      address: usdc,
      abi: usdcAbi,
      functionName: 'approve',
      args: [lendingPool, depositUnits]
    });
  };

  const handleDeposit = () => {
    if (!address) {
      const msg = smartWalletAddress
        ? 'Smart wallet connected. Connect an EVM wallet to execute pool contract actions in this MVP.'
        : 'Connect wallet first.';
      setError(msg);
      pushActionLog('Deposit', 'blocked', msg);
      return;
    }
    if (!lendingPool || !depositUnits) {
      setError('Unsupported network or invalid amount.');
      pushActionLog('Deposit', 'blocked', 'Missing lending pool or invalid amount.');
      return;
    }
    if (!allowanceEnough) {
      setError('Approve USDC before depositing.');
      pushActionLog('Deposit', 'blocked', 'Approval required before deposit.');
      return;
    }
    pushActionLog('Deposit', 'started', `Submitting deposit for ${depositAmount} USDC`);
    writeDeposit({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'deposit',
      args: [depositUnits, address]
    });
  };

  const handleWithdraw = () => {
    if (!address) {
      const msg = smartWalletAddress
        ? 'Smart wallet connected. Connect an EVM wallet to execute pool contract actions in this MVP.'
        : 'Connect wallet first.';
      setError(msg);
      pushActionLog('Withdraw', 'blocked', msg);
      return;
    }
    if (!lendingPool || !withdrawUnits) {
      setError('Unsupported network or invalid amount.');
      pushActionLog('Withdraw', 'blocked', 'Missing lending pool or invalid amount.');
      return;
    }
    if (!withdrawEnough) {
      setError('Withdraw amount exceeds what you can withdraw now (your position or idle liquidity).');
      pushActionLog('Withdraw', 'blocked', 'Amount above maxWithdraw.');
      return;
    }
    pushActionLog('Withdraw', 'started', `Submitting withdrawal for ${withdrawAmount} USDC`);
    writeWithdraw({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'withdraw',
      args: [withdrawUnits, address, address]
    });
  };

  const handleRedeemAll = () => {
    if (!address || !lendingPool) {
      setError('Connect wallet first.');
      pushActionLog('Redeem', 'blocked', 'Wallet or pool missing.');
      return;
    }
    if (!walletShares || walletShares <= 0n) {
      setError('You have no pool shares to redeem.');
      pushActionLog('Redeem', 'blocked', 'No shares.');
      return;
    }
    pushActionLog('Redeem', 'started', 'Redeeming all pool shares');
    writeWithdraw({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'redeem',
      args: [walletShares, address, address]
    });
  };

  const allowanceEnough =
    allowance !== null && allowance !== undefined && depositUnits
      ? allowance >= depositUnits
      : false;
  const withdrawEnough =
    maxWithdrawable !== null && maxWithdrawable !== undefined && withdrawUnits
      ? maxWithdrawable >= withdrawUnits
      : false;

  useEffect(() => {
    if (approveHash) {
      pushActionLog(
        'Approve',
        'submitted',
        `Approval tx submitted (${approveHash.slice(0, 10)}...${approveHash.slice(-6)})`
      );
    }
  }, [approveHash, pushActionLog]);

  useEffect(() => {
    if (depositHash) {
      pushActionLog(
        'Deposit',
        'submitted',
        `Deposit tx submitted (${depositHash.slice(0, 10)}...${depositHash.slice(-6)})`
      );
    }
  }, [depositHash, pushActionLog]);

  useEffect(() => {
    if (withdrawHash) {
      pushActionLog(
        'Withdraw',
        'submitted',
        `Withdraw tx submitted (${withdrawHash.slice(0, 10)}...${withdrawHash.slice(-6)})`
      );
    }
  }, [withdrawHash, pushActionLog]);

  useEffect(() => {
    if (approveConfirmed) pushActionLog('Approve', 'confirmed', 'Approval confirmed onchain.');
  }, [approveConfirmed, pushActionLog]);

  useEffect(() => {
    if (!depositConfirmed) return;
    pushActionLog('Deposit', 'confirmed', 'Deposit confirmed onchain.');
    refetchShares();
    refetchMaxWithdraw();
    refetchTotalAssets();
  }, [depositConfirmed, pushActionLog, refetchShares, refetchMaxWithdraw, refetchTotalAssets]);

  useEffect(() => {
    if (!withdrawConfirmed) return;
    pushActionLog('Withdraw', 'confirmed', 'Withdrawal confirmed onchain.');
    refetchShares();
    refetchMaxWithdraw();
    refetchTotalAssets();
  }, [withdrawConfirmed, pushActionLog, refetchShares, refetchMaxWithdraw, refetchTotalAssets]);

  useEffect(() => {
    if (approveError) pushActionLog('Approve', 'failed', approveError.message || 'Approve failed.');
  }, [approveError, pushActionLog]);

  useEffect(() => {
    if (depositError) pushActionLog('Deposit', 'failed', depositError.message || 'Deposit failed.');
  }, [depositError, pushActionLog]);

  useEffect(() => {
    if (withdrawError) pushActionLog('Withdraw', 'failed', withdrawError.message || 'Withdraw failed.');
  }, [withdrawError, pushActionLog]);

  useEffect(() => {
    if (approveReceiptError) {
      pushActionLog('Approve', 'failed', approveReceiptError.message || 'Approve receipt failed.');
    }
  }, [approveReceiptError, pushActionLog]);

  useEffect(() => {
    if (depositReceiptError) {
      pushActionLog('Deposit', 'failed', depositReceiptError.message || 'Deposit receipt failed.');
    }
  }, [depositReceiptError, pushActionLog]);

  useEffect(() => {
    if (withdrawReceiptError) {
      pushActionLog('Withdraw', 'failed', withdrawReceiptError.message || 'Withdraw receipt failed.');
    }
  }, [withdrawReceiptError, pushActionLog]);

  const jumpToDepositSection = () => {
    if (!depositSectionRef.current) return;
    depositSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const prefillDepositFromOnboarding = (amount) => {
    if (!amount) return;
    setDepositAmount(String(amount));
  };

  const runExampleQuote = async () => {
    const desired = Number(exampleDesiredUsd);
    if (!Number.isFinite(desired) || desired <= 0) {
      setExampleError('Enter a valid desired amount (USD).');
      return;
    }
    if (!exampleCollateralId.trim()) {
      setExampleError(
        exampleChain === 'solana'
          ? 'Enter a Solana stream ID (or cached collateral ID) to simulate a quote.'
          : 'Enter a collateral ID to simulate a quote.'
      );
      return;
    }
    setExampleError('');
    setExampleState({ status: 'loading', offers: [], valuation: null, reason: '' });
    try {
      const payload = {
        chain: exampleChain === 'solana' ? 'solana' : 'base',
        desiredAmountUsd: desired,
        collateralId: exampleCollateralId.trim()
      };
      if (exampleChain === 'solana') {
        payload.streamId = exampleCollateralId.trim();
      }
      const result = await requestMatchQuote(payload);
      setExampleState({
        status: 'ready',
        offers: result?.offers || [],
        valuation: result?.valuation || null,
        reason: result?.reason || result?.note || ''
      });
    } catch (error) {
      setExampleState({ status: 'error', offers: [], valuation: null, reason: '' });
      setExampleError(error?.message || 'Unable to fetch example quote.');
    }
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1>Lender Pools</h1>
          <p className="muted">
            Supply USDC to the on-chain lending pool. Pool preferences below are advisory and only
            feed the offchain matcher; all loans draw from the single pool at its floating rate.
          </p>
          <div className="inline-actions" style={{ marginTop: 8 }}>
            <span className="chip">Lender mode</span>
            <div className="inline-actions" style={{ marginTop: 10 }}>
              <button className="button" type="button" onClick={() => navigate('/features')}>
                Lender model
              </button>
              <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=risk-models')}>
                Risk docs
              </button>
            </div>
          </div>
          <EssentialsPanel />
        </div>

        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Lender operating flow</h3>
              <div className="section-subtitle">Fund the pool, monitor utilization and rates</div>
            </div>
          </div>
          <div className="card-list">
            <div className="pill">Approve and deposit USDC into the ERC-4626 lending pool</div>
            <div className="pill">Earn a variable rate that follows pool utilization</div>
            <div className="pill">Track utilization, borrow demand, and liquidation outcomes</div>
            <div className="pill">Withdraw or redeem shares when idle liquidity allows</div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 24 }}>
          <div className="holo-card" style={{ border: '1px solid rgba(56, 189, 248, 0.4)' }}>
            <div className="section-head">
              <div>
                <h3 className="section-title" style={{ color: '#c4a26c' }}>Insurance Vault</h3>
                <div className="section-subtitle">Reserve-factor backstop</div>
              </div>
              <span className="tag" style={{ background: 'rgba(56,189,248,0.1)', color: '#c4a26c' }}>On-chain</span>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              The reserve-factor share of borrower interest
              ({reserveFactorBps !== undefined ? `${Number(reserveFactorBps) / 100}%` : '--'}) is routed to the
              Insurance Vault. If a liquidation auction recovers less than the debt, the vault covers
              the shortfall up to its balance; any remaining loss is shared by all lenders through the
              share price.
            </p>
            <div className="data-table" style={{ marginTop: 12 }}>
              <div className="table-row header">
                <div>Metric</div>
                <div>Value</div>
              </div>
              <div className="table-row">
                <div>Vault reserves</div>
                <div>{insuranceVault ? `${formatValue(insuranceBalance, 6)} USDC` : 'Not deployed on this chain'}</div>
              </div>
              <div className="table-row">
                <div>Shortfalls covered (all time)</div>
                <div>{insuranceVault ? `${formatValue(insuranceCovered, 6)} USDC` : '--'}</div>
              </div>
            </div>
          </div>

          <div className="holo-card">
            <div className="section-head">
              <div>
                <h3 className="section-title">Lender risk</h3>
                <div className="section-subtitle">What backs your deposit</div>
              </div>
            </div>
            <div className="card-list">
              <div className="pill">Loans are non-recourse: each loan is backed only by an escrowed vesting stream.</div>
              <div className="pill">Defaulted loans are sold in a Dutch auction; expected losses lower the share price when liquidation starts.</div>
              <div className="pill">Withdrawals are limited to idle liquidity; at high utilization you may need to wait for repayments.</div>
            </div>
          </div>
        </div>

        <SmartWalletOnboardingCard
          walletAddress={address}
          preferredWalletAddress={preferredOnboardingWallet}
          walletSource={walletSource}
          onOpenWallet={() => window.dispatchEvent(new CustomEvent('crdt-open-wallet-modal'))}
          onSmartWalletChange={setSmartWalletAddress}
          onPrefillDeposit={prefillDepositFromOnboarding}
          onJumpToDeposit={jumpToDepositSection}
        />

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
                Min liquidity (USD, advisory)
                <input
                  className="form-input"
                  value={minLiquidityUsd}
                  onChange={(event) => setMinLiquidityUsd(event.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                />
              </label>
              <label className="form-field">
                Min wallet age (days, advisory)
                <input
                  className="form-input"
                  value={minWalletAgeDays}
                  onChange={(event) => setMinWalletAgeDays(event.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                />
              </label>
              <label className="form-field">
                Min volume (USD, advisory)
                <input
                  className="form-input"
                  value={minVolumeUsd}
                  onChange={(event) => setMinVolumeUsd(event.target.value)}
                  inputMode="numeric"
                  placeholder="0"
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
                Token categories (comma-separated)
                <input
                  className="form-input"
                  value={tokenCategories}
                  onChange={(event) => setTokenCategories(event.target.value)}
                  placeholder="seed, private, public"
                />
              </label>
              <label className="form-field">
                Allowed tokens (comma-separated addresses)
                <input
                  className="form-input"
                  value={allowedTokens}
                  onChange={(event) => setAllowedTokens(event.target.value)}
                  placeholder="0x...,0x..."
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
              <button
                className="button"
                data-guide-id="lender-create-pool"
                onClick={handleCreatePool}
                disabled={saveState === 'saving'}
              >
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
                    <div data-label="Name">{pool.name}</div>
                    <div data-label="Chain">{pool.chain || 'multi-chain'}</div>
                    <div data-label="Risk">{pool.preferences?.riskTier || 'balanced'}</div>
                    <div data-label="Max LTV">{pool.preferences?.maxLtvBps || '--'}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="card-list">
              <div className="pill">Base settlement live; Solana offers are advisory.</div>
              <div className="pill">Pool preferences are enforced offchain for this MVP.</div>
            </div>

            <div className="holo-card" style={{ marginTop: 14 }}>
              <div className="section-head">
                <div>
                  <h4 className="section-title">Example Offers (Matcher)</h4>
                  <div className="section-subtitle">
                    Simulate how the matcher responds for a given collateral ID / stream.
                  </div>
                </div>
                <span className="tag">Offchain</span>
              </div>
              {exampleError && <div className="error-banner">{exampleError}</div>}
              <div className="form-grid">
                <label className="form-field">
                  Chain
                  <select
                    className="form-select"
                    value={exampleChain}
                    onChange={(e) => setExampleChain(e.target.value)}
                  >
                    <option value="base">Base</option>
                    <option value="solana">Solana (advisory)</option>
                  </select>
                </label>
                <label className="form-field">
                  {exampleChain === 'solana' ? 'Stream ID / collateral ID' : 'Collateral ID'}
                  <input
                    className="form-input"
                    value={exampleCollateralId}
                    onChange={(e) => setExampleCollateralId(e.target.value)}
                    placeholder={exampleChain === 'solana' ? 'Enter stream id' : 'Enter collateral id'}
                  />
                </label>
                <label className="form-field">
                  Desired amount (USD)
                  <input
                    className="form-input"
                    value={exampleDesiredUsd}
                    onChange={(e) => setExampleDesiredUsd(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
              <div className="inline-actions">
                <button
                  className="button ghost"
                  type="button"
                  onClick={runExampleQuote}
                  disabled={exampleState.status === 'loading'}
                >
                  {exampleState.status === 'loading' ? 'Matching…' : 'Fetch example offers'}
                </button>
                {exampleState?.reason ? <div className="muted">{exampleState.reason}</div> : null}
              </div>
              {exampleState.status === 'ready' && exampleState.valuation && (
                <div className="card-list" style={{ marginTop: 10 }}>
                  <div className="pill">
                    PV: ${Number(exampleState.valuation.pvUsd || 0).toFixed(2)}
                  </div>
                  <div className="pill">LTV: {Number(exampleState.valuation.ltvBps || 0)} bps</div>
                </div>
              )}
              {exampleState.status === 'ready' && exampleState.offers?.length > 0 && (
                <div className="data-table" style={{ marginTop: 10 }}>
                  <div className="table-row header">
                    <div>Pool</div>
                    <div>Risk</div>
                    <div>Interest</div>
                    <div>Max</div>
                  </div>
                  {exampleState.offers.map((offer) => (
                    <div key={offer.offerId} className={`table-row ${offer.canAccess === false ? 'muted' : ''}`}>
                      <div>{offer.poolName || offer.poolId?.slice(0, 8)}...</div>
                      <div>{offer.riskTier || '--'}</div>
                      <div>{Number(offer.interestBps || 0)} bps</div>
                      <div>${Number(offer.maxBorrowUsd || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
              {exampleState.status === 'ready' && (!exampleState.offers || exampleState.offers.length === 0) && (
                <div className="muted" style={{ marginTop: 10 }}>
                  No offers returned for that collateral / stream.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="holo-card" ref={depositSectionRef}>
            <div className="section-head">
              <div>
                <h3 className="section-title">Deposit Liquidity</h3>
                <div className="section-subtitle">
                  USDC is deposited into the ERC-4626 lending pool; you receive vault shares whose
                  value grows as borrowers pay interest.
                </div>
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
                Your position
                <div className="form-value">{formatValue(walletShareAssets, 6)} USDC</div>
                <div className="muted">{formatValue(walletShares, 6)} vault shares</div>
              </label>
              <label className="form-field">
                Withdrawable now
                <div className="form-value">{formatValue(maxWithdrawable, 6)} USDC</div>
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
                data-guide-id="lender-approve"
                onClick={handleApprove}
                disabled={!depositUnits || isApprovePending || approveMining}
              >
                {approveMining || isApprovePending ? 'Approving...' : 'Approve'}
              </button>
              <button
                className="button"
                type="button"
                data-guide-id="lender-deposit"
                onClick={handleDeposit}
                disabled={
                  !depositUnits ||
                  !allowanceEnough ||
                  isDepositPending ||
                  depositMining
                }
              >
                {depositMining || isDepositPending ? 'Depositing...' : 'Deposit'}
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={handleWithdraw}
                disabled={
                  !withdrawUnits ||
                  !withdrawEnough ||
                  isWithdrawPending ||
                  withdrawMining
                }
              >
                {withdrawMining || isWithdrawPending ? 'Withdrawing...' : 'Withdraw'}
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={handleRedeemAll}
                disabled={!walletShares || isWithdrawPending || withdrawMining}
              >
                Redeem all shares
              </button>
              <div className="muted">
                {allowanceEnough ? 'Allowance ready.' : 'Approve USDC before depositing.'}
              </div>
            </div>

            <div className="holo-card" style={{ marginTop: 14 }}>
              <div className="section-head">
                <div>
                  <h4 className="section-title">Estimated returns</h4>
                  <div className="section-subtitle">
                    Simple projections for staying deposited. Estimates only; not guaranteed.
                  </div>
                </div>
                <span className="tag">Estimate</span>
              </div>
              {projectionState.status === 'idle' && (
                <div className="muted">Enter a deposit amount to see projections.</div>
              )}
              {projectionState.status === 'loading' && (
                <div className="muted">Calculating projections…</div>
              )}
              {projectionState.status === 'error' && (
                <div className="error-banner">{projectionState.error}</div>
              )}
              {projectionState.status === 'ready' && projectionState.data?.projections && (
                <>
                  <div className="card-list">
                    {projectionState.data.projections.map((p) => {
                      const years = Number(p.years || 0);
                      const label =
                        years <= 0.09
                          ? '1 month'
                          : years === 1
                            ? '1 year'
                            : years === 4
                              ? '4 years'
                              : `${years} years`;
                      return (
                        <div key={String(p.years)} className="pill">
                          {label}: ${formatUsd(p.estimatedTotalUsd)} total (${formatUsd(p.estimatedNetInterestUsd)} est. interest)
                        </div>
                      );
                    })}
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>
                    {projectionState.data?.disclaimer ||
                      'Estimates only. Actual returns depend on utilization, borrower demand, and realized repayments.'}
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>
                    Liquidity risk: withdrawals can be delayed if the pool is fully utilized.
                  </div>
                </>
              )}
            </div>

            <div className="action-log-panel" data-testid="lender-action-log">
              <div className="section-head">
                <div>
                  <h4 className="section-title">Action Log</h4>
                  <div className="section-subtitle">
                    Records each lender button action with status and details.
                  </div>
                </div>
                <span className="tag">{actionLogs.length} events</span>
              </div>
              {!actionLogs.length && (
                <div className="muted">No actions yet. Approve/Deposit/Withdraw to log events.</div>
              )}
              {actionLogs.length > 0 && (
                <div className="action-log-list" role="log" aria-live="polite" aria-relevant="additions">
                  {actionLogs.map((log) => (
                    <div key={log.id} className={`action-log-item action-log-item--${log.status}`}>
                      <div className="action-log-head">
                        <span className="action-log-action">{log.action}</span>
                        <span className="action-log-status">{log.status}</span>
                        <span className="action-log-time">{log.at}</span>
                      </div>
                      <div className="action-log-message">{log.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="holo-card">
            <div className="section-head">
              <div>
                <h3 className="section-title">Portfolio (privacy-lite)</h3>
                <div className="section-subtitle">
                  Aggregate-only metrics. No borrower or token identifiers are shown here.
                </div>
              </div>
              <span className="tag">Live</span>
            </div>
            {portfolioLightState.status === 'loading' && <div className="muted">Loading aggregates…</div>}
            {portfolioLightState.status === 'error' && (
              <div className="error-banner">{portfolioLightState.error}</div>
            )}
            <div className="card-list">
              <div className="pill">Total pool assets: {formatValue(totalAssets, 6)} USDC</div>
              <div className="pill">Total borrowed: {formatValue(totalBorrowed, 6)} USDC</div>
              <div className="pill">Available liquidity: {formatValue(availableLiquidity, 6)} USDC</div>
              <div className="pill">
                Utilization: {utilizationBps !== undefined ? `${(Number(utilizationBps) / 100).toFixed(2)}%` : '--'}
              </div>
              <div className="pill">
                Borrow rate (floating): {borrowRateBps !== undefined ? `${(Number(borrowRateBps) / 100).toFixed(2)}%` : '--'}
              </div>
              <div className="pill">
                Supply APY (variable): {supplyApyPct !== null ? `${supplyApyPct.toFixed(2)}%` : '--'}
              </div>
              {portfolioLightState.status === 'ready' && portfolioLightState.data?.exposure && (
                <>
                  <div className="pill">
                    Exposure (all tokens): ${formatUsd(portfolioLightState.data.exposure.totalExposureUsd)}
                  </div>
                  <div className="pill">
                    Flagged exposure: ${formatUsd(portfolioLightState.data.exposure.flaggedExposureUsd)} (
                    {Math.round(Number(portfolioLightState.data.exposure.flaggedExposureShare || 0) * 100)}%)
                  </div>
                  <div className="pill">
                    Maturity sample: {portfolioLightState.data?.maturity?.sampleCount ?? 0} loans (recent sample)
                  </div>
                </>
              )}
            </div>
            {portfolioLightState.status === 'ready' && portfolioLightState.data?.maturity?.buckets && (
              <div className="card-list" style={{ marginTop: 10 }}>
                <div className="pill">Unlock &lt; 30d: {portfolioLightState.data.maturity.buckets.lt30d}</div>
                <div className="pill">30-180d: {portfolioLightState.data.maturity.buckets['30to180d']}</div>
                <div className="pill">180-365d: {portfolioLightState.data.maturity.buckets['180to365d']}</div>
                <div className="pill">&gt; 365d: {portfolioLightState.data.maturity.buckets.gt365d}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
