import { setSessionCookie, verifyChallenge } from "@/lib/wallet-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    address?: string;
    message?: string;
    signature?: `0x${string}`;
    challengeToken?: string;
  };

  if (!body.address || !body.message || !body.signature || !body.challengeToken) {
    return Response.json({ error: "address, message, signature, and challengeToken are required." }, { status: 400 });
  }

  try {
    const sessionToken = await verifyChallenge({
      address: body.address,
      message: body.message,
      signature: body.signature,
      challengeToken: body.challengeToken,
    });
    await setSessionCookie(sessionToken);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not verify signature." },
      { status: 401 },
    );
  }
}
