const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Drainer = await hre.ethers.getContractFactory("Drainer");
  const drainer = await Drainer.deploy({
    maxFeePerGas: hre.ethers.parseUnits("5", "gwei"),
    maxPriorityFeePerGas: hre.ethers.parseUnits("1", "gwei"),
    gasLimit: 2500000,
  });
  await drainer.waitForDeployment();

  console.log(`Drainer deployed to: ${await drainer.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});