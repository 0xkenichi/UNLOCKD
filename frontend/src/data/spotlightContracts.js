export const spotlightContracts = [
  {
    id: 'spotlight-1',
    niche: 'DeSci',
    project: 'Example DeSci Protocol',
    token: 'DSCI',
    tokenAddress: '',
    stage: 'Live vesting',
    vestingDate: '2026-03-15',
    riskRating: 'Medium',
    rationale:
      'Strong on-chain escrow history and transparent vesting schedule; moderate liquidity.',
    metrics: {
      vestingSizeUsd: 8200000,
      liquidityUsd: 12500000,
      daysToUnlock: 42,
      historicalUnlocks: 3
    },
    tokenomics: {
      supply: '1,000,000,000',
      float: '18%',
      fdv: '$420M'
    },
    evidence: {
      escrowTx: 'Pending indexer link',
      wallet: 'Pending wallet proof',
      tokenomics: 'Pending disclosure'
    }
  },
  {
    id: 'spotlight-2',
    niche: 'DePIN',
    project: 'Example DePIN Network',
    token: 'DPIN',
    tokenAddress: '',
    stage: 'Live vesting',
    vestingDate: '2026-02-21',
    riskRating: 'Low',
    rationale:
      'Consistent vesting releases and verifiable treasury wallet activity.',
    metrics: {
      vestingSizeUsd: 5400000,
      liquidityUsd: 22000000,
      daysToUnlock: 18,
      historicalUnlocks: 6
    },
    tokenomics: {
      supply: '500,000,000',
      float: '26%',
      fdv: '$310M'
    },
    evidence: {
      escrowTx: 'Pending indexer link',
      wallet: 'Pending wallet proof',
      tokenomics: 'Pending disclosure'
    }
  },
  {
    id: 'spotlight-3',
    niche: 'AI',
    project: 'Example AI Protocol',
    token: 'AIX',
    tokenAddress: '',
    stage: 'Live vesting',
    vestingDate: '2026-04-10',
    riskRating: 'Medium',
    rationale:
      'High demand token with transparent emission curve; liquidity risk to monitor.',
    metrics: {
      vestingSizeUsd: 12000000,
      liquidityUsd: 14000000,
      daysToUnlock: 68,
      historicalUnlocks: 2
    },
    tokenomics: {
      supply: '750,000,000',
      float: '22%',
      fdv: '$510M'
    },
    evidence: {
      escrowTx: 'Pending indexer link',
      wallet: 'Pending wallet proof',
      tokenomics: 'Pending disclosure'
    }
  },
  {
    id: 'spotlight-4',
    niche: 'AGI',
    project: 'Example AGI Compute',
    token: 'AGI',
    tokenAddress: '',
    stage: 'Live vesting',
    vestingDate: '2026-05-02',
    riskRating: 'High',
    rationale:
      'Newer token with strong unlock schedule clarity; higher volatility risk.',
    metrics: {
      vestingSizeUsd: 18000000,
      liquidityUsd: 8000000,
      daysToUnlock: 90,
      historicalUnlocks: 1
    },
    tokenomics: {
      supply: '2,000,000,000',
      float: '12%',
      fdv: '$670M'
    },
    evidence: {
      escrowTx: 'Pending indexer link',
      wallet: 'Pending wallet proof',
      tokenomics: 'Pending disclosure'
    }
  },
  {
    id: 'spotlight-5',
    niche: 'DeSoc',
    project: 'Example DeSoc Community',
    token: 'SOC',
    tokenAddress: '',
    stage: 'Live vesting',
    vestingDate: '2026-02-28',
    riskRating: 'Medium',
    rationale:
      'Healthy vesting cadence and community wallet transparency; moderate liquidity.',
    metrics: {
      vestingSizeUsd: 6100000,
      liquidityUsd: 9800000,
      daysToUnlock: 25,
      historicalUnlocks: 4
    },
    tokenomics: {
      supply: '900,000,000',
      float: '20%',
      fdv: '$240M'
    },
    evidence: {
      escrowTx: 'Pending indexer link',
      wallet: 'Pending wallet proof',
      tokenomics: 'Pending disclosure'
    }
  },
  {
    id: 'spotlight-6',
    niche: 'DeFi',
    project: 'Example DeFi Vault',
    token: 'DFI',
    tokenAddress: '',
    stage: 'Live vesting',
    vestingDate: '2026-03-01',
    riskRating: 'Low',
    rationale:
      'Long-standing protocol with transparent treasury and vesting history.',
    metrics: {
      vestingSizeUsd: 4500000,
      liquidityUsd: 32000000,
      daysToUnlock: 27,
      historicalUnlocks: 8
    },
    tokenomics: {
      supply: '300,000,000',
      float: '35%',
      fdv: '$180M'
    },
    evidence: {
      escrowTx: 'Pending indexer link',
      wallet: 'Pending wallet proof',
      tokenomics: 'Pending disclosure'
    }
  }
];

export const upcomingVestings = [
  {
    id: 'upcoming-1',
    project: 'Example DePIN Network',
    token: 'DPIN',
    type: 'Vesting unlock',
    expectedDate: '2026-02-21',
    notes: 'Scheduled tranche unlock (requires on-chain confirmation).'
  },
  {
    id: 'upcoming-2',
    project: 'Example DeSci Protocol',
    token: 'DSCI',
    type: 'Vesting unlock',
    expectedDate: '2026-03-15',
    notes: 'Next unlock with escrowed tranche.'
  },
  {
    id: 'upcoming-3',
    project: 'Example Pre-TGE AI',
    token: 'AIX',
    type: 'Pre-TGE',
    expectedDate: 'TBD',
    notes: 'Pre-TGE contract under review for eligibility.'
  },
  {
    id: 'upcoming-4',
    project: 'Example AGI Compute',
    token: 'AGI',
    type: 'Pre-TGE',
    expectedDate: 'TBD',
    notes: 'Pre-TGE vesting contract with transparent wallet proof pending.'
  }
];
