// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/**
 * Utility to upload JSON metadata to IPFS via Pinata REST API.
 */
async function uploadJSONToIPFS(jsonData) {
  const pinataApiKey = process.env.PINATA_API_KEY;
  const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY;

  if (!pinataApiKey || !pinataSecretApiKey) {
    console.warn('[ipfs] PINATA_API_KEY or PINATA_SECRET_API_KEY is missing. Using mock IPFS hash.');
    // Return a mock IPFS URL if API keys are not provided.
    const mockHash = 'QmMockHashForDemo' + Date.now();
    return `ipfs://${mockHash}`;
  }

  const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

  const body = {
    pinataContent: jsonData,
    pinataMetadata: {
        name: `Vestra_LoanProof_${Date.now()}.json`
    }
  };

  try {
    const { fetch } = require('undici');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        pinata_api_key: pinataApiKey,
        pinata_secret_api_key: pinataSecretApiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Pinata upload failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return `ipfs://${data.IpfsHash}`;
  } catch (error) {
    console.error('[ipfs] IPFS upload error:', error);
    throw error;
  }
}

module.exports = {
  uploadJSONToIPFS
};
