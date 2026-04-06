import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import { agentRailEscrowAbi, requireEscrowAddress } from "@/config/contracts";

function rpcUrl() {
  return process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
}

function client() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl()),
  });
}

export async function readEscrowOrderStatus(onchainOrderId: string) {
  const order = (await client().readContract({
    address: requireEscrowAddress(),
    abi: agentRailEscrowAbi,
    functionName: "getOrder",
    args: [BigInt(onchainOrderId)],
  })) as {
    status: number;
  };

  return Number(order.status);
}
