# Pilot Operations Playbook

## Runbook: Launching a Partner Pool
1.  **Selection**: Identify a DAO with >$10M in vesting treasury.
2.  **Analysis**: Run the Monte Carlo simulation on the partner's token to determine the safe LTV floor.
3.  **Deployment**: Launch the `PartnerVault` and `VestingAdapter`.
4.  **Seeding**: Seed the pool with $500k - $1M in institutional USDC.
5.  **Monitoring**: Set the Omega sensitivity to "High" for the first 30 days of operation.

## Support & Maintenance
- 24/7 Monitoring of the `dDPV` drift.
- Weekly risk reports delivered to the partner's core multi-sig.
