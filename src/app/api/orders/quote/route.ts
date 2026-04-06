import { createQuote } from "@/lib/agentrail-store";
import type { ServiceType } from "@/lib/agentrail-types";
import { parseServiceType, toReadmeServiceType } from "@/lib/service-type";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    serviceType?: ServiceType | string;
    request?: Record<string, unknown>;
  };

  const normalizedType = parseServiceType(body.serviceType);

  if (!normalizedType || !body.request) {
    return Response.json({ error: "serviceType and request are required." }, { status: 400 });
  }

  try {
    const proposal = await createQuote(normalizedType, body.request);
    return Response.json({
      proposalId: proposal.id,
      serviceType: toReadmeServiceType(proposal.serviceType),
      providerId: proposal.providerId,
      paymentAmount: String(proposal.paymentAmount),
      providerStake: String(proposal.providerStake),
      requestHash: proposal.requestHash,
      token: "mockUSDC",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create quote." },
      { status: 400 },
    );
  }
}
