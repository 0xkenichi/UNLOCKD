#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT_DIR}/artifacts/security-scan}"
TARGET_URL="${TARGET_URL:-http://host.docker.internal:3000}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${OUTPUT_DIR}/${TIMESTAMP}"

mkdir -p "${RUN_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required but not installed."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: docker daemon is not running."
  echo "Start Docker Desktop, then run: npm run security:scan"
  exit 1
fi

echo "Security scan started"
echo "Target URL: ${TARGET_URL}"
echo "Output dir: ${RUN_DIR}"
echo

run_step() {
  local name="$1"
  local cmd="$2"
  local logfile="${RUN_DIR}/${name}.log"

  echo "==> ${name}"
  eval "${cmd}" >"${logfile}" 2>&1
  local exit_code=$?

  if [ "${exit_code}" -eq 0 ]; then
    echo "PASS: ${name}"
  else
    echo "WARN: ${name} exited with code ${exit_code} (see ${logfile})"
  fi
}

# 1) OWASP ZAP baseline DAST
run_step "zap-baseline" "docker run --rm -t -v \"${RUN_DIR}:/zap/wrk\" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t \"${TARGET_URL}\" -r zap-report.html"

# 2) Nuclei template scan
run_step "nuclei" "docker run --rm -t -v \"${RUN_DIR}:/out\" projectdiscovery/nuclei:latest -u \"${TARGET_URL}\" -severity low,medium,high,critical -o /out/nuclei.txt"

# 3) Semgrep SAST (community rules)
run_step "semgrep" "docker run --rm -t -v \"${ROOT_DIR}:/src\" -v \"${RUN_DIR}:/out\" semgrep/semgrep:latest semgrep scan --config auto --json --output /out/semgrep.json /src"

# 4) Gitleaks secret scan
run_step "gitleaks" "docker run --rm -t -v \"${ROOT_DIR}:/repo\" -v \"${RUN_DIR}:/out\" zricethezav/gitleaks:latest detect --source /repo --report-format json --report-path /out/gitleaks.json"

cat > "${RUN_DIR}/README.md" <<EOF
# Security Scan Results

- Timestamp: ${TIMESTAMP}
- Target URL: ${TARGET_URL}

## Generated files

- \`zap-report.html\` - OWASP ZAP baseline report
- \`nuclei.txt\` - Nuclei findings
- \`semgrep.json\` - Semgrep static analysis report
- \`gitleaks.json\` - Secrets scan report
- \`*.log\` - command logs for each scanner
EOF

echo
echo "Security scan finished."
echo "Results: ${RUN_DIR}"
