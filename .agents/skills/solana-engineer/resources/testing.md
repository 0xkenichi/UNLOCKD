# Solana Testing Strategy

A testing pyramid for Solana programs using LiteSVM for fast unit tests, Mollusk for isolated instruction checks, and Surfpool for integration tests.

## Testing Pyramid
1. **Unit Tests (Fast)**: LiteSVM or Mollusk. Directly tests instructions in-process.
2. **Integration Tests (Realistic)**: Surfpool. Tests full flows with realistic cluster state and account cloning.
3. **Cluster Smoke Tests**: Final validation on Devnet/Testnet.

---

## LiteSVM (Lightweight SVM)
Runs a minimal Solana VM directly in your test process. Best for fast feedback.

### Rust Setup
```rust
let mut svm = LiteSVM::new();
svm.add_program_from_file(program_id, "target/deploy/my_program.so");
svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();

let tx = Transaction::new_signed_with_payer(
    &[instruction],
    Some(&payer.pubkey()),
    &[&payer],
    svm.latest_blockhash(),
);
let result = svm.send_transaction(tx);
```

### TypeScript Setup
```typescript
import { LiteSVM } from 'litesvm';
const svm = new LiteSVM();
svm.addProgramFromFile(programId, "target/deploy/my_program.so");
const result = svm.sendTransaction(tx);
```

---

## Mollusk (Instruction-Level Testing)
Focused on testing individual instructions with precise account state and CU benchmarking.

### Usage
```rust
let mollusk = Mollusk::new(&program_id, "target/deploy/my_program");
mollusk.process_and_validate_instruction(
    &instruction,
    &[payer_account],
    &[Check::success(), Check::compute_units(10_000)],
);
```

---

## Surfpool (Integration Testing)
Drop-in replacement for `solana-test-validator` with advanced RPC methods for state manipulation.

### Key Features
- **Account Cloning**: Clone any account/program from Mainnet to localnet.
- **Time Travel**: Manipulate slots and unix timestamps.
- **Warping**: Instantly move to a future slot.

---

## Best Practices
- **CI Gating**: Use LiteSVM tests as the primary blocking gate in CI.
- **Deterministic Seeds**: Use seeded keypairs for reproducible tests.
- **CU Profiling**: Monitor compute unit usage in tests to prevent regressions.
- **Mocking**: Minimize external dependencies; prefer programmatic account creation.
- **Isolation**: Each test should ideally start with a clean state.
