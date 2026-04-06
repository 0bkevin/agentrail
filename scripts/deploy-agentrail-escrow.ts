import hre from "hardhat";

const SEVEN_DAYS = 7 * 24 * 60 * 60;

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    throw new Error("No deployer signer is configured. Set DEPLOYER_PRIVATE_KEY or PRIVATE_KEY.");
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has no native balance on ${network.name}. Fund it before deploying.`);
  }

  const tokenFactory = await ethers.getContractFactory("MockUSDC");
  const token = await tokenFactory.deploy();
  await token.waitForDeployment();

  const escrowFactory = await ethers.getContractFactory("AgentRailEscrow");
  const escrow = await escrowFactory.deploy(deployer.address, 60, SEVEN_DAYS);
  await escrow.waitForDeployment();

  const mockUsdcAddress = await token.getAddress();
  const escrowAddress = await escrow.getAddress();

  console.log(JSON.stringify({
    network: network.name,
    deployer: deployer.address,
    mockUsdcAddress,
    escrowAddress,
    minChallengeWindowSeconds: 60,
    maxChallengeWindowSeconds: SEVEN_DAYS,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
