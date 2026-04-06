import { transitionOrder } from "@/lib/agentrail-store";
import type { ActorContext } from "@/lib/agentrail-types";
import { getSessionAddress } from "@/lib/wallet-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    role?: ActorContext["role"];
    reason?: string;
    evidenceUri?: string;
    txHash?: string;
  };

  if (!body.role) {
    return Response.json({ error: "role is required." }, { status: 400 });
  }

  try {
    const sessionAddress = await getSessionAddress();
    if (!sessionAddress) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }

    return Response.json({
      order: await transitionOrder({
        orderId: id,
        action: "dispute",
        actor: {
          role: body.role,
          actorId: sessionAddress,
        },
        reason: body.reason,
        evidenceUri: body.evidenceUri,
        txHash: body.txHash,
      }),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not open dispute." },
      { status: 400 },
    );
  }
}
