# Load test profiles

Reusable backend load profiles are defined in `scripts/load/run-load-tests.js`.

## Local usage

1. Start backend in a separate terminal:
   - `PORT=4100 INDEXER_ENABLED=false RATE_LIMIT_MAX=1000000 RATE_LIMIT_STRICT_MAX=1000000 node backend/server.js`
2. Run the load suite:
   - `npm run test:load -- --base-url http://127.0.0.1:4100 --report-json artifacts/load-report.json --report-md artifacts/load-report.md --enforce`

## Profiles

- `health`: `GET /api/health`
- `activity`: `GET /api/activity`
- `geo-pings`: `GET /api/geo-pings`

Each profile checks:
- minimum average requests/sec (`minRps`)
- maximum p99 latency (`maxP99Ms`)
- max error rate (`--max-error-rate`, default `0.02`)

If `--enforce` is enabled, any threshold failure exits with code `2`.
