"use client";

import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  useReadContract,
  usePublicClient,
  useSignMessage,
  useWriteContract,
} from "wagmi";
import { decodeEventLog, encodePacked, keccak256, parseUnits } from "viem";

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
      return "bg-green-500/10 text-green-500 border-green-500";
    case "disputed":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500";
    case "refunded":
      return "bg-brut-red/10 text-brut-red border-brut-red";
    case "fulfilled":
      return "bg-white/10 text-white border-white";
    case "in_challenge":
      return "bg-cyan-400/15 text-brut-red border-cyan-300/25";
    default:
      return "bg-brut-accent text-white border-brut-accent";
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
  if (!snapshot?.orders) return undefined;
  return snapshot.orders.find((order) => ["funded", "accepted", "fulfilled", "in_challenge", "disputed"].includes(order.status)) ?? snapshot.orders[0];
}

export function AgentRailShell({
  initialSnapshot,
  initialRole = "buyer",
}: {
  initialSnapshot: DashboardSnapshot;
  initialRole?: RoleTab;
}) {
    const { address, isConnected } = useAppKitAccount();
  const { caipNetwork } = useAppKitNetwork();
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
  const isOnSepolia = caipNetwork?.id === "eip155:11155111";
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
    try {
      const response = await fetch("/api/demo", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as DashboardSnapshot;
      if (json && Array.isArray(json.orders)) {
        setSnapshot(json);
        if (!selectedOrderId && json.orders[0]) {
          setSelectedOrderId(json.orders[0].id);
        }
      }
    } catch (e) {
      // Ignore network errors on refresh interval
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

  useEffect(() => {
    const handleAuthChange = () => {
      if (!connectedAddress) {
        setSessionAddress(null);
        return;
      }

      void syncSession();
    };

    window.addEventListener("auth-change", handleAuthChange);
    return () => {
      window.removeEventListener("auth-change", handleAuthChange);
    };
  }, [connectedAddress, syncSession]);

  const activeOrder = useMemo(() => {
    if (!snapshot?.orders) return undefined;
    return snapshot.orders.find((order) => order.id === selectedOrderId) ?? activeOrderFrom(snapshot);
  }, [selectedOrderId, snapshot]);

  const selectedProvider = useMemo(() => {
    if (!snapshot?.providers) return undefined;
    return snapshot.providers.find((provider) => provider.id === selectedProviderId) ?? snapshot.providers[0];
  }, [selectedProviderId, snapshot]);

  const visibleOrders = useMemo(() => {
    if (!snapshot?.orders) return [];
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
  }, [role, selectedProvider, snapshot, operatorFilter]);

  const providerEarnings = useMemo(() => {
    if (!selectedProvider || !snapshot?.orders) {
      return { settledCount: 0, disputedCount: 0, grossRevenue: 0 };
    }

    const providerOrders = snapshot.orders.filter((order) => order.providerId === selectedProvider.id);
    const settledCount = providerOrders.filter((order) => order.status === "settled").length;
    const disputedCount = providerOrders.filter((order) => order.status === "disputed").length;
    const grossRevenue = providerOrders
      .filter((order) => order.status === "settled")
      .reduce((sum, order) => sum + order.paymentAmount, 0);

    return { settledCount, disputedCount, grossRevenue };
  }, [selectedProvider, snapshot]);

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
      const challenge = await postJson<{ message: string; challengeToken: string }>("/api/auth/challenge", {
        address: connectedAddress,
      });
      const signature = await signMessageAsync({ message: challenge.message });

      await postJson<{ ok: boolean }>("/api/auth/verify", {
        address: connectedAddress,
        message: challenge.message,
        signature,
        challengeToken: challenge.challengeToken,
      });

      await syncSession();
      window.dispatchEvent(new Event("auth-change"));
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
    window.dispatchEvent(new Event("auth-change"));
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

  if (!snapshot || !snapshot.orders || !snapshot.metrics || !snapshot.providers) {
    return (
      <div className="brutalist-container text-center py-20 text-brut-red font-mono uppercase animate-pulse">
        System Initializing...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="border-2 border-brut-red bg-brut-red/10 px-4 py-3 text-sm font-mono text-brut-red font-bold uppercase">
          {message}
        </div>
      )}

      {role === "buyer" && (
        <section className="brutalist-container !p-6">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-brut-red mb-4">AGENT_INTENT_PROMPT</p>
          <div className="space-y-4">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="DESCRIBE_THE_SERVICE_NEEDED..."
              className="brutalist-input min-h-[120px] text-lg"
            />
            <button
              type="button"
              disabled={isPending || !isAuthenticated}
              onClick={handleProposal}
              className="brutalist-button w-full !text-lg !py-4"
            >
              {isPending ? "ANALYZING_REQUEST..." : "GENERATE_PROPOSAL_HASH"}
            </button>
          </div>
        </section>
      )}

      {role === "provider" && (
        <section className="brutalist-container !p-6 flex flex-col gap-4 md:flex-row md:items-end justify-between">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-brut-red mb-4">ACTIVE_IDENTITY</p>
            <select
              value={selectedProviderId}
              onChange={(event) => setSelectedProviderId(event.target.value)}
              className="brutalist-input"
            >
              {snapshot.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} [{provider.roleLabel}]
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {role === "operator" && (
        <section className="brutalist-container !p-6 flex flex-col gap-4 md:flex-row md:items-end justify-between">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-brut-red mb-4">STATE_FILTER</p>
            <select
              value={operatorFilter}
              onChange={(event) => setOperatorFilter(event.target.value as OperatorFilter)}
              className="brutalist-input"
            >
              <option value="all">ALL_STATES</option>
              <option value="funded">FUNDED</option>
              <option value="accepted">ACCEPTED</option>
              <option value="fulfilled">FULFILLED</option>
              <option value="in_challenge">IN_CHALLENGE</option>
              <option value="disputed">DISPUTED</option>
              <option value="settled">SETTLED</option>
              <option value="refunded">REFUNDED</option>
              <option value="cancelled">CANCELLED</option>
            </select>
          </div>
        </section>
      )}

      {proposal && role === "buyer" && (
        <ToolApprovalCard
          proposal={proposal}
          busy={isPending}
          onApprove={handleApproveProposal}
          onReject={() => setProposal(null)}
        />
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between border-b-2 border-brut-accent pb-4 mb-6">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white/50">ACTIONABLE_ORDERS_QUEUE</p>
          <span className="text-brut-red font-mono font-bold text-xs">[{visibleOrders.length}_ITEMS]</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {visibleOrders.length === 0 && (
            <div className="col-span-full brutalist-container !p-12 text-center text-white/30 font-mono text-xl animate-pulse">
              NO_ACTIVE_ORDERS_DETECTED
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
              <div key={order.id} className="brutalist-container !p-5 flex flex-col gap-5 hover:border-brut-red transition-colors group">
                <div className="flex justify-between items-start gap-4 border-b border-brut-accent pb-4">
                  <div>
                    <h3 className="font-black text-lg text-white uppercase tracking-tight group-hover:text-brut-red transition-colors">{order.title}</h3>
                    <p className="text-xs text-white/60 font-mono mt-1 uppercase">Provider: {order.providerName}</p>
                  </div>
                  <span className={`border px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest whitespace-nowrap ${orderStatusClass(order.status)}`}>
                    {order.status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="border border-brut-accent p-3 bg-black">
                    <span className="text-white/40 block mb-1 uppercase tracking-widest text-[10px]">ESCROW</span>
                    <span className="text-white font-bold text-sm">{currency(order.paymentAmount)}</span>
                  </div>
                  <div className="border border-brut-accent p-3 bg-black">
                    <span className="text-white/40 block mb-1 uppercase tracking-widest text-[10px]">STAKE</span>
                    <span className="text-white font-bold text-sm">{currency(order.providerStake)}</span>
                  </div>
                </div>

                {(canAccept || canProof || canStartChallenge || canBuyerDispute || canOperatorDispute || canCancel || canApproveEarly || canSettle || canResolve) && (
                  <div className="flex flex-col gap-3 mt-2 border-t border-brut-accent pt-5">
                    {canAccept && (
                      <ActionButton disabled={isPending || !isAuthenticated} onClick={() => transition("accept", order.id, { role: "provider" })}>
                        ACCEPT_AND_STAKE
                      </ActionButton>
                    )}
                    {canProof && (
                      <ActionButton disabled={isPending || !isAuthenticated} onClick={() => fulfill(order)}>
                        SUBMIT_PROOF_HASH
                      </ActionButton>
                    )}
                    {canStartChallenge && (
                      <ActionButton disabled={isPending || !isAuthenticated} onClick={() => transition("start_challenge", order.id, { role: "operator" })}>
                        VERIFY_AND_OPEN_REVIEW
                      </ActionButton>
                    )}
                    {canBuyerDispute && (
                      <ActionButton disabled={isPending || !isAuthenticated} onClick={() => dispute(order.id, "buyer", "Buyer flagged a mismatch between requested service and returned proof.")} tone="warn">
                        OPEN_DISPUTE
                      </ActionButton>
                    )}
                    {canOperatorDispute && (
                      <ActionButton disabled={isPending || !isAuthenticated} onClick={() => dispute(order.id, "operator", "Verifier detected a payload mismatch during review.")} tone="warn">
                        RAISE_VERIFIER_DISPUTE
                      </ActionButton>
                    )}
                    {canCancel && (
                      <ActionButton disabled={isPending || !isAuthenticated} onClick={() => transition("cancel", order.id, { role: "buyer" })} tone="warn">
                        CANCEL_ORDER
                      </ActionButton>
                    )}
                    {canApproveEarly && (
                      <ActionButton disabled={isPending || !isAuthenticated} onClick={() => transition("approve_early", order.id, { role: "buyer" })} tone="success">
                        APPROVE_EARLY_SETTLEMENT
                      </ActionButton>
                    )}
                    {canSettle && (
                      <ActionButton disabled={isPending || !isAuthenticated} onClick={() => transition("settle", order.id, { role: "operator" })} tone="success">
                        SETTLE_IF_READY
                      </ActionButton>
                    )}
                    {canResolve && (
                      <div className="flex flex-col gap-3">
                        <ActionButton disabled={isPending || !isAuthenticated} onClick={() => transition("resolve", order.id, { role: "arbiter", providerWins: true })} tone="success">
                          RESOLVE_PROVIDER_WINS
                        </ActionButton>
                        <ActionButton disabled={isPending || !isAuthenticated} onClick={() => transition("resolve", order.id, { role: "arbiter", providerWins: false })} tone="danger">
                          RESOLVE_BUYER_REFUNDED
                        </ActionButton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
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
      className={`px-4 py-2 font-mono font-bold uppercase tracking-widest border border-transparent text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
