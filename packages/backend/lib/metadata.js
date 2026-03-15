/**
 * Vestra Protocol - Loan NFT Metadata Generator
 * Generates EIP-721 compliant metadata for Loan NFTs.
 */

const generateMetadata = (loanData) => {
  const {
    loanId,
    principal,
    durationDays,
    aprBps,
    collateralAsset,
    borrower,
    timestamp
  } = loanData;

  const aprFormatted = (aprBps / 100).toFixed(2);
  const principalFormatted = (Number(principal) / 1e6).toFixed(2);

  return {
    name: `Vestra Loan #${loanId}`,
    description: `A non-custodial loan NFT representing a credit position on Vestra Protocol. Principal: ${principalFormatted} USDC. APR: ${aprFormatted}%. Collateral: ${collateralAsset || 'Vested Asset'}.`,
    image: `ipfs://bafybeih4m5m754m7p3v7m7p3v7m7p3v7m7p3v7m7p3v7m7p3v7m7p3v7m7`, // Placeholder generator base
    external_url: `https://vestraprotocol.vercel.app/borrow/${loanId}`,
    attributes: [
      {
        trait_type: "Principal (USDC)",
        value: Number(principalFormatted)
      },
      {
        trait_type: "Duration (Days)",
        value: Number(durationDays)
      },
      {
        trait_type: "APR (%)",
        value: Number(aprFormatted)
      },
      {
        trait_type: "Collateral",
        value: collateralAsset || "Vested Asset"
      },
      {
        trait_type: "Borrower",
        value: borrower
      },
      {
        display_type: "date", 
        trait_type: "Origination Date",
        value: timestamp
      }
    ]
  };
};

module.exports = {
  generateMetadata
};
