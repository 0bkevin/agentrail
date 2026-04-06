"use client";

import { useAppKit, useAppKitAccount, useAppKitNetwork, useDisconnect } from "@reown/appkit/react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  useReadContract,
  usePublicClient,
  useSignMessage,
  useWriteContract,
} from "wagmi";
import { decodeEventLog, encodePacked, keccak256, parseUnits } from "viem";

import { FlowDiagram } from "@/components/flow-diagram";
import { TerminalPanel } from "@/components/terminal-panel";
import { ToolApprovalCard } from "@/components/tool-approval-card";
import {
  agentRailEscrowAbi,
  CONTRACTS,
  mockUsdcAbi,
  requireEscrowAddress,
  requireMockUsdcAddress,
} from "@/config/contracts";
import type {
  AgentProposal,
  DashboardSnapshot,
  Order,
  TransitionAction,
} from "@/lib/agentrail-types";

type RoleTab = "buyer" | "provider" | "operator" | "arbiter";
type OperatorFilter = "all" | Order["status"];

const ROLE_COPY: Record<RoleTab, { title: string; blurb: string }> = {
  buyer: {
    title: "Buyer / Agent Operator",
    blurb: "Describe what the agent or device needs. AgentRail proposes the route, prices the escrow, and waits for approval before creating an order.",
  },
  provider: {
    title: "Provider Console",
    blurb: "Accept funded work, stake collateral, and submit a proof bundle. This is the supplier-side panel modeled after the strongest dashboard patterns in Lend402.",
  },
  operator: {
    title: "Operator Command Center",
    blurb: "Track settlement state, audit each proof, and watch the execution timeline in real time.",
  },
  arbiter: {
    title: "Arbiter Queue",
    blurb: "Resolve contested proofs without touching the happy path. This mirrors the optimistic challenge approach from COO.",
  },
};

function currency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(timestamp?: number) {
  if (!timestamp) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function countdown(deadline?: number) {
  if (!deadline) {
    return "-";
  }
  const delta = deadline - Date.now();
  if (delta <= 0) {
    return "ready to settle";
  }
  return `${Math.ceil(delta / 1000)}s remaining`;
}

function orderStatusClass(status: Order["status"]) {
  switch (status) {
    case "settled":
      return "bg-emerald-400/15 text-emerald-100 border-emerald-300/25";
    case "disputed":
      return "bg-amber-400/15 text-amber-100 border-amber-300/25";
    case "refunded":
      return "bg-rose-400/15 text-rose-100 border-rose-300/25";
    case "fulfilled":
      return "bg-violet-400/15 text-violet-100 border-violet-300/25";
    case "in_challenge":
      return "bg-cyan-400/15 text-cyan-100 border-cyan-300/25";
    default:
      return "bg-white/6 text-slate-100 border-white/12";
  }
}

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }
  return json;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
  return `{${entries.join(",")}}`;
}

function providerApiBase() {
  return process.env.NEXT_PUBLIC_PROVIDER_API_URL || "http://localhost:4101";
}

function deviceSimBase() {
  return process.env.NEXT_PUBLIC_DEVICE_SIM_URL || "http://localhost:4102";
}

function proofVerifierBase() {
  return process.env.NEXT_PUBLIC_PROOF_VERIFIER_URL || "http://localhost:4103";
}

function humanSolverBase() {
  return process.env.NEXT_PUBLIC_HUMAN_SOLVER_URL || "http://localhost:4104";
}

async function postExternalJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok || json.ok === false) {
    throw new Error(json.error ?? `External request failed: ${url}`);
  }

  return json;
}

async function postVerifierJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok || json.ok === false) {
    throw new Error(json.error ?? `Verifier request failed: ${url}`);
  }

  return json;
}

const ZERO_BI = BigInt(0);
const ONE_BI = BigInt(1);

function activeOrderFrom(snapshot: DashboardSnapshot) {
  return snapshot.orders.find((order) => ["funded", "accepted", "fulfilled", "in_challenge", "disputed"].includes(order.status)) ?? snapshot.orders[0];
}

export function AgentRailShell({
  initialSnapshot,
  initialRole = "buyer",
}: {
  initialSnapshot: DashboardSnapshot;
  initialRole?: RoleTab;
}) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [role, setRole] = useState<RoleTab>(initialRole);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(activeOrderFrom(initialSnapshot)?.id ?? null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(initialSnapshot.providers[0]?.id ?? "prov-signal-api");
  const [prompt, setPrompt] = useState("Buy a signed live temperature reading from Dock Sensor 12 and release payment only after the attestation is verified.");
  const [proposal, setProposal] = useState<AgentProposal | null>(null);
  const [operatorFilter, setOperatorFilter] = useState<OperatorFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const connectedAddress = (isConnected && address ? address : null) as `0x${string}` | null;
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const isOnBase = caipNetwork?.id === "eip155:84532" || caipNetwork?.id === "eip155:8453";
  const isAuthenticated = Boolean(
    connectedAddress && sessionAddress && connectedAddress.toLowerCase() === sessionAddress.toLowerCase(),
  );
  const hasContractConfig = Boolean(CONTRACTS.escrow && CONTRACTS.mockUsdc);

  const { data: nextOrderId } = useReadContract({
    abi: agentRailEscrowAbi,
    address: CONTRACTS.escrow,
    functionName: "nextOrderId",
    query: {
      enabled: hasContractConfig,
      staleTime: 1_000,
    },
  });

  const refresh = useCallback(async () => {
    const response = await fetch("/api/demo", { cache: "no-store" });
    const json = (await response.json()) as DashboardSnapshot;
    setSnapshot(json);
    if (!selectedOrderId && json.orders[0]) {
      setSelectedOrderId(json.orders[0].id);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const syncSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const json = (await response.json()) as { authenticated: boolean; address: string | null };
    setSessionAddress(json.authenticated ? json.address : null);
    return json;
  }, []);

  useEffect(() => {
    if (!connectedAddress) {
      setSessionAddress(null);
      return;
    }

    void syncSession();
  }, [connectedAddress, syncSession]);

  const activeOrder = useMemo(() => {
    return snapshot.orders.find((order) => order.id === selectedOrderId) ?? activeOrderFrom(snapshot);
  }, [selectedOrderId, snapshot]);

  const selectedProvider = useMemo(() => {
    return snapshot.providers.find((provider) => provider.id === selectedProviderId) ?? snapshot.providers[0];
  }, [selectedProviderId, snapshot.providers]);

  const visibleOrders = useMemo(() => {
    switch (role) {
      case "provider":
        return snapshot.orders.filter(
          (order) => order.providerId === selectedProvider?.id && ["funded", "accepted", "fulfilled", "in_challenge"].includes(order.status),
        );
      case "operator":
        return operatorFilter === "all"
          ? snapshot.orders
          : snapshot.orders.filter((order) => order.status === operatorFilter);
      case "arbiter":
        return snapshot.orders.filter((order) => order.status === "disputed");
      default:
        return snapshot.orders;
    }
  }, [role, selectedProvider, snapshot.orders, operatorFilter]);

  const providerEarnings = useMemo(() => {
    if (!selectedProvider) {
      return { settledCount: 0, disputedCount: 0, grossRevenue: 0 };
    }

    const providerOrders = snapshot.orders.filter((order) => order.providerId === selectedProvider.id);
    const settledCount = providerOrders.filter((order) => order.status === "settled").length;
    const disputedCount = providerOrders.filter((order) => order.status === "disputed").length;
    const grossRevenue = providerOrders
      .filter((order) => order.status === "settled")
      .reduce((sum, order) => sum + order.paymentAmount, 0);

    return { settledCount, disputedCount, grossRevenue };
  }, [selectedProvider, snapshot.orders]);

  async function handleProposal() {
    if (!isAuthenticated) {
      setMessage("Authenticate your wallet before generating a proposal.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setMessage(null);
          const data = await postJson<{ proposal: AgentProposal }>("/api/agent/request-service", { prompt });
          setProposal(data.proposal);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not create proposal.");
        }
      })();
    });
  }

  async function handleApproveProposal() {
    if (!proposal) {
      return;
    }

    if (!isAuthenticated) {
      setMessage("Authenticate your wallet before funding an order.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setMessage(null);
          if (!connectedAddress) {
            throw new Error("Wallet is not connected.");
          }
          if (!hasContractConfig) {
            throw new Error("Missing contract addresses. Set NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS and NEXT_PUBLIC_MOCK_USDC_ADDRESS.");
          }

          const paymentAmount = parseUnits(String(proposal.paymentAmount), 6);
          const providerStake = parseUnits(String(proposal.providerStake), 6);

          const approveTx = await writeContractAsync({
            abi: mockUsdcAbi,
            address: requireMockUsdcAddress(),
            functionName: "approve",
            args: [requireEscrowAddress(), paymentAmount],
            account: connectedAddress,
          });

          await waitForTx(approveTx);

          const serviceTypeIndex = proposal.serviceType === "paid_api" ? 0 : proposal.serviceType === "iot_action" ? 1 : 2;

          const createTx = await writeContractAsync({
            abi: agentRailEscrowAbi,
            address: requireEscrowAddress(),
            functionName: "createOrder",
            args: [
              proposal.providerWallet ?? selectedProvider?.walletAddress,
              requireMockUsdcAddress(),
              paymentAmount,
              providerStake,
              proposal.requestHash as `0x${string}`,
              serviceTypeIndex,
            ],
            account: connectedAddress,
          });

          await waitForTx(createTx);

          const onchainOrderId = await extractOnchainOrderId(createTx);

          const data = await postJson<{ order: Order }>("/api/orders", {
            proposalId: proposal.id,
            onchainOrderId,
            txHash: createTx,
          });
          setProposal(null);
          setSelectedOrderId(data.order.id);
          await refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not fund order.");
        }
      })();
    });
  }

  async function fulfill(order: Order) {
    if (!isAuthenticated) {
      setMessage("Authenticate your wallet before submitting proof.");
      return;
    }

    if (!connectedAddress) {
      setMessage("Connect and authenticate your wallet before submitting proof.");
      return;
    }

    const basePayload = {
      kind: order.serviceType === "iot_action" ? "iot" : "api",
      orderId: order.id,
      requestHash: order.requestHash,
      resultUri: `ipfs://agentrail/${order.id}/${Date.now()}`,
      timestamp: Date.now(),
      result:
        order.serviceType === "iot_action"
          ? { reading: "21.7C", status: "ok" }
          : { status: "ok", records: 1 },
    } as const;

    const payload =
      order.serviceType === "iot_action"
        ? {
            ...basePayload,
            kind: "iot" as const,
            deviceId: order.requestPayload.deviceId ?? "dock-sensor-12",
            actionType: order.requestPayload.action ?? "read-temperature",
          }
        : {
            ...basePayload,
            kind: "api" as const,
          };

    startTransition(() => {
      void (async () => {
        try {
          setMessage(null);
          if (!connectedAddress) {
            throw new Error("Wallet is not connected.");
          }
          if (!hasContractConfig) {
            throw new Error("Missing contract addresses. Set NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS and NEXT_PUBLIC_MOCK_USDC_ADDRESS.");
          }
          if (!order.onchainOrderId) {
            throw new Error("Order is missing on-chain id. Create on-chain order first.");
          }

          const signedProof =
            order.serviceType === "iot_action"
              ? await postExternalJson<{
                  proof: {
                    payload: typeof payload;
                    signature: `0x${string}`;
                  };
                }>(`${deviceSimBase()}/device/execute`, {
                  orderId: order.id,
                  requestHash: order.requestHash,
                  deviceId: order.requestPayload.deviceId,
                  actionType: order.requestPayload.action,
                })
              : order.serviceType === "human_task"
                ? await postExternalJson<{
                    proof: {
                      payload: typeof payload;
                      signature: `0x${string}`;
                    };
                  }>(`${humanSolverBase()}/v1/human-task`, {
                    orderId: order.id,
                    requestHash: order.requestHash,
                  })
                : await postExternalJson<{
                    proof: {
                      payload: typeof payload;
                      signature: `0x${string}`;
                    };
                  }>(`${providerApiBase()}/v1/company-enrichment`, {
                    orderId: order.id,
                    requestHash: order.requestHash,
                    company: order.requestPayload.target,
                  });

          const signedPayload = signedProof.proof.payload;
          const signature = signedProof.proof.signature;

          if (
            signedPayload.orderId !== order.id ||
            signedPayload.requestHash !== order.requestHash ||
            signedPayload.kind !== payload.kind
          ) {
            throw new Error("External proof payload does not match expected order context.");
          }

          if (signedPayload.kind === "iot") {
            const expectedDeviceId = order.requestPayload.deviceId ?? "dock-sensor-12";
            const expectedActionType = order.requestPayload.action ?? "read-temperature";
            if (
              signedPayload.deviceId !== expectedDeviceId ||
              signedPayload.actionType !== expectedActionType
            ) {
              throw new Error("External IoT proof payload does not match requested device action.");
            }
          }

          const fulfillmentHash = keccak256(
            encodePacked(["string"], [stableStringify(signedPayload)]),
          );

          const submitTx = await writeContractAsync({
            abi: agentRailEscrowAbi,
            address: requireEscrowAddress(),
            functionName: "submitFulfillment",
            args: [BigInt(order.onchainOrderId), fulfillmentHash],
            account: connectedAddress,
          });

          await waitForTx(submitTx);

          await postVerifierJson<{
            order: Order;
          }>(`${proofVerifierBase()}/v1/verify-and-start`, {
            orderId: order.id,
            txHash: submitTx,
            proofSubmission: {
              payload: signedPayload,
              signature,
            },
          });
          await refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not submit proof.");
        }
      })();
    });
  }

  async function dispute(orderId: string, role: "buyer" | "operator", reason: string) {
    if (!isAuthenticated) {
      setMessage("Authenticate your wallet before opening a dispute.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setMessage(null);
          if (!connectedAddress) {
            throw new Error("Wallet is not connected.");
          }
          if (!hasContractConfig) {
            throw new Error("Missing contract addresses. Set NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS and NEXT_PUBLIC_MOCK_USDC_ADDRESS.");
          }

          const target = snapshot.orders.find((item) => item.id === orderId);
          if (!target?.onchainOrderId) {
            throw new Error("Order is missing on-chain id. Create on-chain order first.");
          }

          const disputeReasonHash = keccak256(
            encodePacked(["string"], [reason]),
          );

          const disputeTx = await writeContractAsync({
            abi: agentRailEscrowAbi,
            address: requireEscrowAddress(),
            functionName: "disputeOrder",
            args: [BigInt(target.onchainOrderId), disputeReasonHash],
            account: connectedAddress,
          });

          await waitForTx(disputeTx);

          await postJson<{ order: Order }>(`/api/orders/${orderId}/dispute`, {
            role,
            reason,
            txHash: disputeTx,
          });
          await refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not open dispute.");
        }
      })();
    });
  }

  async function transition(action: TransitionAction, orderId: string, extras?: Record<string, unknown>) {
    if (!isAuthenticated) {
      setMessage("Authenticate your wallet before performing this action.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setMessage(null);
          if (!connectedAddress) {
            throw new Error("Wallet is not connected.");
          }
          if (!hasContractConfig) {
            throw new Error("Missing contract addresses. Set NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS and NEXT_PUBLIC_MOCK_USDC_ADDRESS.");
          }

          const target = snapshot.orders.find((item) => item.id === orderId);
          if (!target?.onchainOrderId && action !== "cancel") {
            throw new Error("Order is missing on-chain id. Create on-chain order first.");
          }

          let txHash: `0x${string}` | undefined;

          if (action === "accept" && target?.onchainOrderId) {
            const stakeAmount = parseUnits(String(target.providerStake), 6);
            const approveTx = await writeContractAsync({
              abi: mockUsdcAbi,
              address: requireMockUsdcAddress(),
              functionName: "approve",
              args: [requireEscrowAddress(), stakeAmount],
              account: connectedAddress,
            });
            await waitForTx(approveTx);

            txHash = await writeContractAsync({
              abi: agentRailEscrowAbi,
              address: requireEscrowAddress(),
              functionName: "acceptOrder",
              args: [BigInt(target.onchainOrderId)],
              account: connectedAddress,
            });
            await waitForTx(txHash);
          }

            if (action === "start_challenge" && target?.onchainOrderId) {
              const challengeDeadline = BigInt(Math.floor(Date.now() / 1000) + 120);
              txHash = await writeContractAsync({
                abi: agentRailEscrowAbi,
                address: requireEscrowAddress(),
                functionName: "startChallengeWindow",
                args: [BigInt(target.onchainOrderId), challengeDeadline],
                account: connectedAddress,
              });
              await waitForTx(txHash);
            }

          if (action === "approve_early" && target?.onchainOrderId) {
            txHash = await writeContractAsync({
              abi: agentRailEscrowAbi,
              address: requireEscrowAddress(),
              functionName: "approveEarlySettlement",
              args: [BigInt(target.onchainOrderId)],
              account: connectedAddress,
            });
            await waitForTx(txHash);
          }

          if (action === "settle" && target?.onchainOrderId) {
            txHash = await writeContractAsync({
              abi: agentRailEscrowAbi,
              address: requireEscrowAddress(),
              functionName: "settleOrder",
              args: [BigInt(target.onchainOrderId)],
              account: connectedAddress,
            });
            await waitForTx(txHash);
          }

          if (action === "resolve" && target?.onchainOrderId) {
            const providerWins = Boolean(extras?.providerWins);
            txHash = await writeContractAsync({
              abi: agentRailEscrowAbi,
              address: requireEscrowAddress(),
              functionName: "resolveDispute",
              args: [BigInt(target.onchainOrderId), providerWins],
              account: connectedAddress,
            });
            await waitForTx(txHash);
          }

          if (action === "cancel" && target?.onchainOrderId) {
            txHash = await writeContractAsync({
              abi: agentRailEscrowAbi,
              address: requireEscrowAddress(),
              functionName: "cancelOrder",
              args: [BigInt(target.onchainOrderId)],
              account: connectedAddress,
            });
            await waitForTx(txHash);
          }

          await postJson<{ order: Order }>("/api/orders/action", {
            orderId,
            action,
            txHash,
            ...extras,
          });
          await refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : `Could not ${action}.`);
        }
      })();
    });
  }

  async function authenticateWallet() {
    if (!connectedAddress) {
      setMessage("Connect a wallet before authenticating.");
      return;
    }

    setAuthPending(true);
    setMessage(null);

    try {
      const challenge = await postJson<{ message: string }>("/api/auth/challenge", {
        address: connectedAddress,
      });
      const signature = await signMessageAsync({ message: challenge.message });

      await postJson<{ ok: boolean }>("/api/auth/verify", {
        address: connectedAddress,
        message: challenge.message,
        signature,
      });

      await syncSession();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet authentication failed.");
    } finally {
      setAuthPending(false);
    }
  }

  async function handleDisconnect() {
    try {
      await postJson<{ ok: boolean }>("/api/auth/logout", {});
    } catch {
      // Ignore logout cleanup failures during disconnect.
    }

    setSessionAddress(null);
    disconnect();
  }

  async function waitForTx(hash: `0x${string}`) {
    if (!publicClient) {
      throw new Error("Public client is unavailable for transaction confirmation.");
    }
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function extractOnchainOrderId(txHash: `0x${string}`) {
    if (!publicClient) {
      if (typeof nextOrderId === "bigint" && nextOrderId > ZERO_BI) {
        return (nextOrderId - ONE_BI).toString();
      }
      return undefined;
    }

    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: agentRailEscrowAbi,
          data: log.data,
          topics: log.topics,
          strict: false,
        });

        if (decoded.eventName === "OrderCreated") {
          const fromEvent = (decoded.args as { orderId?: bigint })?.orderId;
          if (typeof fromEvent === "bigint") {
            return fromEvent.toString();
          }
        }
      } catch {
        // Ignore non-matching logs.
      }
    }

    if (typeof nextOrderId === "bigint" && nextOrderId > ZERO_BI) {
      return (nextOrderId - ONE_BI).toString();
    }

    return undefined;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Wallet authentication</p>
            <h2 className="mt-2 text-lg font-semibold text-white">
              {isAuthenticated ? "Wallet authenticated" : isConnected ? "Wallet connected" : "Connect a wallet to use AgentRail"}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Reown AppKit now backs the wallet connection, and a signed session gates privileged AgentRail actions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isConnected && connectedAddress ? (
              <>
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-slate-200">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Address</p>
                  <p className="mt-1 font-mono">{connectedAddress}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-slate-200">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Network</p>
                  <p className="mt-1">{caipNetwork?.name ?? "Unknown"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-slate-200">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Session</p>
                  <p className="mt-1">{isAuthenticated ? "Authenticated" : authPending ? "Signing..." : "Unauthenticated"}</p>
                </div>
                {!isAuthenticated && (
                  <button
                    type="button"
                    onClick={authenticateWallet}
                    disabled={authPending}
                    className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authPending ? "Awaiting signature..." : "Authenticate wallet"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => open({ view: "Networks" })}
                  className="rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/6"
                >
                  Switch network
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDisconnect();
                  }}
                  className="rounded-full border border-white/12 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/6"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => open()}
                className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Connect wallet
              </button>
            )}
          </div>
        </div>

        {!isOnBase && isConnected && (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Switch to Base Sepolia for the intended MVP flow. Mainnet Base is also recognized for future deployment.
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Active orders", value: snapshot.metrics.activeOrders, tone: "text-cyan-100" },
          { label: "Secured volume", value: currency(snapshot.metrics.securedVolumeUsd), tone: "text-white" },
          { label: "Disputes open", value: snapshot.metrics.disputedOrders, tone: "text-amber-100" },
          { label: "Settlement rate", value: `${snapshot.metrics.settlementRate}%`, tone: "text-emerald-100" },
        ].map((metric) => (
          <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{metric.label}</p>
            <p className={`mt-3 text-3xl font-semibold ${metric.tone}`}>{metric.value}</p>
          </div>
        ))}
      </section>

      <FlowDiagram order={activeOrder} />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-3 backdrop-blur">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ROLE_COPY) as RoleTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRole(tab)}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    role === tab ? "bg-white text-slate-950" : "bg-transparent text-slate-300 hover:bg-white/7",
                  ].join(" ")}
                >
                  {ROLE_COPY[tab].title}
                </button>
              ))}
            </div>
          </div>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{ROLE_COPY[role].title}</p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{ROLE_COPY[role].blurb}</p>

            {role === "buyer" && (
              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white">Describe the service the agent needs</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="min-h-32 w-full rounded-3xl border border-white/12 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/45"
                  />
                </label>
                <button
                  type="button"
                  disabled={isPending || !isAuthenticated}
                  onClick={handleProposal}
                  className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Analyzing request..." : "Generate agent proposal"}
                </button>
              </div>
            )}

            {role === "provider" && (
              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white">Active provider identity</span>
                  <select
                    value={selectedProviderId}
                    onChange={(event) => setSelectedProviderId(event.target.value)}
                    className="w-full rounded-2xl border border-white/12 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                  >
                    {snapshot.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} · {provider.roleLabel}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedProvider && (
                  <div className="grid gap-3 md:grid-cols-3">
                    <ProviderCard label="Trust model" value={selectedProvider.trustModel} />
                    <ProviderCard label="Verification" value={selectedProvider.verificationMode} />
                    <ProviderCard label="Average latency" value={selectedProvider.avgLatency} />
                  </div>
                )}

                {selectedProvider && (
                  <div className="grid gap-3 md:grid-cols-3">
                    <ProviderCard label="Settled orders" value={String(providerEarnings.settledCount)} />
                    <ProviderCard label="Gross revenue" value={currency(providerEarnings.grossRevenue)} />
                    <ProviderCard label="Disputes" value={String(providerEarnings.disputedCount)} />
                  </div>
                )}
              </div>
            )}

            {role === "operator" && (
              <div className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr]">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white">Filter by state</span>
                  <select
                    value={operatorFilter}
                    onChange={(event) => setOperatorFilter(event.target.value as OperatorFilter)}
                    className="w-full rounded-2xl border border-white/12 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="all">All states</option>
                    <option value="funded">Funded</option>
                    <option value="accepted">Accepted</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="in_challenge">In challenge</option>
                    <option value="disputed">Disputed</option>
                    <option value="settled">Settled</option>
                    <option value="refunded">Refunded</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-200">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Verification queue</p>
                  <p className="mt-2">Awaiting verifier: {snapshot.orders.filter((order) => order.status === "fulfilled").length}</p>
                  <p className="mt-1">Open challenge windows: {snapshot.orders.filter((order) => order.status === "in_challenge").length}</p>
                  <p className="mt-1">Disputes pending arbiter: {snapshot.orders.filter((order) => order.status === "disputed").length}</p>
                </div>
              </div>
            )}

            {message && (
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {message}
              </div>
            )}
          </section>

          {proposal && role === "buyer" && (
            <ToolApprovalCard
              proposal={proposal}
              busy={isPending}
              onApprove={handleApproveProposal}
              onReject={() => setProposal(null)}
            />
          )}

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Orders</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Role-aware queue</h3>
              </div>
              <p className="text-sm text-slate-400">{visibleOrders.length} visible</p>
            </div>

            <div className="mt-5 space-y-3">
              {visibleOrders.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-sm text-slate-400">
                  No orders for this role yet.
                </div>
              )}

              {visibleOrders.map((order) => {
                const canAccept = role === "provider" && selectedProvider?.id === order.providerId && order.status === "funded";
                const canProof = role === "provider" && selectedProvider?.id === order.providerId && order.status === "accepted";
                const canStartChallenge = role === "operator" && order.status === "fulfilled";
                const canBuyerDispute = role === "buyer" && order.status === "in_challenge";
                const canOperatorDispute = role === "operator" && order.status === "in_challenge";
                const canCancel = role === "buyer" && order.status === "funded";
                const canApproveEarly = role === "buyer" && order.status === "in_challenge";
                const canSettle = role === "operator" && order.status === "in_challenge";
                const canResolve = role === "arbiter" && order.status === "disputed";

                return (
                  <div
                    key={order.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedOrderId(order.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedOrderId(order.id);
                      }
                    }}
                    className={[
                      "block w-full rounded-3xl border p-4 text-left transition",
                      selectedOrderId === order.id
                        ? "border-cyan-300/45 bg-cyan-400/8"
                        : "border-white/10 bg-slate-950/35 hover:bg-white/5",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{order.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{order.providerName}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs ${orderStatusClass(order.status)}`}>
                        {order.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <MetaBlock label="Escrow" value={currency(order.paymentAmount)} />
                      <MetaBlock label="Stake" value={currency(order.providerStake)} />
                      <MetaBlock label="Challenge" value={countdown(order.challengeDeadline)} />
                    </div>

                    {(canAccept || canProof || canStartChallenge || canBuyerDispute || canOperatorDispute || canCancel || canApproveEarly || canSettle || canResolve) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canAccept && (
                          <ActionButton
                            disabled={isPending || !isAuthenticated}
                            onClick={() => transition("accept", order.id, { role: "provider" })}
                          >
                            Accept and stake
                          </ActionButton>
                        )}
                        {canProof && (
                          <ActionButton disabled={isPending || !isAuthenticated} onClick={() => fulfill(order)}>
                            Submit proof
                          </ActionButton>
                        )}
                        {canStartChallenge && (
                          <ActionButton
                            disabled={isPending || !isAuthenticated}
                            onClick={() => transition("start_challenge", order.id, { role: "operator" })}
                          >
                            Verify and open review
                          </ActionButton>
                        )}
                        {canBuyerDispute && (
                          <ActionButton
                            disabled={isPending || !isAuthenticated}
                            onClick={() =>
                              dispute(order.id, "buyer", "Buyer flagged a mismatch between requested service and returned proof.")
                            }
                            tone="warn"
                          >
                            Open dispute
                          </ActionButton>
                        )}
                        {canOperatorDispute && (
                          <ActionButton
                            disabled={isPending || !isAuthenticated}
                            onClick={() =>
                              dispute(order.id, "operator", "Verifier detected a payload mismatch during review.")
                            }
                            tone="warn"
                          >
                            Raise verifier dispute
                          </ActionButton>
                        )}
                        {canCancel && (
                          <ActionButton
                            disabled={isPending || !isAuthenticated}
                            onClick={() => transition("cancel", order.id, { role: "buyer" })}
                            tone="warn"
                          >
                            Cancel order
                          </ActionButton>
                        )}
                        {canApproveEarly && (
                          <ActionButton
                            disabled={isPending || !isAuthenticated}
                            onClick={() => transition("approve_early", order.id, { role: "buyer" })}
                            tone="success"
                          >
                            Approve early settlement
                          </ActionButton>
                        )}
                        {canSettle && (
                          <ActionButton
                            disabled={isPending || !isAuthenticated}
                            onClick={() => transition("settle", order.id, { role: "operator" })}
                            tone="success"
                          >
                            Settle if ready
                          </ActionButton>
                        )}
                        {canResolve && (
                          <>
                            <ActionButton
                              disabled={isPending || !isAuthenticated}
                              onClick={() => transition("resolve", order.id, { role: "arbiter", providerWins: true })}
                              tone="success"
                            >
                              Resolve provider wins
                            </ActionButton>
                            <ActionButton
                              disabled={isPending || !isAuthenticated}
                              onClick={() => transition("resolve", order.id, { role: "arbiter", providerWins: false })}
                              tone="danger"
                            >
                              Resolve buyer refunded
                            </ActionButton>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <OrderDetail order={activeOrder} />
          <TerminalPanel terminal={snapshot.terminal} />
        </div>
      </section>
    </div>
  );
}

function ProviderCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-slate-200">{value}</p>
    </div>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-200">{value}</p>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  tone?: "default" | "success" | "warn" | "danger";
}) {
  const tones = {
    default: "bg-white/8 text-white hover:bg-white/12",
    success: "bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25",
    warn: "bg-amber-400/15 text-amber-100 hover:bg-amber-400/25",
    danger: "bg-rose-400/15 text-rose-100 hover:bg-rose-400/25",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function OrderDetail({ order }: { order?: Order }) {
  if (!order) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400 backdrop-blur">
        No active order selected.
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Selected order</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{order.title}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-300">{order.summary}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${orderStatusClass(order.status)}`}>
          {order.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <ProviderCard label="Provider" value={order.providerName} />
        <ProviderCard label="Payment token" value={order.paymentToken} />
        <ProviderCard label="Created" value={formatDate(order.createdAt)} />
        <ProviderCard label="Challenge window" value={countdown(order.challengeDeadline)} />
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Proof and receipts</p>
        <div className="mt-3 space-y-2 text-sm text-slate-200">
          <p>Request hash: <span className="font-mono text-slate-300">{order.requestHash.slice(0, 18)}...</span></p>
          <p>Create tx: <span className="font-mono text-slate-300">{order.txCreate.slice(0, 18)}...</span></p>
          {order.txAccept && <p>Accept tx: <span className="font-mono text-slate-300">{order.txAccept.slice(0, 18)}...</span></p>}
          {order.txSubmit && <p>Proof tx: <span className="font-mono text-slate-300">{order.txSubmit.slice(0, 18)}...</span></p>}
          {order.txSettle && <p>Settle tx: <span className="font-mono text-slate-300">{order.txSettle.slice(0, 18)}...</span></p>}
          {order.txDispute && <p>Dispute tx: <span className="font-mono text-slate-300">{order.txDispute.slice(0, 18)}...</span></p>}
          {order.txResolve && <p>Resolve tx: <span className="font-mono text-slate-300">{order.txResolve.slice(0, 18)}...</span></p>}
          {order.proof && (
            <>
              <p>Proof review: <span className="text-slate-300">{order.status === "fulfilled" ? "awaiting verifier" : order.status === "in_challenge" ? "review open" : "finalized"}</span></p>
              <p>Proof hash: <span className="font-mono text-slate-300">{order.proof.hash.slice(0, 18)}...</span></p>
              <p>Artifact URI: <span className="font-mono text-slate-300">{order.proof.resultUri}</span></p>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Activity timeline</p>
        <div className="mt-3 space-y-3">
          {order.activity.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">{entry.label}</p>
                <p className="text-xs text-slate-500">{formatDate(entry.timestamp)}</p>
              </div>
              <p className="mt-1 text-sm text-slate-300">{entry.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {order.resolution && (
        <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-400/8 px-4 py-3 text-sm text-amber-100">
          {order.resolution}
        </div>
      )}
    </section>
  );
}
