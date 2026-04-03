const LOAN_NFT_ADDRESS = {
  31337: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318', // local placeholder
  11155111: '0x3F1A9bB3B2C4f22Ee086B2b38C1476A3cE7f78E8' // sepolia placeholder
};

const LOAN_NFT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "loanId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "borrower", "type": "address" }
    ],
    "name": "LoanProofMinted",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "borrower", "type": "address" },
      { "internalType": "uint256", "name": "loanId", "type": "uint256" },
      { "internalType": "uint256", "name": "principal", "type": "uint256" },
      { "internalType": "uint256", "name": "collateralAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "ltvBps", "type": "uint256" },
      { "internalType": "uint256", "name": "omegaBps", "type": "uint256" },
      { "internalType": "string", "name": "legalTermsHash", "type": "string" },
      { "internalType": "string", "name": "tokenURI", "type": "string" }
    ],
    "name": "mintProof",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export function getLoanNFTAddress(chainId) {
  return LOAN_NFT_ADDRESS[chainId] || LOAN_NFT_ADDRESS[11155111];
}

export { LOAN_NFT_ABI };
