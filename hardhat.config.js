require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.0",
  networks: {
    bscMainnet: {
      url: process.env.BSC_MAINNET_URL || "https://bsc-dataseed.bnbchain.org/",
      chainId: 56,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
  },
};