require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("dotenv").config();
require("solidity-coverage");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // Ethereum
    mainnet: {
      url:
        process.env.ALCHEMY_MAINNET_URL ||
        process.env.INFURA_MAINNET_URL ||
        "",
      accounts,
      chainId: 1,
    },
    sepolia: {
      url: process.env.ALCHEMY_SEPOLIA_URL || "https://rpc.sepolia.org",
      accounts,
      chainId: 11155111,
    },

    // Base
    base: {
      url: process.env.BASE_MAINNET_RPC || "https://mainnet.base.org",
      accounts,
      chainId: 8453,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      accounts,
      chainId: 84532,
    },

    // Avalanche C-Chain
    avalanche: {
      url:
        process.env.AVALANCHE_MAINNET_RPC ||
        "https://api.avax.network/ext/bc/C/rpc",
      accounts,
      chainId: 43114,
    },
    fuji: {
      url:
        process.env.AVALANCHE_FUJI_RPC ||
        "https://api.avax-test.network/ext/bc/C/rpc",
      accounts,
      chainId: 43113,
    },

    // Abstract
    abstract: {
      url: process.env.ABSTRACT_MAINNET_RPC || "https://api.mainnet.abs.xyz",
      accounts,
      chainId: 2741,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "avalanche",
        chainId: 43114,
        urls: {
          apiURL: "https://api.snowtrace.io/api",
          browserURL: "https://snowtrace.io",
        },
      },
      {
        network: "fuji",
        chainId: 43113,
        urls: {
          apiURL: "https://api-testnet.snowtrace.io/api",
          browserURL: "https://testnet.snowtrace.io",
        },
      },
      {
        network: "abstract",
        chainId: 2741,
        urls: {
          apiURL: "https://abscan.org/api",
          browserURL: "https://abscan.org",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
};
