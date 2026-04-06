import cors from "@fastify/cors";
import Fastify from "fastify";

import { getOrderSnapshot, transitionOrder } from "../src/lib/agentrail-store";
import type { ProofSubmission } from "../src/lib/agentrail-types";
import { readEscrowOrderStatus } from "../src/lib/escrow-read";
import { orchestrateChallengeWindow } from "../src/lib/verifier-orchestrator";

function statusFromCode(code: number) {
  switch (code) {
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
      return "unknown";
  }
}

function shouldFlagDispute(submission: ProofSubmission) {
  const suspectResult = JSON.stringify(submission.payload.result).toLowerCase().includes("error");
  const staleProof = Math.abs(Date.now() - submission.payload.timestamp) > 120_000;
  return suspectResult || staleProof;
}

const DEFAULT_PORT = 4103;

async function start() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/health", async () => {
    return {
      ok: true,
      service: "proof-verifier",
    };
  });

  app.post("/v1/verify-and-start", async (request) => {
    const body = request.body as {
      orderId?: string;
      txHash?: `0x${string}`;
      proofSubmission?: ProofSubmission;
    };

    if (!body.orderId || !body.proofSubmission) {
      return {
        ok: false,
        error: "orderId and proofSubmission are required.",
      };
    }

    const operatorAddress = process.env.AGENTRAIL_OPERATOR_ADDRESS;
    if (!operatorAddress) {
      return {
        ok: false,
        error: "AGENTRAIL_OPERATOR_ADDRESS is required for proof verifier service.",
      };
    }

    const order = await getOrderSnapshot(body.orderId);
    const providerWallet = order.providerWallet;

    if (!providerWallet) {
      return {
        ok: false,
        error: "Order is missing provider wallet.",
      };
    }

    const fulfilled = await transitionOrder({
      orderId: body.orderId,
      action: "submit_proof",
      actor: {
        role: "provider",
        actorId: providerWallet,
      },
      txHash: body.txHash,
      proofSubmission: body.proofSubmission,
    });

    const challenge = await orchestrateChallengeWindow(fulfilled);

    if (shouldFlagDispute(body.proofSubmission)) {
      await transitionOrder({
        orderId: fulfilled.id,
        action: "dispute",
        actor: {
          role: "operator",
          actorId: operatorAddress,
        },
        reason: "Verifier policy flagged proof payload quality/freshness.",
      });

      return {
        ok: true,
        flagged: true,
        reason: "verifier_policy_dispute",
        order: await getOrderSnapshot(fulfilled.id),
        challenge,
      };
    }

    if (fulfilled.onchainOrderId) {
      const chainStatus = await readEscrowOrderStatus(fulfilled.onchainOrderId);
      const resolvedStatus = statusFromCode(chainStatus);
      if (resolvedStatus === "disputed") {
        await transitionOrder({
          orderId: fulfilled.id,
          action: "dispute",
          actor: {
            role: "operator",
            actorId: operatorAddress,
          },
          reason: "Verifier policy flagged the proof after chain read reconciliation.",
        });
        return {
          ok: true,
          flagged: true,
          reason: "verifier_policy_dispute",
          order: await getOrderSnapshot(fulfilled.id),
          challenge,
        };
      }
    }

    return {
      ok: true,
      order:
        challenge.attempted && "order" in challenge && challenge.order
          ? challenge.order
          : fulfilled,
      challenge,
    };
  });

  const port = Number(process.env.PROOF_VERIFIER_PORT || DEFAULT_PORT);
  await app.listen({ port, host: "0.0.0.0" });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
