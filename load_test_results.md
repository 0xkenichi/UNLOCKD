# Load Test Report

- Base URL: `http://localhost:4000`
- Enforce thresholds: `false`
- Max error rate: `0.02`

| Profile | Avg RPS | P99 (ms) | Error Rate | Errors | non-2xx | Timeouts |
|---|---:|---:|---:|---:|---:|---:|
| health | 34379.5 | 115.0 | 99.97% | 305 | 1030747 | 305 |
| activity | 33899.5 | 97.0 | 99.94% | 0 | 1016318 | 0 |
| geo-pings | 34716.5 | 75.0 | 100.00% | 0 | 1041507 | 0 |
| vested-contracts | 27562.7 | 8.0 | 100.00% | 0 | 826852 | 0 |
| repay-schedule | 24241.6 | 9.0 | 100.00% | 0 | 727227 | 0 |

## Threshold Result

The following checks failed:
- health: error rate 99.97% > 2.00%
- activity: error rate 99.94% > 2.00%
- geo-pings: error rate 100.00% > 2.00%
- vested-contracts: error rate 100.00% > 2.00%
- repay-schedule: error rate 100.00% > 2.00%
