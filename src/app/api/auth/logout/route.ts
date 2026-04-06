import { clearSessionCookie } from "@/lib/wallet-auth";

export async function POST() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
