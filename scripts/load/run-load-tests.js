#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const autocannon = require('autocannon');

function parseArgs(argv) {
  const out = {
    baseUrl: process.env.LOAD_BASE_URL || 'http://127.0.0.1:4000',
    reportJson: process.env.LOAD_REPORT_JSON || '',
    reportMd: process.env.LOAD_REPORT_MD || '',
    enforce: process.env.LOAD_ENFORCE === 'true',
    maxErrorRate: Number(process.env.LOAD_MAX_ERROR_RATE || 0.02),
    scale: Math.max(1, Number(process.env.LOAD_SCALE || 1)),
    duration: Math.max(5, Number(process.env.LOAD_DURATION || 12))
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base-url') out.baseUrl = argv[i + 1];
    if (arg === '--report-json') out.reportJson = argv[i + 1];
    if (arg === '--report-md') out.reportMd = argv[i + 1];
    if (arg === '--enforce') out.enforce = true;
    if (arg === '--max-error-rate') out.maxErrorRate = Number(argv[i + 1]);
    if (arg === '--scale') out.scale = Math.max(1, Number(argv[i + 1]));
    if (arg === '--duration') out.duration = Math.max(5, Number(argv[i + 1]));
  }
  return out;
}

function runProfile(profile) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: profile.url,
        method: profile.method || 'GET',
        connections: profile.connections,
        duration: profile.duration,
        pipelining: profile.pipelining
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    autocannon.track(instance, { renderProgressBar: true });
  });
}

function summarize(profile, result) {
  const durationSeconds = Number(profile.duration || 0);
  const total = Number(result.requests?.total || 0);
  const requestsAverage =
    Number(result.requests?.average || 0) || (durationSeconds > 0 ? total / durationSeconds : 0);
  const latencyP99 = Number(result.latency?.p99 || 0);
  const errors = Number(result.errors || 0);
  const timeouts = Number(result.timeouts || 0);
  const non2xx = Number(result.non2xx || 0);
  const failed = errors + non2xx;
  const denominator = Math.max(total, failed, 1);
  const errorRate = failed / denominator;
  return {
    name: profile.name,
    method: profile.method || 'GET',
    url: profile.url,
    connections: profile.connections,
    duration: profile.duration,
    pipelining: profile.pipelining,
    minRps: profile.minRps,
    maxP99Ms: profile.maxP99Ms,
    requestsPerSecAvg: requestsAverage,
    latencyP99Ms: latencyP99,
    requestsTotal: total,
    errors,
    timeouts,
    non2xx,
    errorRate
  };
}

function toMarkdown(settings, summaries, failures) {
  const lines = [];
  lines.push('# Load Test Report');
  lines.push('');
  lines.push(`- Base URL: \`${settings.baseUrl}\``);
  lines.push(`- Enforce thresholds: \`${settings.enforce}\``);
  lines.push(`- Max error rate: \`${settings.maxErrorRate}\``);
  lines.push('');
  lines.push('| Profile | Avg RPS | P99 (ms) | Error Rate | Errors | non-2xx | Timeouts |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const s of summaries) {
    lines.push(
      `| ${s.name} | ${s.requestsPerSecAvg.toFixed(1)} | ${s.latencyP99Ms.toFixed(1)} | ${(s.errorRate * 100).toFixed(2)}% | ${s.errors} | ${s.non2xx} | ${s.timeouts} |`
    );
  }
  lines.push('');
  if (!failures.length) {
    lines.push('## Threshold Result');
    lines.push('');
    lines.push('All configured thresholds passed.');
  } else {
    lines.push('## Threshold Result');
    lines.push('');
    lines.push('The following checks failed:');
    for (const f of failures) lines.push(`- ${f}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));
  const base = settings.baseUrl.replace(/\/$/, '');
  const scaled = (value) => Math.max(1, Math.floor(value * settings.scale));

  const profiles = [
    {
      name: 'health',
      url: `${base}/api/health`,
      connections: scaled(120),
      duration: settings.duration,
      pipelining: 5,
      minRps: 1000,
      maxP99Ms: 900
    },
    {
      name: 'activity',
      url: `${base}/api/activity`,
      connections: scaled(80),
      duration: settings.duration,
      pipelining: 5,
      minRps: 1000,
      maxP99Ms: 1200
    },
    {
      name: 'geo-pings',
      url: `${base}/api/geo-pings`,
      connections: scaled(80),
      duration: settings.duration,
      pipelining: 5,
      minRps: 1200,
      maxP99Ms: 1200
    },
    {
      name: 'vested-contracts',
      url: `${base}/api/vested-contracts`,
      connections: scaled(40),
      duration: settings.duration,
      pipelining: 1,
      minRps: 80,
      maxP99Ms: 2500
    },
    {
      name: 'repay-schedule',
      url: `${base}/api/repay-schedule`,
      connections: scaled(40),
      duration: settings.duration,
      pipelining: 1,
      minRps: 120,
      maxP99Ms: 2000
    }
  ];

  const summaries = [];
  for (const profile of profiles) {
    console.log(`\n=== Running profile: ${profile.name} ===`);
    const raw = await runProfile(profile);
    summaries.push(summarize(profile, raw));
  }

  const failures = [];
  for (const s of summaries) {
    if (s.requestsPerSecAvg < s.minRps) {
      failures.push(`${s.name}: avg rps ${s.requestsPerSecAvg.toFixed(1)} < min ${s.minRps}`);
    }
    if (s.latencyP99Ms > s.maxP99Ms) {
      failures.push(`${s.name}: p99 ${s.latencyP99Ms.toFixed(1)}ms > max ${s.maxP99Ms}ms`);
    }
    if (s.errorRate > settings.maxErrorRate) {
      failures.push(
        `${s.name}: error rate ${(s.errorRate * 100).toFixed(2)}% > ${(settings.maxErrorRate * 100).toFixed(2)}%`
      );
    }
  }

  const markdown = toMarkdown(settings, summaries, failures);
  console.log('\n' + markdown);

  const payload = {
    generatedAt: new Date().toISOString(),
    settings,
    summaries,
    failures
  };

  if (settings.reportJson) {
    const outPath = path.resolve(settings.reportJson);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  }

  if (settings.reportMd) {
    const outPath = path.resolve(settings.reportMd);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, markdown);
  }

  if (settings.enforce && failures.length) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error('[load-test] failed', error);
  process.exit(1);
});
