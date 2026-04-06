import { setSessionCookie, verifyChallenge } from "@/lib/wallet-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    address?: string;
    message?: string;
    signature?: `0x${string}`;
  };

  if (!body.address || !body.message || !body.signature) {
    return Response.json({ error: "address, message, and signature are required." }, { status: 400 });
  }

  try {
    const sessionToken = await verifyChallenge({
      address: body.address,
      message: body.message,
      signature: body.signature,
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
