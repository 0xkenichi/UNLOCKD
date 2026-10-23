// Local stand-in for `forge test` where Foundry is not installed: compile with solc (standard
// JSON) and run the forge-std tests on Hardhat's EDR Solidity test runner, fuzz and invariant
// tests included.
//
//   node scripts/run-tests.cjs <contractsRoot> <solcPath> <edrPath> [testPattern]
//
//   solcPath  a solc 0.8.20 binary (Hardhat caches one under
//             ~/Library/Caches/hardhat-nodejs/compilers-v2/<platform>/)
//   edrPath   a checkout of node_modules/@nomicfoundation/edr (npm i @nomicfoundation/edr)
//   env       FUZZ_RUNS (256), FUZZ_SEED, INV_RUNS (32), INV_DEPTH (40)
//
// The full suite compiles in ~5 minutes and runs in ~1 minute. 71 tests as of 23 Oct 2026.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const [root, solc, edrPath, pattern] = process.argv.slice(2);
const edr = require(edrPath);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".sol")) out.push(p);
  }
  return out;
}

const files = [...walk(path.join(root, "src")), ...walk(path.join(root, "test")), ...walk(path.join(root, "script"))]
  .filter((f) => !f.includes("/anchor/"));
const sources = {};
for (const f of files) sources[path.relative(root, f)] = { urls: [path.relative(root, f)] };

const input = {
  language: "Solidity",
  sources,
  settings: {
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    remappings: [
      "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
      "@chainlink/contracts/=lib/chainlink-brownie-contracts/contracts/",
      "abdk-libraries-solidity/=lib/abdk-libraries-solidity/",
      "forge-std/=lib/forge-std/src/",
    ],
    outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } },
  },
};

const t0 = Date.now();
const raw = execFileSync(solc, ["--standard-json", "--base-path", root, "--allow-paths", root], {
  input: JSON.stringify(input),
  maxBuffer: 1 << 30,
  cwd: root,
});
const output = JSON.parse(raw);
const errors = (output.errors || []).filter((e) => e.severity === "error");
for (const e of output.errors || []) {
  if (e.severity === "error" || !/contract code size|initcode size/.test(e.message)) console.log(e.formattedMessage);
}
if (errors.length) process.exit(1);
console.log(`compiled ${files.length} files in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const solcVersion = "0.8.20";
const artifacts = [];
const suites = [];
for (const [source, contracts] of Object.entries(output.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    const id = { name, source, solcVersion };
    artifacts.push({
      id,
      contract: {
        abi: JSON.stringify(c.abi),
        bytecode: c.evm.bytecode.object,
        linkReferences: c.evm.bytecode.linkReferences,
        deployedBytecode: c.evm.deployedBytecode.object,
        deployedLinkReferences: c.evm.deployedBytecode.linkReferences,
      },
    });
    if (source.startsWith("test/") && c.abi.some((f) => f.type === "function" && /^(test|invariant)/.test(f.name))) {
      suites.push(id);
    }
  }
}

(async () => {
  const ctx = new edr.EdrContext();
  await ctx.registerSolidityTestRunnerFactory(edr.L1_CHAIN_TYPE, edr.l1SolidityTestRunnerFactory());
  let passed = 0, failed = 0;
  const result = await ctx.runSolidityTests(
    edr.L1_CHAIN_TYPE,
    artifacts,
    suites,
    {
      projectRoot: root,
      testPattern: pattern,
      fuzz: { runs: Number(process.env.FUZZ_RUNS || 256), seed: process.env.FUZZ_SEED || "0x1" },
      invariant: { runs: Number(process.env.INV_RUNS || 32), depth: Number(process.env.INV_DEPTH || 40), failOnRevert: false },
      blockGasLimit: 60_000_000n,
    },
    {},
    (suite) => {
      console.log(`\n${suite.id.source}:${suite.id.name}`);
      for (const t of suite.testResults) {
        const ok = t.status === "Success";
        ok ? passed++ : failed++;
        const gas = t.kind.consumedGas !== undefined ? ` (gas: ${t.kind.consumedGas})` : t.kind.runs !== undefined ? ` (runs: ${t.kind.runs})` : "";
        console.log(`  [${ok ? "PASS" : t.status.toUpperCase()}] ${t.name}${gas}${t.reason ? "  — " + t.reason : ""}`);
        if (!ok && t.counterexample) console.log("     counterexample:", JSON.stringify(t.counterexample, (k, v) => (typeof v === "bigint" ? v.toString() : v)));
        if (!ok && t.decodedLogs.length) console.log("     logs:", t.decodedLogs.join(" | "));
      }
    }
  );
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
