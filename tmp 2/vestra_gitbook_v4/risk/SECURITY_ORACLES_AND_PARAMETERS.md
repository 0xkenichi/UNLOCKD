# Security Oracles & Parameters

Vestra's security depends on the integrity of its price and event data feeds.

## Oracle Stack: Chainlink & Custom Resolvers
- **Primary Price Feed**: Chainlink Data Feeds (3-minute update heartbeat).
- **Secondary Verification**: RedStone Oracles (Pull-based fallback).
- **Custom Resolvers**: Used for Pre-TGE SV calculations, pulling from private OTC desks and institutional valuations.

## Parameter Mitigations
| Parameter | Risk Vector | Mitigation |
| --- | --- | --- |
| **Asset Price** | Flash-loan pump/dump | 30-day EWMA Smoothing. |
| **Omega Value** | Relayer Sabotage | Multi-agent neural consensus; 2/3 agreement required. |
| **Unlock Time** | Contract Manipulation | On-chain verification of Sablier/Streamflow stream timestamps. |
| **Borrower Cap** | Sybil Attack | Tier-based wallet concentration analysis (Omega). |

> [!IMPORTANT]
> A price deviation of >5% between Chainlink and RedStone triggers an automatic "Cooldown Mode," freezing new loan originations until the feeds re-converge.
