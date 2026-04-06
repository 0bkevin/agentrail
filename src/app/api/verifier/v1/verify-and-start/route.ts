import { getOrderSnapshot, transitionOrder } from "@/lib/agentrail-store";
import type { ProofSubmission } from "@/lib/agentrail-types";
import { readEscrowOrderStatus } from "@/lib/escrow-read";
import { orchestrateChallengeWindow } from "@/lib/verifier-orchestrator";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      orderId?: string;
      txHash?: `0x${string}`;
      proofSubmission?: ProofSubmission;
    };

    if (!body.orderId || !body.proofSubmission) {
      return Response.json({ ok: false, error: "orderId and proofSubmission are required." }, { status: 400 });
    }

    const operatorAddress = process.env.AGENTRAIL_OPERATOR_ADDRESS;
    if (!operatorAddress) {
      return Response.json(
        { ok: false, error: "AGENTRAIL_OPERATOR_ADDRESS is required for proof verifier service." },
        { status: 500 },
      );
    }

    const order = await getOrderSnapshot(body.orderId);
    const providerWallet = order.providerWallet;

    if (!providerWallet) {
      return Response.json({ ok: false, error: "Order is missing provider wallet." }, { status: 400 });
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

      return Response.json({
        ok: true,
        flagged: true,
        reason: "verifier_policy_dispute",
        order: await getOrderSnapshot(fulfilled.id),
        challenge,
      });
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
        return Response.json({
          ok: true,
          flagged: true,
          reason: "verifier_policy_dispute",
          order: await getOrderSnapshot(fulfilled.id),
          challenge,
        });
      }
    }

    return Response.json({
      ok: true,
      order: challenge.attempted && "order" in challenge && challenge.order ? challenge.order : fulfilled,
      challenge,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Proof verification failed." },
      { status: 500 },
    );
  }
}
