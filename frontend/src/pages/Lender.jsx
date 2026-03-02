import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { decodeEventLog } from 'viem';
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
import { getContractAddress, lendingPoolAbi, termVaultAbi, usdcAbi } from '../utils/contracts.js';
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
  const termVault = getContractAddress(chainId, 'termVault');
  const usdc = getContractAddress(chainId, 'usdc');
  const [pools, setPools] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [termDepositAmount, setTermDepositAmount] = useState('');
  const [termTrancheId, setTermTrancheId] = useState('0');
  const [termPositionId, setTermPositionId] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState('');
  const [updateState, setUpdateState] = useState('idle');
  const [actionLogs, setActionLogs] = useState([]);
  const [projectionState, setProjectionState] = useState({ status: 'idle', data: null, error: '' });
  const [portfolioLightState, setPortfolioLightState] = useState({ status: 'idle', data: null, error: '' });
  const [termVaultRequestState, setTermVaultRequestState] = useState({ status: 'idle', error: '' });

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
  const termDepositUnits = useMemo(() => toUnits(termDepositAmount, 6), [termDepositAmount]);

  const formatUsd = useCallback((value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }, []);

  const submitTermVaultRequest = async () => {
    setTermVaultRequestState({ status: 'submitting', error: '' });
    try {
      await requestChainSupport({
        chainId,
        feature: 'term_vault',
        page: 'lender',
        walletAddress: address || undefined,
        message: 'User requested TermVault deployment on this chain'
      });
      setTermVaultRequestState({ status: 'submitted', error: '' });
    } catch (error) {
      setTermVaultRequestState({ status: 'error', error: error?.message || 'Unable to submit request' });
    }
  };

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

  const { data: termAllowance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'allowance',
    args: [
      address || '0x0000000000000000000000000000000000000000',
      termVault || '0x0000000000000000000000000000000000000000'
    ],
    query: { enabled: Boolean(usdc && termVault && address) }
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

  const { data: termRewardBudget } = useReadContract({
    address: termVault,
    abi: termVaultAbi,
    functionName: 'availableRewardBudget',
    query: { enabled: Boolean(termVault) }
  });

  const { data: tranche0 } = useReadContract({
    address: termVault,
    abi: termVaultAbi,
    functionName: 'tranches',
    args: [0],
    query: { enabled: Boolean(termVault) }
  });
  const { data: tranche1 } = useReadContract({
    address: termVault,
    abi: termVaultAbi,
    functionName: 'tranches',
    args: [1],
    query: { enabled: Boolean(termVault) }
  });
  const { data: tranche2 } = useReadContract({
    address: termVault,
    abi: termVaultAbi,
    functionName: 'tranches',
    args: [2],
    query: { enabled: Boolean(termVault) }
  });
  const { data: tranche3 } = useReadContract({
    address: termVault,
    abi: termVaultAbi,
    functionName: 'tranches',
    args: [3],
    query: { enabled: Boolean(termVault) }
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

  const {
    data: approveTermHash,
    writeContract: writeApproveTerm,
    isPending: isApproveTermPending,
    error: approveTermError
  } = useWriteContract();

  const {
    data: termActionHash,
    writeContract: writeTermAction,
    isPending: isTermActionPending,
    error: termActionError
  } = useWriteContract();

  // When we call `depositTerm`, the returned hash can be correlated with the next
  // position id for this client session so the user can manage the position.
  const [lastTermPositionId, setLastTermPositionId] = useState(null);

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

  const {
    isLoading: approveTermMining,
    isSuccess: approveTermConfirmed,
    error: approveTermReceiptError
  } = useWaitForTransactionReceipt({ hash: approveTermHash });

  const {
    isLoading: termActionMining,
    isSuccess: termActionConfirmed,
    data: termActionReceipt,
    error: termActionReceiptError
  } = useWaitForTransactionReceipt({ hash: termActionHash });

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
      args: [depositUnits]
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
      setError('Withdraw amount exceeds your pool deposits.');
      pushActionLog('Withdraw', 'blocked', 'Insufficient pool deposits for withdrawal.');
      return;
    }
    pushActionLog('Withdraw', 'started', `Submitting withdrawal for ${withdrawAmount} USDC`);
    writeWithdraw({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'withdraw',
      args: [withdrawUnits]
    });
  };

  const handleTermApprove = () => {
    if (!address) {
      const msg = smartWalletAddress
        ? 'Smart wallet connected. Connect an EVM wallet to execute term vault actions in this MVP.'
        : 'Connect wallet first.';
      setError(msg);
      pushActionLog('Approve (Term)', 'blocked', msg);
      return;
    }
    if (!usdc || !termVault) {
      const msg = 'Term vault is not deployed for this chain yet.';
      setError(msg);
      pushActionLog('Approve (Term)', 'blocked', msg);
      return;
    }
    if (!termDepositUnits) {
      const msg = 'Enter a valid term deposit amount.';
      setError(msg);
      pushActionLog('Approve (Term)', 'blocked', msg);
      return;
    }
    pushActionLog('Approve (Term)', 'started', `Submitting approval for ${termDepositAmount} USDC`);
    writeApproveTerm({
      address: usdc,
      abi: usdcAbi,
      functionName: 'approve',
      args: [termVault, termDepositUnits]
    });
  };

  const handleTermDeposit = () => {
    if (!address) {
      const msg = smartWalletAddress
        ? 'Smart wallet connected. Connect an EVM wallet to execute term vault actions in this MVP.'
        : 'Connect wallet first.';
      setError(msg);
      pushActionLog('Term vault', 'blocked', msg);
      return;
    }
    if (!termVault || !termDepositUnits) {
      const msg = 'Unsupported network or invalid term amount.';
      setError(msg);
      pushActionLog('Term vault', 'blocked', msg);
      return;
    }
    if (!termAllowanceEnough) {
      const msg = 'Approve USDC for the term vault before depositing.';
      setError(msg);
      pushActionLog('Term vault', 'blocked', msg);
      return;
    }
    pushActionLog('Term vault', 'started', `Depositing ${termDepositAmount} USDC into tranche ${termTrancheId}`);
    // Best-effort UX hint: current `nextPositionId` is not exposed, so we show the
    // position id returned by the tx receipt (if decoded by the wallet UI) or let
    // the user paste it. This local hint is still useful for most flows.
    setLastTermPositionId(null);
    writeTermAction({
      address: termVault,
      abi: termVaultAbi,
      functionName: 'depositTerm',
      args: [Number(termTrancheId), termDepositUnits]
    });
  };

  const parsePositionId = () => {
    try {
      if (!termPositionId.trim()) return null;
      return BigInt(termPositionId.trim());
    } catch {
      return null;
    }
  };

  const handleTermClaim = () => {
    const id = parsePositionId();
    if (id === null) {
      const msg = 'Enter a valid position id.';
      setError(msg);
      pushActionLog('Term vault', 'blocked', msg);
      return;
    }
    pushActionLog('Term vault', 'started', `Claiming interest for position ${termPositionId}`);
    writeTermAction({
      address: termVault,
      abi: termVaultAbi,
      functionName: 'claimInterest',
      args: [id]
    });
  };

  const handleTermWithdrawMatured = () => {
    const id = parsePositionId();
    if (id === null) {
      const msg = 'Enter a valid position id.';
      setError(msg);
      pushActionLog('Term vault', 'blocked', msg);
      return;
    }
    pushActionLog('Term vault', 'started', `Withdrawing at maturity for position ${termPositionId}`);
    writeTermAction({
      address: termVault,
      abi: termVaultAbi,
      functionName: 'withdrawAtMaturity',
      args: [id]
    });
  };

  const handleTermEarlyWithdraw = () => {
    const id = parsePositionId();
    if (id === null) {
      const msg = 'Enter a valid position id.';
      setError(msg);
      pushActionLog('Term vault', 'blocked', msg);
      return;
    }
    pushActionLog('Term vault', 'started', `Early withdrawal for position ${termPositionId}`);
    writeTermAction({
      address: termVault,
      abi: termVaultAbi,
      functionName: 'earlyWithdraw',
      args: [id]
    });
  };

  const allowanceEnough =
    allowance !== null && allowance !== undefined && depositUnits
      ? allowance >= depositUnits
      : false;
  const termAllowanceEnough =
    termAllowance !== null && termAllowance !== undefined && termDepositUnits
      ? termAllowance >= termDepositUnits
      : false;
  const withdrawEnough =
    walletDeposits !== null && walletDeposits !== undefined && withdrawUnits
      ? walletDeposits >= withdrawUnits
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
    if (approveTermHash) {
      pushActionLog(
        'Approve (Term)',
        'submitted',
        `Term vault approval tx submitted (${approveTermHash.slice(0, 10)}...${approveTermHash.slice(-6)})`
      );
    }
  }, [approveTermHash, pushActionLog]);

  useEffect(() => {
    if (termActionHash) {
      pushActionLog(
        'Term vault',
        'submitted',
        `Term vault tx submitted (${termActionHash.slice(0, 10)}...${termActionHash.slice(-6)})`
      );
    }
  }, [termActionHash, pushActionLog]);

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
    if (approveTermConfirmed) {
      pushActionLog('Approve (Term)', 'confirmed', 'Term vault approval confirmed onchain.');
    }
  }, [approveTermConfirmed, pushActionLog]);

  useEffect(() => {
    if (depositConfirmed) pushActionLog('Deposit', 'confirmed', 'Deposit confirmed onchain.');
  }, [depositConfirmed, pushActionLog]);

  useEffect(() => {
    if (withdrawConfirmed) pushActionLog('Withdraw', 'confirmed', 'Withdrawal confirmed onchain.');
  }, [withdrawConfirmed, pushActionLog]);

  useEffect(() => {
    if (termActionConfirmed) {
      pushActionLog('Term vault', 'confirmed', 'Term vault tx confirmed onchain.');
    }
  }, [termActionConfirmed, pushActionLog]);

  useEffect(() => {
    if (!termActionReceipt?.logs?.length) return;
    // Best-effort decode of `TermDeposited` to surface the position id in-app.
    try {
      for (const log of termActionReceipt.logs) {
        const decoded = decodeEventLog({
          abi: [
            {
              type: 'event',
              name: 'TermDeposited',
              inputs: [
                { name: 'positionId', type: 'uint256', indexed: true },
                { name: 'owner', type: 'address', indexed: true },
                { name: 'trancheId', type: 'uint32', indexed: true },
                { name: 'amount', type: 'uint256', indexed: false }
              ]
            }
          ],
          data: log.data,
          topics: log.topics
        });
        if (decoded?.eventName === 'TermDeposited') {
          const positionId = decoded.args?.positionId;
          if (positionId !== undefined && positionId !== null) {
            const asString = typeof positionId === 'bigint' ? positionId.toString() : String(positionId);
            setLastTermPositionId(asString);
            setTermPositionId(asString);
            break;
          }
        }
      }
    } catch {
      // ignore
    }
  }, [termActionReceipt]);

  useEffect(() => {
    if (approveError) pushActionLog('Approve', 'failed', approveError.message || 'Approve failed.');
  }, [approveError, pushActionLog]);

  useEffect(() => {
    if (approveTermError) {
      pushActionLog('Approve (Term)', 'failed', approveTermError.message || 'Approve failed.');
    }
  }, [approveTermError, pushActionLog]);

  useEffect(() => {
    if (depositError) pushActionLog('Deposit', 'failed', depositError.message || 'Deposit failed.');
  }, [depositError, pushActionLog]);

  useEffect(() => {
    if (withdrawError) pushActionLog('Withdraw', 'failed', withdrawError.message || 'Withdraw failed.');
  }, [withdrawError, pushActionLog]);

  useEffect(() => {
    if (termActionError) {
      pushActionLog('Term vault', 'failed', termActionError.message || 'Term vault tx failed.');
    }
  }, [termActionError, pushActionLog]);

  useEffect(() => {
    if (approveReceiptError) {
      pushActionLog('Approve', 'failed', approveReceiptError.message || 'Approve receipt failed.');
    }
  }, [approveReceiptError, pushActionLog]);

  useEffect(() => {
    if (approveTermReceiptError) {
      pushActionLog('Approve (Term)', 'failed', approveTermReceiptError.message || 'Approve receipt failed.');
    }
  }, [approveTermReceiptError, pushActionLog]);

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

  useEffect(() => {
    if (termActionReceiptError) {
      pushActionLog('Term vault', 'failed', termActionReceiptError.message || 'Tx receipt failed.');
    }
  }, [termActionReceiptError, pushActionLog]);

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
            Configure liquidity pools and matching preferences. Advisory matching active based
            on risk tier parameter sets.
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
              <button className="button ghost" type="button" onClick={() => navigate('/community-pools')}>
                Community pools
              </button>
            </div>
          </div>
          <EssentialsPanel />
        </div>

        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Lender operating flow</h3>
              <div className="section-subtitle">Configure appetite, fund pool, monitor utilization</div>
            </div>
          </div>
          <div className="card-list">
            <div className="pill">Set risk tier, LTV bounds, and borrower access policy</div>
            <div className="pill">Approve and deposit USDC to activate supply</div>
            <div className="pill">Track utilization, borrow demand, and settlement outcomes</div>
            <div className="pill">Iterate pool preferences as market and collateral mix evolves</div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 24 }}>
          <div className="holo-card" style={{ border: '1px solid rgba(56, 189, 248, 0.4)' }}>
            <div className="section-head">
              <div>
                <h3 className="section-title" style={{ color: '#38bdf8' }}>Institutional Insurance Vault</h3>
                <div className="section-subtitle">Vestra Core Protection</div>
              </div>
              <span className="tag" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>Active</span>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              A portion of all protocol yields are routed to the Insurance Vault.
              If a borrower defaults and secondary asset sweeps fail to cover the full deficit,
              the Vault automatically covers the difference for lenders.
            </p>
            <div className="data-table" style={{ marginTop: 12 }}>
              <div className="table-row header">
                <div>Metric</div>
                <div>Value</div>
              </div>
              <div className="table-row">
                <div>Total Vault Reserves</div>
                <div>$50,000.00 USDC</div>
              </div>
              <div className="table-row">
                <div>Deficits Covered (30d)</div>
                <div>$0.00</div>
              </div>
            </div>
          </div>

          <div className="holo-card" style={{ border: '1px solid rgba(255, 77, 79, 0.4)' }}>
            <div className="section-head">
              <div>
                <h3 className="section-title" style={{ color: '#ff4d4f' }}>Strict Recourse Sweeper</h3>
                <div className="section-subtitle">Omega AI Risk Agent</div>
              </div>
              <span className="tag danger">Active</span>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Lending on Vestra is strictly <strong>full-recourse</strong>. If a borrower defaults on an underwater loan,
              the Omega AI agent automatically penalizes the borrower and seizes reserve assets (WETH/USDC) directly from their wallet.
            </p>
            <div className="data-table" style={{ marginTop: 12 }}>
              <div className="table-row header">
                <div>Metric</div>
                <div>Status</div>
              </div>
              <div className="table-row">
                <div>Agent Heartbeat</div>
                <div style={{ color: '#52c41a' }}>Online</div>
              </div>
              <div className="table-row">
                <div>Active Bounties</div>
                <div>0</div>
              </div>
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

            <div className="holo-card" style={{ marginTop: 14 }}>
              <div className="section-head">
                <div>
                  <h4 className="section-title">Fixed-term tranches (minimum return)</h4>
                  <div className="section-subtitle">
                    Treasury-prefunded minimum returns. Deposits revert if reward budget is insufficient.
                  </div>
                </div>
                <span className="tag">Term vault</span>
              </div>

              {!termVault && (
                <>
                  <div className="muted">
                    Term vault is not deployed on this chain yet. Set `VITE_TERMVAULT_ADDRESS` (or `VITE_TERMVAULT_ADDRESS_{chainId}`) once deployed.
                  </div>
                  {termVaultRequestState.status === 'error' && (
                    <div className="error-banner" style={{ marginTop: 10 }}>
                      {termVaultRequestState.error}
                    </div>
                  )}
                  <div className="inline-actions" style={{ marginTop: 10 }}>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={submitTermVaultRequest}
                      disabled={termVaultRequestState.status === 'submitting' || termVaultRequestState.status === 'submitted'}
                    >
                      {termVaultRequestState.status === 'submitted'
                        ? 'Request submitted'
                        : termVaultRequestState.status === 'submitting'
                          ? 'Submitting…'
                          : 'Request chain support'}
                    </button>
                  </div>
                </>
              )}

              {termVault && (
                <>
                  {(approveTermError || termActionError) && (
                    <div className="error-banner">{approveTermError?.message || termActionError?.message}</div>
                  )}
                  <div className="form-grid">
                    <label className="form-field">
                      Term deposit amount (USDC)
                      <input
                        className="form-input"
                        value={termDepositAmount}
                        onChange={(event) => setTermDepositAmount(event.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                    <label className="form-field">
                      Tranche
                      <select
                        className="form-select"
                        value={termTrancheId}
                        onChange={(event) => setTermTrancheId(event.target.value)}
                      >
                        <option value="0">
                          1 month (min APY: {tranche0 ? `${Number(tranche0[1] || 0)} bps` : '--'})
                        </option>
                        <option value="1">
                          1 year (min APY: {tranche1 ? `${Number(tranche1[1] || 0)} bps` : '--'})
                        </option>
                        <option value="2">
                          4 years (min APY: {tranche2 ? `${Number(tranche2[1] || 0)} bps` : '--'})
                        </option>
                        <option value="3">
                          5 years (min APY: {tranche3 ? `${Number(tranche3[1] || 0)} bps` : '--'})
                        </option>
                      </select>
                    </label>
                    <label className="form-field">
                      Reward budget (USDC)
                      <div className="form-value">{formatValue(termRewardBudget, 6)}</div>
                    </label>
                  </div>
                  <div className="inline-actions">
                    <button
                      className="button ghost"
                      type="button"
                      onClick={handleTermApprove}
                      disabled={!termDepositUnits || isApproveTermPending || approveTermMining}
                    >
                      {approveTermMining || isApproveTermPending ? 'Approving…' : 'Approve (term)'}
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={handleTermDeposit}
                      disabled={!termDepositUnits || !termAllowanceEnough || isTermActionPending || termActionMining}
                    >
                      {termActionMining || isTermActionPending ? 'Depositing…' : 'Deposit (term)'}
                    </button>
                    <div className="muted">
                      {termAllowanceEnough ? 'Allowance ready.' : 'Approve USDC for term vault before depositing.'}
                    </div>
                  </div>

                  <div className="holo-card" style={{ marginTop: 12 }}>
                    <div className="section-head">
                      <div>
                        <h4 className="section-title">Manage a position</h4>
                        <div className="section-subtitle">Use your position id from the deposit tx.</div>
                      </div>
                      <span className="tag">Actions</span>
                    </div>
                    {lastTermPositionId && (
                      <div className="pill" style={{ marginBottom: 10 }}>
                        Latest position id: {lastTermPositionId}
                      </div>
                    )}
                    <div className="form-grid">
                      <label className="form-field">
                        Position id
                        <input
                          className="form-input"
                          value={termPositionId}
                          onChange={(event) => setTermPositionId(event.target.value)}
                          inputMode="numeric"
                          placeholder="0"
                        />
                      </label>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="button ghost"
                        type="button"
                        onClick={handleTermClaim}
                        disabled={!termPositionId || isTermActionPending || termActionMining}
                      >
                        Claim interest
                      </button>
                      <button
                        className="button ghost"
                        type="button"
                        onClick={handleTermWithdrawMatured}
                        disabled={!termPositionId || isTermActionPending || termActionMining}
                      >
                        Withdraw at maturity
                      </button>
                      <button
                        className="button ghost"
                        type="button"
                        onClick={handleTermEarlyWithdraw}
                        disabled={!termPositionId || isTermActionPending || termActionMining}
                      >
                        Early withdraw (fee)
                      </button>
                    </div>
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
              <div className="pill">Total deposits: {formatValue(totalDeposits, 6)} USDC</div>
              <div className="pill">Total borrowed: {formatValue(totalBorrowed, 6)} USDC</div>
              <div className="pill">
                Utilization: {utilizationRate ? `${Number(utilizationRate) / 100}%` : '--'}
              </div>
              <div className="pill">
                Current pool rate: {poolRate ? `${Number(poolRate)} bps` : '--'}
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
