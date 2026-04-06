import { randomUUID } from "node:crypto";

import { createPublicClient, decodeEventLog, http } from "viem";
import { sepolia } from "viem/chains";

import { agentRailEscrowAbi } from "@/config/contracts";
import { getDashboardSnapshot } from "@/lib/agentrail-store";
import type { Order } from "@/lib/agentrail-types";
import { storage } from "@/lib/storage";

const SYNC_CURSOR_KEY = "agentrail:sepolia:escrow-cursor";
const SYNC_WINDOW = BigInt(500);

type EscrowEventName =
  | "OrderCreated"
  | "OrderAccepted"
  | "FulfillmentSubmitted"
  | "ChallengeWindowStarted"
  | "EarlySettlementApproved"
  | "OrderDisputed"
  | "OrderSettled"
  | "DisputeResolved"
  | "OrderCancelled";

const SUPPORTED_EVENT_NAMES: EscrowEventName[] = [
  "OrderCreated",
  "OrderAccepted",
  "FulfillmentSubmitted",
  "ChallengeWindowStarted",
  "EarlySettlementApproved",
  "OrderDisputed",
  "OrderSettled",
  "DisputeResolved",
  "OrderCancelled",
];

function isEscrowEventName(value: string | undefined): value is EscrowEventName {
  return Boolean(value && SUPPORTED_EVENT_NAMES.includes(value as EscrowEventName));
}

function mapOnchainOrderId(orderId: bigint) {
  return `ord-chain-${orderId.toString()}`;
}

function getRpcUrl() {
  return process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
}

function getEscrowAddress() {
  const address = process.env.NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!address) {
    throw new Error("NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS is required for event sync.");
  }
  return address;
}

function getPublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(getRpcUrl()),
  });
}

function mapStatus(status: number): Order["status"] {
  switch (status) {
    case 1:
      return "funded";
    case 2:
      return "accepted";
    case 3:
      return "fulfilled";
    case 4:
      return "in_challenge";
    case 5:
      return "disputed";
    case 6:
      return "settled";
    case 7:
      return "refunded";
    case 8:
      return "cancelled";
    default:
      return "funded";
  }
}

function addChainActivity(order: Order, label: string, detail: string, timestamp: number) {
  const exists = order.activity.some((entry) => entry.label === label && Math.abs(entry.timestamp - timestamp) < 2_000);
  if (exists) {
    return;
  }
  order.activity.unshift({
    id: randomUUID(),
    label,
    detail,
    timestamp,
  });
}

async function reconcileFromChain(args: {
  order: Order;
  onchainOrderId: string;
  eventName: EscrowEventName;
  transactionHash: `0x${string}`;
  blockTimestampMs: number;
  eventArgs: DecodedEventArgs;
}) {
  const client = getPublicClient();
  const escrowAddress = getEscrowAddress();
  const chainOrder = (await client.readContract({
    address: escrowAddress,
    abi: agentRailEscrowAbi,
    functionName: "getOrder",
    args: [BigInt(args.onchainOrderId)],
  })) as {
    status: number;
    acceptedAt: bigint;
    fulfilledAt: bigint;
    challengeDeadline: bigint;
    requestHash: `0x${string}`;
    paymentAmount: bigint;
    providerStake: bigint;
  };

  const next: Order = {
    ...args.order,
    status: mapStatus(Number(chainOrder.status)),
    requestHash: chainOrder.requestHash,
    paymentAmount: Number(chainOrder.paymentAmount),
    providerStake: Number(chainOrder.providerStake),
    acceptedAt: chainOrder.acceptedAt > BigInt(0) ? Number(chainOrder.acceptedAt) * 1000 : args.order.acceptedAt,
    fulfilledAt: chainOrder.fulfilledAt > BigInt(0) ? Number(chainOrder.fulfilledAt) * 1000 : args.order.fulfilledAt,
    challengeDeadline:
      chainOrder.challengeDeadline > BigInt(0) ? Number(chainOrder.challengeDeadline) * 1000 : args.order.challengeDeadline,
  };

  switch (args.eventName) {
    case "OrderAccepted":
      next.txAccept = args.transactionHash;
      addChainActivity(next, "Chain accepted", "Provider accepted order on-chain.", args.blockTimestampMs);
      break;
    case "FulfillmentSubmitted":
      next.txSubmit = args.transactionHash;
      addChainActivity(next, "Chain fulfillment", "Fulfillment hash submitted on-chain.", args.blockTimestampMs);
      break;
    case "ChallengeWindowStarted":
      addChainActivity(next, "Chain challenge started", "Challenge window opened on-chain.", args.blockTimestampMs);
      break;
    case "EarlySettlementApproved":
      next.txSettle = args.transactionHash;
      next.settledAt = args.blockTimestampMs;
      addChainActivity(next, "Chain early settlement", "Buyer approved early settlement on-chain.", args.blockTimestampMs);
      break;
    case "OrderDisputed":
      next.txDispute = args.transactionHash;
      next.disputedAt = args.blockTimestampMs;
      addChainActivity(next, "Chain dispute", "Dispute opened on-chain.", args.blockTimestampMs);
      break;
    case "OrderSettled":
      next.txSettle = args.transactionHash;
      next.settledAt = args.blockTimestampMs;
      addChainActivity(next, "Chain settled", "Order settled on-chain.", args.blockTimestampMs);
      break;
    case "DisputeResolved":
      next.txResolve = args.transactionHash;
      next.settledAt = args.blockTimestampMs;
      addChainActivity(next, "Chain resolution", "Dispute resolved on-chain.", args.blockTimestampMs);
      break;
    case "OrderCancelled":
      addChainActivity(next, "Chain cancelled", "Order cancelled on-chain.", args.blockTimestampMs);
      break;
    case "OrderCreated":
      addChainActivity(next, "Chain created", "Order creation confirmed on-chain.", args.blockTimestampMs);
      break;
  }

  await storage.upsertOrder(next);
  await storage.writeAuditLog({
    orderId: next.id,
    source: "chain",
    eventType: "order_reconciled",
    payloadJson: {
      onchainOrderId: args.onchainOrderId,
      eventName: args.eventName,
      txHash: args.transactionHash,
      status: next.status,
      args: args.eventArgs,
    },
    createdAt: args.blockTimestampMs,
  });
}

async function getKnownOrderByOnchainId(onchainOrderId: string) {
  const snapshot = await getDashboardSnapshot();
  return snapshot.orders.find((order) => order.onchainOrderId === onchainOrderId) ?? null;
}

type DecodedEventArgs = {
  orderId?: bigint;
  fulfillmentHash?: `0x${string}`;
  providerWins?: boolean;
  [key: string]: unknown;
};

async function applyEvent(event: {
  eventName: EscrowEventName;
  args: DecodedEventArgs;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
}) {
  const dedupeKey = `${event.transactionHash}:${event.logIndex}`;
  const fresh = await storage.markChainEventProcessed(dedupeKey, event.blockNumber);
  if (!fresh) {
    return;
  }

  const blockTimestampMs = Number(event.blockNumber) * 1000;

  if (event.eventName === "OrderCreated") {
    const onchainOrderId = (event.args.orderId as bigint | undefined)?.toString();
    if (!onchainOrderId) {
      return;
    }

    const known = await getKnownOrderByOnchainId(onchainOrderId);
    if (!known) {
      await storage.writeAuditLog({
        orderId: mapOnchainOrderId(BigInt(onchainOrderId)),
        source: "chain",
        eventType: "order_created_unmatched",
        payloadJson: {
          onchainOrderId,
          txHash: event.transactionHash,
          args: event.args,
        },
        createdAt: blockTimestampMs,
      });
      return;
    }

    await storage.writeAuditLog({
      orderId: known.id,
      source: "chain",
      eventType: "order_created",
      payloadJson: {
        onchainOrderId,
        txHash: event.transactionHash,
      },
      createdAt: blockTimestampMs,
    });
    return;
  }

  const onchainOrderId = (event.args.orderId as bigint | undefined)?.toString();
  if (!onchainOrderId) {
    return;
  }

  const order = await getKnownOrderByOnchainId(onchainOrderId);
  if (!order) {
    await storage.writeAuditLog({
      orderId: mapOnchainOrderId(BigInt(onchainOrderId)),
      source: "chain",
      eventType: `${event.eventName.toLowerCase()}_unmatched`,
      payloadJson: {
        onchainOrderId,
        txHash: event.transactionHash,
        args: event.args,
      },
      createdAt: blockTimestampMs,
    });
    return;
  }

  await reconcileFromChain({
    order,
    onchainOrderId,
    eventName: event.eventName,
    transactionHash: event.transactionHash,
    blockTimestampMs,
    eventArgs: event.args,
  });
}

export async function syncEscrowEvents() {
  await storage.initialize();

  const client = getPublicClient();
  const escrowAddress = getEscrowAddress();
  const latest = await client.getBlockNumber();
  const cursor = await storage.getSyncCursor(SYNC_CURSOR_KEY);
  const fromBlock = cursor ?? (latest > SYNC_WINDOW ? latest - SYNC_WINDOW : BigInt(0));

  if (fromBlock > latest) {
    await storage.setSyncCursor(SYNC_CURSOR_KEY, latest);
    return { fromBlock, toBlock: latest, processed: 0 };
  }

  const logs = await client.getLogs({
    address: escrowAddress,
    fromBlock,
    toBlock: latest,
  });

  let processed = 0;

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: agentRailEscrowAbi,
        topics: log.topics,
        data: log.data,
        strict: false,
      });

      const eventName = decoded.eventName;
      if (!isEscrowEventName(eventName)) {
        continue;
      }
      const args = decoded.args;
      if (!args || Array.isArray(args)) {
        continue;
      }

      if (!log.transactionHash || !log.blockNumber) {
        continue;
      }

      await applyEvent({
        eventName,
        args: args as unknown as DecodedEventArgs,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: Number(log.logIndex),
      });

      processed += 1;
    } catch {
      // Ignore non-contract logs in the address range.
    }
  }

  await storage.setSyncCursor(SYNC_CURSOR_KEY, latest + BigInt(1));

  return {
    fromBlock,
    toBlock: latest,
    processed,
  };
}
