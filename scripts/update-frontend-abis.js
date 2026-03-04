const fs = require('fs');
const path = require('path');

const contractsJsPath = path.join(__dirname, '../frontend/src/utils/contracts.js');
let content = fs.readFileSync(contractsJsPath, 'utf8');

const mapping = {
  loanManagerAbi: 'contracts/LoanManager.sol/LoanManager.json',
  valuationEngineAbi: 'contracts/ValuationEngine.sol/ValuationEngine.json',
  vestingAdapterAbi: 'contracts/VestingAdapter.sol/VestingAdapter.json',
  lendingPoolAbi: 'contracts/LendingPool.sol/LendingPool.json',
  termVaultAbi: 'contracts/TermVault.sol/TermVault.json'
};

for (const [abiExportName, artifactPath] of Object.entries(mapping)) {
  const fullArtifactPath = path.join(__dirname, '../artifacts', artifactPath);
  if (!fs.existsSync(fullArtifactPath)) {
    console.warn('Missing artifact for', artifactPath);
    continue;
  }
  const artifact = JSON.parse(fs.readFileSync(fullArtifactPath, 'utf8'));
  const abiString = JSON.stringify(artifact.abi, null, 2);
  
  // Regex to replace `export const abiExportName = [...];`
  // We match from `export const [name] = [` to the matching `];` at the root level of the array.
  const regex = new RegExp(`export const ${abiExportName} = \\[[\\s\\S]*?\n\\];`);
  if (regex.test(content)) {
    content = content.replace(regex, `export const ${abiExportName} = ${abiString};`);
    console.log(`Updated ${abiExportName}`);
  } else {
    console.warn(`Could not find export for ${abiExportName} to replace`);
  }
}

fs.writeFileSync(contractsJsPath, content, 'utf8');
console.log('Finished updating ABIs in frontend/src/utils/contracts.js');
