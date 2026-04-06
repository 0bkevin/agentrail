import { buildChallenge } from "@/lib/wallet-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { address?: string };
  if (!body.address) {
    return Response.json({ error: "address is required." }, { status: 400 });
  }

  try {
    const challenge = await buildChallenge(body.address);
    return Response.json(challenge);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create challenge." },
      { status: 400 },
    );
  }
}
