import hre from "hardhat";

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  const escrowAddress = process.env.NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS;
  const verifierAddress = process.env.AGENTRAIL_OPERATOR_ADDRESS;
  const resolverAddress = process.env.AGENTRAIL_ARBITER_ADDRESS;

  if (!escrowAddress) {
    throw new Error("NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS is required.");
  }
  if (!verifierAddress) {
    throw new Error("AGENTRAIL_OPERATOR_ADDRESS is required.");
  }
  if (!resolverAddress) {
    throw new Error("AGENTRAIL_ARBITER_ADDRESS is required.");
  }

  const escrow = await ethers.getContractAt("AgentRailEscrow", escrowAddress);

  const verifierTx = await escrow.setVerifier(verifierAddress, true);
  await verifierTx.wait();

  const resolverTx = await escrow.setResolver(resolverAddress, true);
  await resolverTx.wait();

  console.log(
    JSON.stringify(
      {
        network: network.name,
        deployer: deployer.address,
        escrowAddress,
        verifierAddress,
        resolverAddress,
        verifierTxHash: verifierTx.hash,
        resolverTxHash: resolverTx.hash,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
