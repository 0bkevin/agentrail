import { transitionOrder } from "@/lib/agentrail-store";
import type { ActorContext, ProofSubmission } from "@/lib/agentrail-types";
import { orchestrateChallengeWindow } from "@/lib/verifier-orchestrator";
import { getSessionAddress } from "@/lib/wallet-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    role?: ActorContext["role"];
    txHash?: string;
    proofSubmission?: {
      payload: {
        kind: "api" | "iot";
        orderId: string;
        requestHash: string;
        resultUri: string;
        responseHash: string;
        timestamp: number;
        result: unknown;
        deviceId?: string;
        actionType?: string;
      };
      signature: `0x${string}`;
    };
  };

  if (!body.role) {
    return Response.json({ error: "role is required." }, { status: 400 });
  }

  if (!body.proofSubmission) {
    return Response.json({ error: "proofSubmission is required." }, { status: 400 });
  }

  let proofSubmission: ProofSubmission;
  if (body.proofSubmission.payload.kind === "api") {
    proofSubmission = {
      signature: body.proofSubmission.signature,
      payload: {
        kind: "api",
        orderId: body.proofSubmission.payload.orderId,
        requestHash: body.proofSubmission.payload.requestHash,
        resultUri: body.proofSubmission.payload.resultUri,
        responseHash: body.proofSubmission.payload.responseHash,
        timestamp: body.proofSubmission.payload.timestamp,
        result: body.proofSubmission.payload.result,
      },
    };
  } else {
    if (!body.proofSubmission.payload.deviceId || !body.proofSubmission.payload.actionType) {
      return Response.json({ error: "deviceId and actionType are required for iot proofs." }, { status: 400 });
    }

    proofSubmission = {
      signature: body.proofSubmission.signature,
      payload: {
        kind: "iot",
        orderId: body.proofSubmission.payload.orderId,
        requestHash: body.proofSubmission.payload.requestHash,
        resultUri: body.proofSubmission.payload.resultUri,
        responseHash: body.proofSubmission.payload.responseHash,
        timestamp: body.proofSubmission.payload.timestamp,
        result: body.proofSubmission.payload.result,
        deviceId: body.proofSubmission.payload.deviceId,
        actionType: body.proofSubmission.payload.actionType,
      },
    };
  }

  try {
    const sessionAddress = await getSessionAddress();
    if (!sessionAddress) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }

    const fulfilled = await transitionOrder({
      orderId: id,
      action: "submit_proof",
      actor: {
        role: body.role,
        actorId: sessionAddress,
      },
      txHash: body.txHash,
      proofSubmission,
    });

    const orchestration = await orchestrateChallengeWindow(fulfilled);

    return Response.json({
      order:
        orchestration.attempted && "order" in orchestration && orchestration.order
          ? orchestration.order
          : fulfilled,
      challengeStart:
        orchestration.attempted && "txHash" in orchestration
          ? {
              attempted: true,
              txHash: orchestration.txHash,
            }
          : {
              attempted: false,
              reason: orchestration.reason,
            },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not submit proof." },
      { status: 400 },
    );
  }
}
