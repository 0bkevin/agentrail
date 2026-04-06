import hre from "hardhat";

function serviceMask(serviceTypes: string[]) {
  let mask = 0;
  if (serviceTypes.includes("paid_api")) mask |= 1;
  if (serviceTypes.includes("iot_action")) mask |= 2;
  if (serviceTypes.includes("human_task")) mask |= 4;
  return mask;
}

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();

  const registryFactory = await ethers.getContractFactory("ProviderRegistry");
  const registry = await registryFactory.deploy(deployer.address);
  await registry.waitForDeployment();

  const registryAddress = await registry.getAddress();

  const providerApiAddress = process.env.PROVIDER_API_ADDRESS;
  const deviceSimAddress = process.env.DEVICE_SIM_ADDRESS;
  const humanOpsAddress = process.env.HUMAN_OPS_ADDRESS;

  const providers = [
    {
      id: "prov-signal-api",
      wallet: providerApiAddress,
      deviceSigner: providerApiAddress,
      serviceTypes: ["paid_api"],
      name: "Signal Atlas API",
      metadataURI: "ipfs://agentrail/providers/prov-signal-api",
    },
    {
      id: "prov-dock-sensor",
      wallet: deviceSimAddress,
      deviceSigner: deviceSimAddress,
      serviceTypes: ["iot_action"],
      name: "Dock Sensor 12",
      metadataURI: "ipfs://agentrail/providers/prov-dock-sensor",
    },
    {
      id: "prov-human-ops",
      wallet: humanOpsAddress || providerApiAddress,
      deviceSigner: humanOpsAddress || providerApiAddress,
      serviceTypes: ["human_task"],
      name: "Fallback Human Ops",
      metadataURI: "ipfs://agentrail/providers/prov-human-ops",
    },
  ];

  const upserted: string[] = [];

  for (const provider of providers) {
    if (!provider.wallet || !provider.deviceSigner) {
      continue;
    }

    const upsertTx = await registry.upsertProvider(
      ethers.id(provider.id),
      provider.wallet,
      provider.deviceSigner,
      serviceMask(provider.serviceTypes),
      true,
      provider.name,
      provider.metadataURI,
    );
    await upsertTx.wait();
    upserted.push(provider.id);
  }

  console.log(
    JSON.stringify(
      {
        network: network.name,
        deployer: deployer.address,
        registryAddress,
        upsertedProviders: upserted,
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
