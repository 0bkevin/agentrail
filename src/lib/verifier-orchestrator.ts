import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { transitionOrder } from "@/lib/agentrail-store";
import type { Order } from "@/lib/agentrail-types";
import { agentRailEscrowAbi, requireEscrowAddress } from "@/config/contracts";

const DEFAULT_CHALLENGE_WINDOW_SECONDS = 120;

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

function rpcUrl() {
  return process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
}

function challengeWindowSeconds() {
  const parsed = Number(process.env.AGENTRAIL_CHALLENGE_WINDOW_SECONDS ?? DEFAULT_CHALLENGE_WINDOW_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CHALLENGE_WINDOW_SECONDS;
  }
  return Math.floor(parsed);
}

function operatorConfig() {
  const privateKey = process.env.AGENTRAIL_OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
  const operatorAddress = process.env.AGENTRAIL_OPERATOR_ADDRESS as `0x${string}` | undefined;

  if (!privateKey || !operatorAddress) {
    return null;
  }

  const account = privateKeyToAccount(privateKey);
  if (account.address.toLowerCase() !== operatorAddress.toLowerCase()) {
    throw new Error("AGENTRAIL_OPERATOR_PRIVATE_KEY does not match AGENTRAIL_OPERATOR_ADDRESS.");
  }

  return account;
}

export async function orchestrateChallengeWindow(order: Order) {
  const shouldAutostart = parseBoolean(process.env.AGENTRAIL_AUTOSTART_CHALLENGE, true);
  if (!shouldAutostart) {
    return { attempted: false, reason: "disabled" as const };
  }

  if (order.status !== "fulfilled") {
    return { attempted: false, reason: "wrong_status" as const };
  }

  if (!order.onchainOrderId) {
    return { attempted: false, reason: "missing_onchain_order_id" as const };
  }

  const account = operatorConfig();
  if (!account) {
    return { attempted: false, reason: "missing_operator_credentials" as const };
  }

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl()),
  });
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl()),
  });

  const challengeDeadline = BigInt(Math.floor(Date.now() / 1000) + challengeWindowSeconds());

  const txHash = await walletClient.writeContract({
    address: requireEscrowAddress(),
    abi: agentRailEscrowAbi,
    functionName: "startChallengeWindow",
    args: [BigInt(order.onchainOrderId), challengeDeadline],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const synced = await transitionOrder({
    orderId: order.id,
    action: "start_challenge",
    actor: {
      role: "operator",
      actorId: account.address,
    },
    txHash,
  });

  return {
    attempted: true,
    txHash,
    order: synced,
  };
}

export async function orchestrateAutoSettlement(order: Order) {
  const enabled = parseBoolean(process.env.AGENTRAIL_AUTOSETTLE_ENABLED, true);
  if (!enabled) {
    return { attempted: false, reason: "disabled" as const };
  }

  if (order.status !== "in_challenge") {
    return { attempted: false, reason: "wrong_status" as const };
  }

  if (!order.challengeDeadline || order.challengeDeadline > Date.now()) {
    return { attempted: false, reason: "challenge_window_open" as const };
  }

  if (!order.onchainOrderId) {
    return { attempted: false, reason: "missing_onchain_order_id" as const };
  }

  const account = operatorConfig();
  if (!account) {
    return { attempted: false, reason: "missing_operator_credentials" as const };
  }

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl()),
  });
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl()),
  });

  const txHash = await walletClient.writeContract({
    address: requireEscrowAddress(),
    abi: agentRailEscrowAbi,
    functionName: "settleOrder",
    args: [BigInt(order.onchainOrderId)],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const synced = await transitionOrder({
    orderId: order.id,
    action: "settle",
    actor: {
      role: "operator",
      actorId: account.address,
    },
    txHash,
  });

  return {
    attempted: true,
    txHash,
    order: synced,
  };
}
