# Solana Security Checklist

Program and client security checklist covering account validation, signer checks, and common attack vectors to review before deploying.

Assume the attacker controls:
- Every account passed into an instruction
- Every instruction argument
- Transaction ordering
- CPI call graphs

---

## 1. Missing Owner Checks
**Risk**: Attacker creates fake accounts with identical data structure and correct discriminator.

**Anchor Prevention**:
```rust
// Automatic with typed accounts
pub account: Account<'info, MyData>,

// Explicit check for UncheckedAccount
#[account(owner = program_id)]
pub account: UncheckedAccount<'info>,
```

---

## 2. Missing Signer Checks
**Risk**: Any account can perform operations that should be restricted to specific authorities.

**Anchor Prevention**:
```rust
// Use Signer type
pub authority: Signer<'info>,

// Explicit constraint
#[account(signer)]
pub authority: UncheckedAccount<'info>,
```

---

## 3. Arbitrary CPI Attacks
**Risk**: Program blindly calls whatever program is passed as parameter.

**Anchor Prevention**:
```rust
// Use typed Program accounts
pub token_program: Program<'info, Token>,

// Or explicit validation
if ctx.accounts.token_program.key() != &spl_token::ID {
    return Err(ErrorCode::IncorrectProgramId.into());
}
```

---

## 4. Reinitialization Attacks
**Risk**: Calling initialization functions on already-initialized accounts.

**Anchor Prevention**:
- Use `#[account(init, ...)]` which includes a discriminator check.
- **CRITICAL**: Avoid `init_if_needed` unless strictly necessary and manually guarded.

---

## 5. PDA Sharing Vulnerabilities
**Risk**: Same PDA used across multiple users.

**Secure Pattern**:
```rust
// Include user-specific identifiers in seeds
seeds = [b"vault", user.key().as_ref()]
```

---

## 6. Type Cosplay Attacks
**Risk**: Accounts with identical data structures but different purposes.

**Prevention**: Use discriminators (Anchor's `#[account]` does this automatically with an 8-byte prefix).

---

## 7. Duplicate Mutable Accounts
**Risk**: Passing the same account twice causing overwrites.

**Prevention**: Anchor 0.32+ disallows this by default. Use `dup` constraint if intentional.

---

## 8. Bump Canonicalization
**Risk**: Non-canonical bumps can be used to derive valid but unintended PDAs.

**Prevention**: Always find and store the **canonical** bump (the highest valid one) during initialization and validate it thereafter.

---

## 9. Token-2022 Specifics
- **Transfer Fees**: Accounting must be delta-aware (balance before vs balance after).
- **Permanent Delegate**: Can transfer/burn any amount from any account. Validate trust.
- **`transfer` vs `transfer_checked`**: Use `transfer_checked` for all Token-2022 interactions.

---

## Security Audit Checklist
- [ ] Validate account owners match expected program.
- [ ] Validate signer requirements explicitly.
- [ ] Validate PDAs match expected seeds + canonical bump.
- [ ] Check for duplicate mutable accounts.
- [ ] Use checked math for all arithmetic operations.
- [ ] Close accounts securely (drain lamports + clear data).
- [ ] Handle Token-2022 transfer fees in accounting.
- [ ] Verify program IDs before performing CPIs.
- [ ] Use `Signer` type for all authority accounts.
