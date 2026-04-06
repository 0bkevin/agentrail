import { config as loadEnv } from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

loadEnv();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
const basescanApiKey = process.env.BASESCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      chainId: 84532,
      accounts: privateKey ? [privateKey] : [],
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: basescanApiKey,
    },
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
