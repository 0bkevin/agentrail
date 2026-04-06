import { createHash, randomUUID } from "node:crypto";

import type {
  ActivityEntry,
  ActorContext,
  AgentProposal,
  DashboardMetrics,
  DashboardSnapshot,
  Order,
  Provider,
  ProofSubmission,
  ServiceType,
  TerminalEntry,
  TransitionAction,
} from "@/lib/agentrail-types";
import { readOnchainProvider } from "@/lib/provider-registry";
import { verifyProofSubmission } from "@/lib/proof-verifier";
import { storage } from "@/lib/storage";

const CHALLENGE_WINDOW_MS = 15_000;

const providers: Provider[] = [
  {
    id: "prov-signal-api",
    name: "Signal Atlas API",
    roleLabel: "API Provider",
    onchainProviderId: "0x988fc6652a2cac8e8a76f4f72e584b16b03e18c6d97b9271368bd628e4d5d607",
    walletAddress: "0xc9C94744BEc22DDF156e4d0a7d6D0D39ad863d46",
    deviceSignerAddress: "0xc9C94744BEc22DDF156e4d0a7d6D0D39ad863d46",
    apiBaseUrl: process.env.NEXT_PUBLIC_PROVIDER_API_URL || "/api/provider",
    devicePublicKey: "secp256k1:0xc9C94744BEc22DDF156e4d0a7d6D0D39ad863d46",
    reputationScore: 92,
    serviceTypes: ["paid_api"],
    trustModel: "Signed response bundle",
    avgLatency: "4s",
    verificationMode: "Payload hash + provider signature",
  },
  {
    id: "prov-dock-sensor",
    name: "Dock Sensor 12",
    roleLabel: "IoT Provider",
    onchainProviderId: "0x4641ff87b0a5881bf96e6bce6fa7e9f300c37d08515062ebee2024668626a603",
    walletAddress: "0xC84a9fC17BFBcf5385DD24092f61463DbDDe6eBF",
    deviceSignerAddress: "0xC84a9fC17BFBcf5385DD24092f61463DbDDe6eBF",
    apiBaseUrl: process.env.NEXT_PUBLIC_DEVICE_SIM_URL || "/api/device",
    devicePublicKey: "secp256k1:0xC84a9fC17BFBcf5385DD24092f61463DbDDe6eBF",
    reputationScore: 89,
    serviceTypes: ["iot_action"],
    trustModel: "Device-signed telemetry",
    avgLatency: "2s",
    verificationMode: "Device key attestation",
  },
  {
    id: "prov-human-ops",
    name: "Fallback Human Ops",
    roleLabel: "Human Solver",
    onchainProviderId: "0x12f606811550067fc52d458d0e0f267ab498838b14d1658d20e9e37a0033f762",
    walletAddress: "0xc9C94744BEc22DDF156e4d0a7d6D0D39ad863d46",
    deviceSignerAddress: "0xc9C94744BEc22DDF156e4d0a7d6D0D39ad863d46",
    reputationScore: 80,
    serviceTypes: ["human_task"],
    trustModel: "Operator-reviewed evidence",
    avgLatency: "12m",
    verificationMode: "Resolver decision + artifact hash",
  },
];

function now() {
  return Date.now();
}

function hashValue(input: string) {
  return `0x${createHash("sha256").update(input).digest("hex")}`;
}

function txHash(label: string) {
  return hashValue(`${label}:${randomUUID()}`);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function activity(label: string, detail: string): ActivityEntry {
  return {
    id: randomUUID(),
    label,
    detail,
    timestamp: now(),
  };
}

function terminal(level: TerminalEntry["level"], text: string): TerminalEntry {
  return {
    id: randomUUID(),
    level,
    text,
    timestamp: now(),
  };
}

function summarizeServiceType(serviceType: ServiceType) {
  switch (serviceType) {
    case "paid_api":
      return "API proof bundle";
    case "iot_action":
      return "Device attestation";
    case "human_task":
      return "Human-reviewed evidence";
  }
}

function detectServiceType(prompt: string): ServiceType {
  const normalized = prompt.toLowerCase();
  if (
    normalized.includes("sensor") ||
    normalized.includes("temperature") ||
    normalized.includes("door") ||
    normalized.includes("lock") ||
    normalized.includes("device")
  ) {
    return "iot_action";
  }
  if (
    normalized.includes("fix") ||
    normalized.includes("bug") ||
    normalized.includes("investigate") ||
    normalized.includes("human") ||
    normalized.includes("triage")
  ) {
    return "human_task";
  }
  return "paid_api";
}

function normalizeRequestPayload(serviceType: ServiceType, request: Record<string, unknown>): Record<string, string> {
  const normalized = Object.fromEntries(
    Object.entries(request)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );

  if (Object.keys(normalized).length > 0) {
    return normalized;
  }

  switch (serviceType) {
    case "paid_api":
      return {
        task: "premium-data-fetch",
        target: "unspecified",
        resultFormat: "json",
      };
    case "iot_action":
      return {
        task: "device-command",
        deviceId: "dock-sensor-12",
        action: "read-temperature",
      };
    case "human_task":
      return {
        task: "human-resolution",
        priority: "high",
        issue: "unspecified",
      };
  }
}

function buildRequestPayloadFromPrompt(prompt: string, serviceType: ServiceType): Record<string, string> {
  const compact = prompt.trim().replace(/\s+/g, " ");
  switch (serviceType) {
    case "paid_api":
      return {
        task: "premium-data-fetch",
        target: compact,
        resultFormat: "json",
      };
    case "iot_action":
      return {
        task: "device-command",
        deviceId: compact.toLowerCase().includes("door") ? "dock-door-12" : "dock-sensor-12",
        action: compact.toLowerCase().includes("door") ? "unlock" : "read-temperature",
      };
    case "human_task":
      return {
        task: "human-resolution",
        priority: "high",
        issue: compact,
      };
  }
}

function chooseProvider(serviceType: ServiceType) {
  return providers.find((provider) => provider.serviceTypes.includes(serviceType)) ?? providers[0];
}

function providerById(providerId: string) {
  return providers.find((provider) => provider.id === providerId) ?? null;
}

function normalizeAddress(value: string | undefined | null) {
  return (value ?? "").toLowerCase();
}

async function resolveProviderSigningPolicy(order: Order) {
  const configuredProvider = providerById(order.providerId);
  const defaultProviderWallet = configuredProvider?.walletAddress ?? order.providerWallet;
  const defaultDeviceSigner = configuredProvider?.deviceSignerAddress ?? configuredProvider?.walletAddress;

  const onchainProvider = await readOnchainProvider(order.providerId);
  if (onchainProvider?.active) {
    return {
      providerWallet: onchainProvider.wallet,
      deviceSigner: onchainProvider.deviceSigner,
      source: "registry" as const,
    };
  }

  return {
    providerWallet: defaultProviderWallet,
    deviceSigner: defaultDeviceSigner,
    source: "local" as const,
  };
}

function assertProviderCanServeOrder(order: Order, providerWallet: string) {
  const provider = providerById(order.providerId);
  if (!provider) {
    throw new Error("Provider id is not recognized by AgentRail.");
  }

  if (!provider.serviceTypes.includes(order.serviceType)) {
    throw new Error("Provider is not authorized for this service type.");
  }

  if (order.providerWallet && normalizeAddress(order.providerWallet) !== normalizeAddress(providerWallet)) {
    throw new Error("Provider wallet does not match the order's provider assignment.");
  }
}

function expectedDeviceId(order: Order) {
  return order.requestPayload.deviceId;
}

function isWalletAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function paymentFor(serviceType: ServiceType) {
  switch (serviceType) {
    case "paid_api":
      return { paymentAmount: 42, providerStake: 20 };
    case "iot_action":
      return { paymentAmount: 18, providerStake: 12 };
    case "human_task":
      return { paymentAmount: 95, providerStake: 35 };
  }
}

function proposalTitle(prompt: string, serviceType: ServiceType) {
  switch (serviceType) {
    case "paid_api":
      return `Procure verified API response for ${prompt.slice(0, 42)}`;
    case "iot_action":
      return `Unlock device action for ${prompt.slice(0, 42)}`;
    case "human_task":
      return `Escrow a human intervention for ${prompt.slice(0, 42)}`;
  }
}

function proposalSummary(serviceType: ServiceType) {
  switch (serviceType) {
    case "paid_api":
      return "Lock funds for a premium API call, require a signed result, and release only after the optimistic review window closes.";
    case "iot_action":
      return "Escrow payment for a device action and settle only after a device-signed attestation is registered.";
    case "human_task":
      return "Escrow a human-solved bounty, require a signed fix package from the human solver service, and keep a clear dispute path for arbiter review.";
  }
}

function synthesizePrompt(serviceType: ServiceType, requestPayload: Record<string, string>) {
  switch (serviceType) {
    case "paid_api":
      return `Buy a premium API result for ${requestPayload.target ?? "an API request"}`;
    case "iot_action":
      return `Trigger ${requestPayload.action ?? "an action"} on ${requestPayload.deviceId ?? "a device"}`;
    case "human_task":
      return `Escrow a human task for ${requestPayload.issue ?? "a manual task"}`;
  }
}

function buildProposalFromPayload(serviceType: ServiceType, requestPayload: Record<string, string>, prompt: string): AgentProposal {
  const provider = chooseProvider(serviceType);
  const payment = paymentFor(serviceType);

  return {
    id: randomUUID(),
    prompt,
    title: proposalTitle(prompt, serviceType),
    summary: proposalSummary(serviceType),
    serviceType,
    providerId: provider.id,
    providerName: provider.name,
    providerWallet: provider.walletAddress,
    paymentAmount: payment.paymentAmount,
    providerStake: payment.providerStake,
    requestPayload,
    requestHash: hashValue(JSON.stringify(requestPayload)),
    rationale: [
      `${provider.name} matches the requested ${serviceType.replace("_", " ")} flow.`,
      `AgentRail will require ${summarizeServiceType(serviceType).toLowerCase()} before settlement.`,
      `A ${Math.floor(CHALLENGE_WINDOW_MS / 1000)} second optimistic challenge window keeps the demo fully interactive.`,
    ],
  };
}

function buildProposal(
  prompt: string,
  overrides?: {
    serviceType?: ServiceType;
    requestPayload?: Record<string, string>;
  },
): AgentProposal {
  const serviceType = overrides?.serviceType ?? detectServiceType(prompt);
  const requestPayload = overrides?.requestPayload ?? buildRequestPayloadFromPrompt(prompt, serviceType);
  return buildProposalFromPayload(serviceType, requestPayload, prompt);
}

function sortOrders(orders: Order[]) {
  return [...orders].sort((a, b) => b.createdAt - a.createdAt);
}

const SEED_LOCK = "agentrail_seed_lock";

async function withSeedLock<T>(fn: () => Promise<T>) {
  const globalObject = globalThis as typeof globalThis & {
    [SEED_LOCK]?: Promise<void>;
  };

  if (!globalObject[SEED_LOCK]) {
    globalObject[SEED_LOCK] = Promise.resolve();
  }

  const previous = globalObject[SEED_LOCK]!;
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalObject[SEED_LOCK] = previous.then(() => next);

  await previous;
  try {
    return await fn();
  } finally {
    release!();
  }
}

function computeMetrics(orders: Order[]): DashboardMetrics {
  const activeOrders = orders.filter((order) => ["funded", "accepted", "fulfilled", "in_challenge", "disputed"].includes(order.status)).length;
  const securedVolumeUsd = orders.reduce((sum, order) => sum + order.paymentAmount, 0);
  const disputedOrders = orders.filter((order) => order.status === "disputed").length;
  const terminalOrders = orders.filter((order) => ["settled", "refunded", "cancelled"].includes(order.status));
  const settled = terminalOrders.filter((order) => order.status === "settled").length;
  const settlementRate = terminalOrders.length === 0 ? 100 : Math.round((settled / terminalOrders.length) * 100);

  return {
    activeOrders,
    securedVolumeUsd,
    disputedOrders,
    settlementRate,
  };
}

async function ensureSeeded() {
  await withSeedLock(async () => {
    await storage.initialize();
    const hadOrders = await storage.hasOrders();
    await storage.ensureProviders(
      providers.map((provider) => ({
        id: provider.id,
        walletAddress: provider.walletAddress,
        name: provider.name,
        roleLabel: provider.roleLabel,
        serviceTypes: provider.serviceTypes,
        apiBaseUrl: provider.apiBaseUrl,
        devicePublicKey: provider.devicePublicKey,
        reputationScore: provider.reputationScore,
        trustModel: provider.trustModel,
        verificationMode: provider.verificationMode,
      })),
    );

    if (hadOrders) {
      return;
    }

    const seedPrompt = "Buy a signed company enrichment dataset for Acme Robotics";
    const proposal = buildProposal(seedPrompt);
    const createdAt = now() - 90_000;

    const seedOrder: Order = {
      id: "ord-seed-001",
      title: proposal.title,
      summary: proposal.summary,
      buyer: "0x9999999999999999999999999999999999999999",
      providerId: proposal.providerId,
      providerName: proposal.providerName,
      providerWallet: providers.find((provider) => provider.id === proposal.providerId)?.walletAddress,
      serviceType: proposal.serviceType,
      paymentToken: "mockUSDC",
      paymentAmount: proposal.paymentAmount,
      providerStake: proposal.providerStake,
      requestHash: proposal.requestHash,
      requestPayload: proposal.requestPayload,
      status: "settled",
      createdAt,
      acceptedAt: createdAt + 5_000,
      fulfilledAt: createdAt + 12_000,
      challengeDeadline: createdAt + 27_000,
      settledAt: createdAt + 31_000,
      proof: {
        hash: hashValue("seed-proof"),
        summary: "Provider submitted signed response hash and storage URI.",
        resultUri: "ipfs://agentrail/seed-response",
        submittedAt: createdAt + 12_000,
      },
      txCreate: txHash("create-seed"),
      txAccept: txHash("accept-seed"),
      txSubmit: txHash("submit-seed"),
      txSettle: txHash("settle-seed"),
      activity: [
        { id: randomUUID(), label: "Order funded", detail: "Buyer escrowed 42 mockUSDC.", timestamp: createdAt },
        { id: randomUUID(), label: "Provider accepted", detail: "Signal Atlas API posted 20 mockUSDC stake.", timestamp: createdAt + 5_000 },
        { id: randomUUID(), label: "Proof submitted", detail: "Signed bundle stored for verifier review.", timestamp: createdAt + 12_000 },
        { id: randomUUID(), label: "Challenge started", detail: "Verifier opened the optimistic review window.", timestamp: createdAt + 12_500 },
        { id: randomUUID(), label: "Settled", detail: "Funds released after challenge window closed cleanly.", timestamp: createdAt + 31_000 },
      ],
    };

    await storage.upsertOrder(seedOrder);
    if (!(await storage.hasTerminalEntries())) {
      await storage.appendTerminal(
        terminal("system", "AgentRail booted from reference patterns: Lend402 lifecycle, COO challenge windows, B2Pix state separation, yoyo approval flow."),
      );
      await storage.appendTerminal(
        terminal("success", "Seed settlement loaded to demonstrate the full happy path."),
      );
    }
  });
}

async function pushTerminal(level: TerminalEntry["level"], text: string) {
  await storage.appendTerminal(terminal(level, text));
}

async function orderById(orderId: string) {
  const order = await storage.getOrder(orderId);
  if (!order) {
    throw new Error(`Unknown order: ${orderId}`);
  }
  return order;
}

function assertActor(context: ActorContext, order: Order, action: TransitionAction) {
  if (!isWalletAddress(context.actorId)) {
    throw new Error("A connected wallet address is required for this action.");
  }

  switch (action) {
    case "accept":
      if (context.role !== "provider") {
        throw new Error("Only the designated provider can perform this action.");
      }
      if (!order.providerWallet || context.actorId.toLowerCase() !== order.providerWallet.toLowerCase()) {
        throw new Error("Only the designated provider can accept this order.");
      }
      return;
    case "submit_proof":
      if (
        context.role !== "provider" ||
        !order.providerWallet ||
        context.actorId.toLowerCase() !== order.providerWallet.toLowerCase()
      ) {
        throw new Error("Only the designated provider can perform this action.");
      }
      return;
    case "start_challenge":
    case "settle":
      if (context.role !== "operator") {
        throw new Error("Only the operator console can perform this action.");
      }
      return;
    case "approve_early":
      if (context.role !== "buyer" || context.actorId !== order.buyer) {
        throw new Error("Only the buyer can approve early settlement.");
      }
      return;
    case "resolve":
      if (context.role !== "arbiter") {
        throw new Error("Only the arbiter can resolve disputes.");
      }
      return;
    case "dispute":
      if ((context.role === "buyer" && context.actorId === order.buyer) || context.role === "operator") {
        return;
      }
      throw new Error("Only the buyer or operator can open a dispute.");
    case "cancel":
      if (context.role !== "buyer" || context.actorId !== order.buyer) {
        throw new Error("Only the buyer can cancel this order.");
      }
  }
}

function assertRoleAllowed(context: ActorContext) {
  switch (context.role) {
    case "buyer":
      return;
    case "provider": {
      const knownProvider = providers.some(
        (provider) => provider.walletAddress.toLowerCase() === context.actorId.toLowerCase(),
      );
      if (!knownProvider) {
        throw new Error("Provider wallet is not allowlisted.");
      }
      return;
    }
    case "operator": {
      if (context.actorId.toLowerCase() !== (process.env.AGENTRAIL_OPERATOR_ADDRESS ?? "").toLowerCase()) {
        throw new Error("Operator wallet is not allowlisted.");
      }
      return;
    }
    case "arbiter": {
      if (context.actorId.toLowerCase() !== (process.env.AGENTRAIL_ARBITER_ADDRESS ?? "").toLowerCase()) {
        throw new Error("Arbiter wallet is not allowlisted.");
      }
      return;
    }
  }
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  await ensureSeeded();
  const orders = sortOrders(await storage.listOrders());
  return clone({
    providers,
    orders,
    terminal: await storage.listTerminal(32),
    metrics: computeMetrics(orders),
    generatedAt: now(),
  });
}

export async function getOrderSnapshot(orderId: string) {
  await ensureSeeded();
  return clone(await orderById(orderId));
}

export async function createProposal(
  prompt: string,
  overrides?: {
    serviceType?: ServiceType;
    requestPayload?: Record<string, string>;
  },
): Promise<AgentProposal> {
  await ensureSeeded();
  const proposal = buildProposal(prompt, overrides);
  await storage.storeProposal(proposal);
  return clone(proposal);
}

export async function createQuote(serviceType: ServiceType, request: Record<string, unknown>) {
  await ensureSeeded();
  const requestPayload = normalizeRequestPayload(serviceType, request);
  const proposal = buildProposalFromPayload(serviceType, requestPayload, synthesizePrompt(serviceType, requestPayload));
  await storage.storeProposal(proposal);
  return clone(proposal);
}

export async function createOrderFromProposalId(proposalId: string, actor: ActorContext) {
  await ensureSeeded();

  if (actor.role !== "buyer" || !isWalletAddress(actor.actorId)) {
    throw new Error("Only the buyer actor can fund a new order.");
  }

  assertRoleAllowed(actor);

  const proposal = await storage.consumeProposal(proposalId);
  if (!proposal) {
    throw new Error("Proposal not found or already used.");
  }

  const createdAt = now();
  const order: Order = {
    id: `ord-${randomUUID().slice(0, 8)}`,
    title: proposal.title,
    summary: proposal.summary,
    buyer: actor.actorId,
    providerId: proposal.providerId,
    providerName: proposal.providerName,
    providerWallet: proposal.providerWallet ?? providers.find((provider) => provider.id === proposal.providerId)?.walletAddress,
    serviceType: proposal.serviceType,
    paymentToken: "mockUSDC",
    paymentAmount: proposal.paymentAmount,
    providerStake: proposal.providerStake,
    requestHash: proposal.requestHash,
    requestPayload: proposal.requestPayload,
    status: "funded",
    createdAt,
    txCreate: txHash(`create:${proposal.id}`),
    activity: [
      activity("AI proposal approved", `Buyer approved ${proposal.serviceType.replace("_", " ")} routing.`),
      activity("Order funded", `Buyer escrowed ${proposal.paymentAmount} mockUSDC for ${proposal.providerName}.`),
    ],
  };

  await storage.upsertOrder(order);
  await storage.writeAuditLog({
    orderId: order.id,
    source: "buyer",
    eventType: "order_funded",
    payloadJson: {
      buyer: order.buyer,
      providerId: order.providerId,
      paymentAmount: order.paymentAmount,
      providerStake: order.providerStake,
      requestHash: order.requestHash,
    },
    createdAt,
  });
  await pushTerminal("confirm", `Escrow funded for ${order.id}. ${order.paymentAmount} mockUSDC locked for ${order.providerName}.`);

  return clone(order);
}

export async function transitionOrder(args: {
  orderId: string;
  action: TransitionAction;
  actor: ActorContext;
  reason?: string;
  evidenceUri?: string;
  providerWins?: boolean;
  proofSubmission?: ProofSubmission;
  txHash?: string;
  onchainOrderId?: string;
  skipProofVerification?: boolean;
}) {
  await ensureSeeded();
  const order = await orderById(args.orderId);
  assertRoleAllowed(args.actor);
  assertActor(args.actor, order, args.action);
  const expectedStatus = order.status;

  let terminalEvent: { level: TerminalEntry["level"]; text: string } | null = null;
  let auditEvent:
    | {
        source: string;
        eventType: string;
        payloadJson: Record<string, unknown>;
        createdAt: number;
      }
    | null = null;
  let proofEvent:
    | {
        proofType: string;
        payloadJson: Record<string, unknown>;
        signature: string;
        proofHash: string;
        verified: boolean;
        verifiedAt: number;
      }
    | null = null;
  let disputeOpenEvent:
    | {
        openedBy: string;
        reason: string;
        evidenceUri?: string;
        status: string;
        createdAt: number;
      }
    | null = null;
  let disputeResolveEvent:
    | {
        status: string;
        resolution: string;
      }
    | null = null;

  switch (args.action) {
    case "accept": {
      if (order.status !== "funded") {
        throw new Error("Only funded orders can be accepted.");
      }
      order.providerWallet = args.actor.actorId;
      order.status = "accepted";
      order.acceptedAt = now();
      order.txAccept = txHash(`accept:${order.id}`);
      if (args.txHash) {
        order.txAccept = args.txHash;
      }
      order.activity.unshift(activity("Provider accepted", `${order.providerName} posted ${order.providerStake} mockUSDC stake.`));
      terminalEvent = {
        level: "info",
        text: `${order.providerName} accepted ${order.id} and posted collateral.`,
      };
      auditEvent = {
        source: "provider",
        eventType: "order_accepted",
        payloadJson: {
          providerWallet: args.actor.actorId,
          providerStake: order.providerStake,
        },
        createdAt: order.acceptedAt,
      };
      break;
    }
    case "submit_proof": {
      if (order.status !== "accepted") {
        throw new Error("Only accepted orders can submit proof.");
      }

      if (!args.proofSubmission && !args.skipProofVerification) {
        throw new Error("Proof submission is required for submit_proof action.");
      }

      const signingPolicy = await resolveProviderSigningPolicy(order);
      if (!signingPolicy.providerWallet || !signingPolicy.deviceSigner) {
        throw new Error("Provider signing policy is incomplete for this order.");
      }

      assertProviderCanServeOrder(order, signingPolicy.providerWallet);

      if (normalizeAddress(args.actor.actorId) !== normalizeAddress(signingPolicy.providerWallet)) {
        throw new Error("Connected wallet does not match the assigned provider wallet.");
      }

      let verifiedProof:
        | {
            message: string;
            signerAddress: string;
            payload: ProofSubmission["payload"];
          }
        | undefined;

      if (args.skipProofVerification) {
        const resultUri = `ipfs://agentrail/demo/${order.id}/${now()}`;
        verifiedProof = {
          message: `demo-proof:${order.id}`,
          signerAddress: signingPolicy.providerWallet,
          payload:
            order.serviceType === "iot_action"
              ? {
                  kind: "iot",
                  orderId: order.id,
                  requestHash: order.requestHash,
                  resultUri,
                  responseHash: hashValue(`demo-proof:${order.id}`),
                  timestamp: now(),
                  deviceId: expectedDeviceId(order),
                  actionType: order.requestPayload.action ?? "read-temperature",
                  result: { status: "ok", mode: "demo" },
                }
              : {
                  kind: "api",
                  orderId: order.id,
                  requestHash: order.requestHash,
                  resultUri,
                  responseHash: hashValue(`demo-proof:${order.id}`),
                  timestamp: now(),
                  result: { status: "ok", mode: "demo" },
                },
        };
      } else {
        const expectedSigner =
          args.proofSubmission!.payload.kind === "iot" ? signingPolicy.deviceSigner : signingPolicy.providerWallet;

        verifiedProof = await verifyProofSubmission({
          order,
          submission: args.proofSubmission!,
          expectedSigner,
          expectedDeviceId: order.serviceType === "iot_action" ? expectedDeviceId(order) : undefined,
        });
      }

      order.status = "fulfilled";
      order.fulfilledAt = now();
      order.txSubmit = txHash(`proof:${order.id}`);
      if (args.txHash) {
        order.txSubmit = args.txHash;
      }
      order.proof = {
        hash: hashValue(`${order.id}:${order.providerId}:${now()}`),
        summary: `${summarizeServiceType(order.serviceType)} signature and artifact hash verified for provider/device attestation.`,
        resultUri: verifiedProof.payload.resultUri,
        submittedAt: now(),
        signerAddress: verifiedProof.signerAddress,
        verified: true,
      };
      order.activity.unshift(activity("Proof submitted", "Proof package stored and awaiting verifier approval."));
      terminalEvent = {
        level: "success",
        text: `Proof received for ${order.id}. Waiting for the verifier to open the challenge window.`,
      };
      proofEvent = {
        proofType: order.serviceType,
        payloadJson: {
          providerId: order.providerId,
          providerWallet: signingPolicy.providerWallet,
          expectedSigner:
            verifiedProof.payload.kind === "iot" ? signingPolicy.deviceSigner : signingPolicy.providerWallet,
          signerSource: signingPolicy.source,
          message: verifiedProof.message,
          payload: verifiedProof.payload,
          resultUri: order.proof.resultUri,
          summary: order.proof.summary,
          submittedAt: order.proof.submittedAt,
        },
        signature: args.proofSubmission?.signature ?? txHash(`demo-proof-signature:${order.id}`),
        proofHash: order.proof.hash,
        verified: true,
        verifiedAt: order.proof.submittedAt,
      };
      auditEvent = {
        source: "provider",
        eventType: "proof_submitted",
        payloadJson: {
          proofHash: order.proof.hash,
          resultUri: order.proof.resultUri,
        },
        createdAt: order.proof.submittedAt,
      };
      break;
    }
    case "start_challenge": {
      if (order.status !== "fulfilled") {
        throw new Error("Only fulfilled orders can enter the challenge window.");
      }
      order.status = "in_challenge";
      order.challengeDeadline = now() + CHALLENGE_WINDOW_MS;
      order.activity.unshift(activity("Challenge started", `Verifier approved proof and opened review until ${new Date(order.challengeDeadline).toLocaleTimeString()}.`));
      terminalEvent = {
        level: "confirm",
        text: `Verifier opened the challenge window for ${order.id}.`,
      };
      auditEvent = {
        source: "operator",
        eventType: "challenge_started",
        payloadJson: {
          challengeDeadline: order.challengeDeadline,
        },
        createdAt: order.challengeDeadline - CHALLENGE_WINDOW_MS,
      };
      break;
    }
    case "dispute": {
      if (order.status !== "in_challenge") {
        throw new Error("Only in-challenge orders can be disputed.");
      }
      if ((order.challengeDeadline ?? 0) <= now()) {
        throw new Error("Challenge window is closed.");
      }
      order.status = "disputed";
      order.disputedAt = now();
      order.txDispute = txHash(`dispute:${order.id}`);
      if (args.txHash) {
        order.txDispute = args.txHash;
      }
      order.activity.unshift(activity("Disputed", args.reason ?? "Buyer challenged the submitted proof."));
      terminalEvent = {
        level: "warn",
        text: `Challenge raised for ${order.id}. Settlement paused pending arbiter review.`,
      };
      disputeOpenEvent = {
        openedBy: args.actor.actorId,
        reason: args.reason ?? "Buyer challenged the submitted proof.",
        evidenceUri: args.evidenceUri,
        status: "open",
        createdAt: order.disputedAt,
      };
      auditEvent = {
        source: args.actor.role,
        eventType: "order_disputed",
        payloadJson: {
          reason: args.reason ?? "Buyer challenged the submitted proof.",
          evidenceUri: args.evidenceUri,
        },
        createdAt: order.disputedAt,
      };
      break;
    }
    case "approve_early": {
      if (order.status !== "in_challenge") {
        throw new Error("Only in-challenge orders can be approved early.");
      }
      order.status = "settled";
      order.settledAt = now();
      order.txSettle = txHash(`settle-early:${order.id}`);
      if (args.txHash) {
        order.txSettle = args.txHash;
      }
      order.activity.unshift(activity("Buyer approved early settlement", "Buyer approved completion before challenge deadline."));
      terminalEvent = {
        level: "success",
        text: `Buyer approved early settlement for ${order.id}.`,
      };
      auditEvent = {
        source: "buyer",
        eventType: "order_settled_early",
        payloadJson: {
          settledAt: order.settledAt,
        },
        createdAt: order.settledAt,
      };
      break;
    }
    case "settle": {
      if (order.status !== "in_challenge") {
        throw new Error("Only in-challenge orders can be settled.");
      }
      if ((order.challengeDeadline ?? 0) > now()) {
        throw new Error("Challenge window is still open.");
      }
      order.status = "settled";
      order.settledAt = now();
      order.txSettle = txHash(`settle:${order.id}`);
      if (args.txHash) {
        order.txSettle = args.txHash;
      }
      order.activity.unshift(activity("Settled", `Escrow released to ${order.providerName}; stake unlocked.`));
      terminalEvent = {
        level: "confirm",
        text: `Settlement completed for ${order.id}. Funds released and proof archived.`,
      };
      auditEvent = {
        source: "operator",
        eventType: "order_settled",
        payloadJson: {
          settledAt: order.settledAt,
        },
        createdAt: order.settledAt,
      };
      break;
    }
    case "resolve": {
      if (order.status !== "disputed") {
        throw new Error("Only disputed orders can be resolved.");
      }
      order.txResolve = txHash(`resolve:${order.id}`);
      if (args.txHash) {
        order.txResolve = args.txHash;
      }
      if (args.providerWins) {
        order.status = "settled";
        order.settledAt = now();
        order.resolution = "Arbiter confirmed proof; provider received escrow and recovered stake.";
        order.activity.unshift(activity("Resolved in provider favor", order.resolution));
        terminalEvent = {
          level: "success",
          text: `Arbiter resolved ${order.id} in favor of the provider.`,
        };
        disputeResolveEvent = {
          status: "resolved_provider_wins",
          resolution: order.resolution,
        };
      } else {
        order.status = "refunded";
        order.settledAt = now();
        order.resolution = "Arbiter rejected proof; buyer refunded and provider stake slashed in demo mode.";
        order.activity.unshift(activity("Resolved in buyer favor", order.resolution));
        terminalEvent = {
          level: "error",
          text: `Arbiter refunded ${order.id} to the buyer after a failed proof review.`,
        };
        disputeResolveEvent = {
          status: "resolved_buyer_refunded",
          resolution: order.resolution,
        };
      }
      auditEvent = {
        source: "arbiter",
        eventType: "dispute_resolved",
        payloadJson: {
          providerWins: Boolean(args.providerWins),
          resolution: order.resolution,
          slashMode: args.providerWins ? "n/a" : "onchain_configurable_bps",
        },
        createdAt: order.settledAt,
      };
      break;
    }
    case "cancel": {
      if (order.status !== "funded") {
        throw new Error("Only funded orders can be cancelled.");
      }
      order.status = "cancelled";
      order.activity.unshift(activity("Cancelled", "Buyer cancelled the order before provider acceptance."));
      const cancelledAt = now();
      terminalEvent = {
        level: "warn",
        text: `Buyer cancelled ${order.id} before provider acceptance.`,
      };
      auditEvent = {
        source: "buyer",
        eventType: "order_cancelled",
        payloadJson: {
          cancelledAt,
        },
        createdAt: cancelledAt,
      };
      break;
    }
  }

  const updated = await storage.updateOrderIfStatus(order.id, expectedStatus, order);
  if (!updated) {
    throw new Error("Order state changed concurrently. Refresh and retry.");
  }

  if (proofEvent) {
    await storage.logProof({
      orderId: order.id,
      ...proofEvent,
    });
  }

  if (disputeOpenEvent) {
    await storage.openDispute({
      orderId: order.id,
      ...disputeOpenEvent,
    });
  }

  if (disputeResolveEvent) {
    await storage.resolveDispute({
      orderId: order.id,
      ...disputeResolveEvent,
    });
  }

  if (auditEvent) {
    await storage.writeAuditLog({
      orderId: order.id,
      ...auditEvent,
    });
  }

  if (terminalEvent) {
    await pushTerminal(terminalEvent.level, terminalEvent.text);
  }

  return clone(order);
}

export async function attachOnchainOrder(orderId: string, onchainOrderId: string, tx: string) {
  await ensureSeeded();
  const order = await orderById(orderId);
  const expectedStatus = order.status;
  order.onchainOrderId = onchainOrderId;
  order.txCreate = tx;

  const updated = await storage.updateOrderIfStatus(order.id, expectedStatus, order);
  if (!updated) {
    throw new Error("Order state changed concurrently. Refresh and retry.");
  }

  await storage.writeAuditLog({
    orderId: order.id,
    source: "buyer",
    eventType: "onchain_order_attached",
    payloadJson: {
      onchainOrderId,
      txHash: tx,
    },
    createdAt: now(),
  });

  return clone(order);
}

export async function resetDemoState() {
  await storage.resetDemoState();
  await ensureSeeded();
  await pushTerminal("system", "Demo state reset. Seed scenario reloaded.");
}
