const { z } = require('zod');
const { ethers } = require('ethers');
const { 
  normalizeEmail, 
  normalizeWalletAddress 
} = require('./utils');

const stringField = (max) => z.string().trim().min(1).max(max);
const optionalString = (max) => z.string().trim().max(max).optional();

const optionalEmail = (max) =>
  z
    .preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().trim().max(max).email().optional()
    )
    .transform((value) => (value ? normalizeEmail(value, max) : undefined));

const optionalAddress = z
  .preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().optional()
  )
  .refine((value) => !value || ethers.isAddress(value), 'Invalid wallet address')
  .transform((value) => (value ? ethers.getAddress(value) : undefined));

const vestingValidateSchema = z
  .object({
    vestingContract: z.string().trim().refine(ethers.isAddress, 'Invalid address'),
    protocol: z.enum(['manual', 'sablier']).optional(),
    lockupAddress: z.string().trim().max(42).optional(),
    streamId: z.string().trim().max(80).optional()
  })
  .strip();

const fundraisingLinkSchema = z
  .object({
    projectId: z.string().trim().min(1).max(120),
    token: z.string().trim().max(42).optional(),
    treasury: z.string().trim().max(42).optional(),
    chain: z.string().trim().min(1).max(32),
    vestingPolicyRef: z.string().trim().max(200).optional()
  })
  .strip();

const poolPreferencesSchema = z
  .object({
    riskTier: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
    maxLtvBps: z.number().int().min(0).max(10000).optional(),
    interestBps: z.number().int().min(0).max(5000).optional(),
    minLiquidityUsd: z.number().min(0).optional(),
    minWalletAgeDays: z.number().min(0).optional(),
    minVolumeUsd: z.number().min(0).optional(),
    unlockWindowDays: z
      .object({
        min: z.number().min(0).optional(),
        max: z.number().min(0).optional()
      })
      .optional(),
    tokenCategories: z.array(z.string().min(1).max(40)).max(20).optional(),
    allowedTokens: z.array(z.string().min(1).max(120)).max(50).optional(),
    allowedTokenTypes: z.array(z.string().min(1).max(60)).max(20).optional(),
    vestPreferences: z
      .object({
        cliffMinDays: z.number().min(0).optional(),
        cliffMaxDays: z.number().min(0).optional(),
        durationMinDays: z.number().min(0).optional(),
        durationMaxDays: z.number().min(0).optional(),
        vestTypes: z.array(z.string().min(1).max(40)).max(10).optional()
      })
      .optional(),
    chains: z.array(z.enum(['base', 'solana'])).max(2).optional(),
    maxLoanUsd: z.number().min(0).optional(),
    minLoanUsd: z.number().min(0).optional(),
    accessType: z.enum(['open', 'premium', 'community']).optional(),
    premiumToken: z.string().max(42).optional(),
    communityToken: z.string().max(42).optional(),
    description: z.string().max(500).optional()
  })
  .strip();

const createPoolSchema = z
  .object({
    name: stringField(120),
    chain: optionalString(40),
    preferences: poolPreferencesSchema.optional(),
    status: optionalString(40)
  })
  .strip();

const updatePoolSchema = z
  .object({
    preferences: poolPreferencesSchema,
    status: optionalString(40)
  })
  .strip();

const matchQuoteSchema = z
  .object({
    chain: z.enum(['base', 'solana']),
    desiredAmountUsd: z.number().positive(),
    collateralId: optionalString(200),
    vestingContract: optionalString(200),
    token: optionalString(200),
    tokenType: optionalString(60),
    tokenCategory: optionalString(40),
    quantity: z.union([z.string(), z.number()]).optional(),
    unlockTime: z.number().int().positive().optional(),
    streamId: optionalString(200),
    maxOffers: z.number().int().min(1).max(10).optional(),
    borrowerWallet: optionalAddress
  })
  .strip();

const matchAcceptSchema = z
  .object({
    offerId: stringField(120),
    poolId: stringField(120),
    chain: z.enum(['base', 'solana']),
    borrower: optionalAddress,
    collateralId: optionalString(200),
    desiredAmountUsd: z.number().positive(),
    terms: z.record(z.unknown()).optional()
  })
  .strip();

const walletNonceSchema = z
  .object({
    walletAddress: stringField(120)
  })
  .strip();

const walletVerifySchema = z
  .object({
    walletAddress: stringField(120),
    nonce: stringField(256),
    signature: stringField(500)
  })
  .strip();

const linkWalletSchema = z
  .object({
    chainType: z.enum(['evm', 'solana']),
    walletAddress: stringField(120),
    signature: optionalString(600),
    issuedAt: optionalString(64)
  })
  .strip();

const solanaNonceSchema = z
  .object({
    walletAddress: stringField(120)
  })
  .strip();

const solanaLinkWalletSchema = z
  .object({
    walletAddress: stringField(120),
    nonce: stringField(256),
    signature: stringField(500)
  })
  .strip();

const privateLoanCreateSchema = z
  .object({
    collateralId: z.union([
      z.string().trim().regex(/^\d+$/, 'collateralId must be an integer'),
      z.number().int().min(0)
    ]),
    vestingContract: stringField(120),
    borrowAmount: z.union([
      z.string().trim().regex(/^\d+$/, 'borrowAmount must be an integer'),
      z.number().int().positive()
    ]),
    collateralAmount: z
      .union([
        z.string().trim().regex(/^\d+$/, 'collateralAmount must be an integer'),
        z.number().int().positive()
      ])
      .optional()
      .nullable(),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const privateLoanRepaySchema = z
  .object({
    loanId: z.union([z.string().trim().regex(/^\d+$/, 'loanId must be an integer'), z.number().int().min(0)]),
    amount: z.union([z.string().trim().regex(/^\d+$/, 'amount must be an integer'), z.number().int().positive()]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const privateLoanSettleSchema = z
  .object({
    loanId: z.union([z.string().trim().regex(/^\d+$/, 'loanId must be an integer'), z.number().int().min(0)]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const sablierUpgradeSchema = z
  .object({
    lockupAddress: stringField(120),
    streamId: z.union([z.string().trim().regex(/^\d+$/, 'streamId must be an integer'), z.number().int().positive()]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const ozUpgradeSchema = z
  .object({
    vestingAddress: stringField(120),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const timelockUpgradeSchema = z
  .object({
    timelockAddress: stringField(120),
    durationSeconds: z.union([
      z.string().trim().regex(/^\d+$/, 'durationSeconds must be an integer'),
      z.number().int().positive()
    ]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const superfluidUpgradeSchema = z
  .object({
    token: stringField(120),
    totalAllocation: z.union([
      z.string().trim().regex(/^\d+$/, 'totalAllocation must be an integer'),
      z.number().int().positive()
    ]),
    startTime: z.union([
      z.string().trim().regex(/^\d+$/, 'startTime must be an integer'),
      z.number().int().nonnegative()
    ]),
    durationSeconds: z.union([
      z.string().trim().regex(/^\d+$/, 'durationSeconds must be an integer'),
      z.number().int().positive()
    ]),
    signature: stringField(800),
    nonce: stringField(220),
    issuedAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    expiresAt: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]),
    payloadHash: stringField(80).optional()
  })
  .strip();

const solanaRepaySchema = z
  .object({
    owner: z
      .string()
      .trim()
      .refine((value) => {
        try {
          const { PublicKey } = require('@solana/web3.js');
          return Boolean(new PublicKey(String(value).trim()));
        } catch {
          return false;
        }
      }, 'Invalid owner public key'),
    maxUsdc: z
      .union([
        z.string().trim().regex(/^\d+$/, 'maxUsdc must be a non-negative integer'),
        z.number().int().min(0)
      ])
      .optional()
  })
  .strip()
  .transform((value) => ({
    ...value,
    maxUsdc: value.maxUsdc === undefined ? undefined : String(value.maxUsdc)
  }));

const chatSchema = z
  .object({
    message: stringField(2000),
    history: z
      .array(
        z.object({
          role: stringField(32),
          content: stringField(2000)
        })
      )
      .max(10)
      .optional(),
    context: z
      .object({
        path: optionalString(160),
        chainId: z.number().int().positive().optional(),
        walletAddress: optionalAddress,
        page: optionalString(80)
      })
      .optional(),
    captchaToken: optionalString(2048)
  })
  .strip();

const analyticsSchema = z
  .object({
    event: stringField(120),
    page: optionalString(200),
    walletAddress: optionalAddress,
    properties: z.record(z.unknown()).optional()
  })
  .strip();

const chainRequestSchema = z
  .object({
    chainId: z.number().int().positive().optional(),
    chainName: optionalString(60),
    feature: optionalString(60),
    vestingStandard: optionalString(80),
    message: optionalString(500),
    walletAddress: optionalAddress.optional(),
    page: optionalString(120)
  })
  .strip()
  .refine(
    (value) => Boolean(value.chainId || value.chainName),
    'Provide chainId or chainName'
  );

const notifySchema = z
  .object({
    email: optionalEmail(320),
    walletAddress: optionalAddress,
    channel: optionalString(120),
    payload: z.record(z.unknown()).optional(),
    captchaToken: optionalString(2048)
  })
  .strip();

const governanceSchema = z
  .object({
    email: optionalEmail(320),
    walletAddress: optionalAddress,
    message: optionalString(2000),
    captchaToken: optionalString(2048)
  })
  .strip()
  .refine(
    (value) => Boolean(value.email || value.walletAddress || value.message),
    'Provide email, wallet address, or message'
  );

const contactSchema = z
  .object({
    name: optionalString(120),
    email: optionalEmail(320),
    message: optionalString(2000),
    company: optionalString(120),
    walletAddress: optionalAddress,
    context: optionalString(500),
    captchaToken: optionalString(2048)
  })
  .strip()
  .refine(
    (value) => Boolean(value.email || value.message || value.walletAddress),
    'Provide email, wallet address, or message'
  );

const writeSchema = z
  .object({
    action: optionalString(120),
    payload: z.record(z.unknown()).optional()
  })
  .strip();

const docsOpenSchema = z
  .object({
    document: optionalString(200),
    section: optionalString(200)
  })
  .strip();

const adminIdentityPatchSchema = z
  .object({
    linkedAt: z.string().datetime().optional(),
    identityProofHash: z.string().trim().max(256).nullable().optional(),
    sanctionsPass: z.boolean().nullable().optional()
  })
  .strip();

module.exports = {
  vestingValidateSchema,
  fundraisingLinkSchema,
  poolPreferencesSchema,
  createPoolSchema,
  updatePoolSchema,
  matchQuoteSchema,
  matchAcceptSchema,
  walletNonceSchema,
  walletVerifySchema,
  linkWalletSchema,
  solanaNonceSchema,
  solanaLinkWalletSchema,
  privateLoanCreateSchema,
  privateLoanRepaySchema,
  privateLoanSettleSchema,
  sablierUpgradeSchema,
  ozUpgradeSchema,
  timelockUpgradeSchema,
  superfluidUpgradeSchema,
  solanaRepaySchema,
  chatSchema,
  analyticsSchema,
  chainRequestSchema,
  notifySchema,
  governanceSchema,
  contactSchema,
  writeSchema,
  docsOpenSchema,
  adminIdentityPatchSchema
};
