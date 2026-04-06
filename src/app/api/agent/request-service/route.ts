import { createProposal } from "@/lib/agentrail-store";
import { planRequestWithLlm } from "@/lib/agent-llm";
import { toReadmeServiceType } from "@/lib/service-type";

export async function POST(request: Request) {
  const body = (await request.json()) as { prompt?: string };
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return Response.json({ error: "Prompt is required." }, { status: 400 });
  }

  const plan = await planRequestWithLlm(prompt);
  const proposal = await createProposal(prompt, {
    serviceType: plan.serviceType,
    requestPayload: plan.normalizedRequest,
  });

  return Response.json({
    proposal,
    agentPlan: {
      model: plan.model,
      serviceType: toReadmeServiceType(proposal.serviceType),
      normalizedRequest: plan.normalizedRequest,
      suggestedProvider: proposal.providerId,
    },
  });
}
