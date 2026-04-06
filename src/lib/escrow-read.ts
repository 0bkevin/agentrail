import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

import { agentRailEscrowAbi, requireEscrowAddress } from "@/config/contracts";

function rpcUrl() {
  return process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
}

function client() {
  return createPublicClient({
    chain: sepolia,
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
