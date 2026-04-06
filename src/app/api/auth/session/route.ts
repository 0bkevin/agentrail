import { getSessionAddress } from "@/lib/wallet-auth";

export async function GET() {
  const address = await getSessionAddress();
  return Response.json({ authenticated: Boolean(address), address });
}
