# Version Compatibility Matrix

Reference table for matching Anchor, Solana CLI, Rust, and Node.js versions to avoid toolchain conflicts.

## Master Compatibility Table
| Anchor Version | Solana CLI | Rust Version | Platform Tools | GLIBC Req | Node.js | Key Notes |
|---|---|---|---|---|---|---|
| **0.32.x** | 2.1.x+ | 1.79–1.85+ | v1.50+ | ≥2.39 | ≥17 | Replaces `solana-program` with smaller crates; IDL builds on stable Rust |
| **0.31.x** | 2.0.x–2.1.x | 1.79–1.83 | v1.47+ | ≥2.39 | ≥17 | Upgraded to Solana v2 crates; dynamic discriminators |
| **0.30.x** | 1.18.x | 1.75–1.79 | v1.43 | ≥2.31 | ≥16 | New IDL spec; `idl-build` feature required |
| **0.29.0** | 1.16.x–1.17.x | 1.68–1.75 | v1.37–v1.41 | ≥2.28 | ≥16 | Account reference changes |

## Solana CLI Version Mapping
| Solana CLI | Agave Version | Status | Notes |
|---|---|---|---|
| **3.0.x** | v3.0.x | Stable | Mainnet-ready |
| **2.1.x** | v2.1.x | Stable | Current widely-used stable |
| **1.18.x** | N/A | Legacy | Pre-Anza/Agave migration |

## Platform Tools → Rust Toolchain Mapping
| Platform Tools | Bundled Rust | Target Triple | Notes |
|---|---|---|---|
| **v1.52** | ~1.85 (fork) | `sbpf-solana-solana` | Used by Solana CLI 3.x |
| **v1.48** | ~1.84 (fork) | `sbpf-solana-solana` | Used by Solana CLI 2.2.16 |
| **v1.47** | ~1.80 (fork) | `sbpf-solana-solana` | Used by Anchor 0.31.x |
| **v1.43** | ~1.75 (fork) | `sbf-solana-solana` | Used by Anchor 0.30.x |

---

## GLIBC Requirements by OS
- **Ubuntu 24.04 (Noble)**: 2.39 (Supports all)
- **Ubuntu 22.04 (Jammy)**: 2.35 (Anchor 0.31+ requires source build)
- **Debian 12 (Bookworm)**: 2.36 (Anchor 0.31+ requires source build)
- **macOS 14+ (Sonoma)**: All compatible

## LiteSVM Compatibility
- **LiteSVM 0.5.0**: Requires GLIBC ≥2.38. Native binary fails on Debian 12 / Ubuntu 22.04.
- **solana-bankrun**: Requires GLIBC ≥2.28. Works on Ubuntu 20.04+ / Debian 11+.

---

## Recommended Stacks (Jan 2026)
### Modern (Stable)
- **Anchor CLI**: 0.31.1
- **Solana CLI**: 2.1.7
- **Node.js**: 20.x LTS
- **OS**: Ubuntu 24.04 or macOS 14+

### Cutting Edge
- **Anchor CLI**: 0.32.1
- **Solana CLI**: 2.1.7+
- **Rust**: 1.84.0+
