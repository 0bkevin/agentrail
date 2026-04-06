import { transitionOrder } from "@/lib/agentrail-store";
import type { ActorContext, ProofSubmission, TransitionAction } from "@/lib/agentrail-types";
import { getSessionAddress } from "@/lib/wallet-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    orderId?: string;
    action?: TransitionAction;
    role?: ActorContext["role"];
    reason?: string;
    evidenceUri?: string;
    providerWins?: boolean;
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

  if (!body.orderId || !body.action || !body.role) {
    return Response.json({ error: "orderId, action, and role are required." }, { status: 400 });
  }

  let proofSubmission: ProofSubmission | undefined;
  if (body.proofSubmission) {
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
  }

  try {
    const sessionAddress = await getSessionAddress();
    if (!sessionAddress) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }

    const order = await transitionOrder({
      orderId: body.orderId,
      action: body.action,
      actor: {
        role: body.role,
        actorId: sessionAddress,
      },
      reason: body.reason,
      evidenceUri: body.evidenceUri,
      providerWins: body.providerWins,
      txHash: body.txHash,
      proofSubmission,
    });
    return Response.json({ order });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown transition error." },
      { status: 400 },
    );
  }
}
