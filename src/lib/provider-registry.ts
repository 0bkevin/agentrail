import { createPublicClient, http, keccak256, stringToHex } from "viem";
import { baseSepolia } from "viem/chains";

const providerRegistryAbi = [
  {
    type: "function",
    name: "getProvider",
    stateMutability: "view",
    inputs: [{ name: "providerId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "wallet", type: "address" },
          { name: "deviceSigner", type: "address" },
          { name: "serviceMask", type: "uint32" },
          { name: "active", type: "bool" },
          { name: "name", type: "string" },
          { name: "metadataURI", type: "string" },
          { name: "updatedAt", type: "uint64" },
        ],
      },
    ],
  },
] as const;

type OnchainProviderRecord = {
  wallet: `0x${string}`;
  deviceSigner: `0x${string}`;
  serviceMask: number;
  active: boolean;
  name: string;
  metadataURI: string;
  updatedAt: bigint;
};

function registryAddress() {
  const value = (process.env.PROVIDER_REGISTRY_ADDRESS ||
    process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS) as `0x${string}` | undefined;
  return value;
}

function rpcUrl() {
  return process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
}

function client() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl()),
  });
}

export function hasProviderRegistryConfig() {
  return Boolean(registryAddress());
}

export function onchainProviderId(providerId: string): `0x${string}` {
  return keccak256(stringToHex(providerId));
}

export async function readOnchainProvider(providerId: string): Promise<OnchainProviderRecord | null> {
  const address = registryAddress();
  if (!address) {
    return null;
  }

  try {
    const result = await client().readContract({
      address,
      abi: providerRegistryAbi,
      functionName: "getProvider",
      args: [onchainProviderId(providerId)],
    });

    return {
      wallet: result.wallet,
      deviceSigner: result.deviceSigner,
      serviceMask: Number(result.serviceMask),
      active: result.active,
      name: result.name,
      metadataURI: result.metadataURI,
      updatedAt: result.updatedAt,
    };
  } catch {
    return null;
  }
}
