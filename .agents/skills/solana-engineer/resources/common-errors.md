# Common Errors & Solutions

Diagnose and fix common errors encountered when building on Solana, including GLIBC issues, Anchor version conflicts, and RPC errors.

---

### GLIBC Version Mismatch
```
anchor: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.39' not found (required by anchor)
```
**Cause:** Anchor 0.31+ binaries require GLIBC ≥2.38. Anchor 0.32+ requires ≥2.39.

**Solutions:**
1. **Upgrade OS**: Ubuntu 24.04+ has GLIBC 2.39.
2. **Build from source**:
   ```bash
   cargo install --git https://github.com/solana-foundation/anchor --tag v0.31.1 anchor-cli
   ```
3. **Use AVM with source build**: `avm install 0.31.1 --from-source`

---

### Rust 1.80 `time` Crate Issue
```
error[E0635]: unknown feature `proc_macro_span_shrink`
```
**Cause:** Anchor 0.30.x uses a `time` crate version incompatible with Rust ≥1.80.

**Solutions:**
1. **Use AVM**: It auto-selects `rustc 1.79.0` for Anchor < 0.31.
2. **Pin Rust version**: `rustup default 1.79.0` then install anchor-cli.
3. **Upgrade to Anchor 0.31+**.

---

### `cargo build-sbf` not found
**Cause:** Solana CLI not installed or PATH not set.

**Solution:**
1. Install Solana CLI: `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`
2. Add to PATH: `export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"`

---

### IDL Generation Fails (Anchor 0.30+)
**Cause:** `idl-build` feature missing.

**Solution:** Add to `Cargo.toml`:
```toml
[features]
default = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
```

---

### `No space left on device`
**Cause:** Solana CLI + platform tools use 2-5 GB.

**Solution:** Clean old versions in `~/.local/share/solana/install/releases/` and `~/.cache/solana/`.

---

### Anchor 0.30 → 0.31 Migration
**Mismatched types (Pubkey):**
Remove direct `solana-program` dependencies. Use `anchor_lang::prelude::*`.

---

### Anchor 0.31 → 0.32 Migration
**Duplicate mutable accounts:**
Anchor 0.32 disallows duplicate mutable accounts by default. Use `#[account(mut, dup = account_a)]`.

---

### `edition2024` required error
**Cause:** Some crates require Rust edition 2024, but Solana's platform-tools use an older Cargo.

**Solution:** Pin problematic crates in `Cargo.lock`:
```bash
cargo update -p blake3 --precise 1.8.2
cargo update -p constant_time_eq --precise 0.3.1
```
