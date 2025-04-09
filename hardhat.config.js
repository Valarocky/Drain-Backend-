require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.0",
  networks: {
    bscMainnet: {
      url: process.env.BSC_MAINNET_URL || "https://bsc-dataseed.bnbchain.org/",
      chainId: 56,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      gas: 2500000, // ~1.5-2.5M gas for deployment
      maxFeePerGas: "5000000000", // 5 gwei in wei
      maxPriorityFeePerGas: "1000000000", // 1 gwei in wei
    },
  },
};