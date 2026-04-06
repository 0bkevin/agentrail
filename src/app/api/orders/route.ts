import { attachOnchainOrder, createOrderFromProposalId, getDashboardSnapshot } from "@/lib/agentrail-store";
import { getSessionAddress } from "@/lib/wallet-auth";

export async function GET() {
  return Response.json(await getDashboardSnapshot());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    proposalId?: string;
    onchainOrderId?: string;
    txHash?: string;
  };
  if (!body.proposalId) {
    return Response.json({ error: "proposalId is required." }, { status: 400 });
  }

  try {
    const sessionAddress = await getSessionAddress();
    if (!sessionAddress) {
      return Response.json({ error: "Wallet authentication required." }, { status: 401 });
    }

    const createdOrder = await createOrderFromProposalId(body.proposalId, {
      role: "buyer",
      actorId: sessionAddress,
    });

    if (body.onchainOrderId && body.txHash) {
      const order = await attachOnchainOrder(createdOrder.id, body.onchainOrderId, body.txHash);
      return Response.json({ order }, { status: 201 });
    }

    return Response.json({ order: createdOrder }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create order." },
      { status: 400 },
    );
  }
}
