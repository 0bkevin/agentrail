import { syncEscrowEvents } from "@/lib/event-sync";

export async function POST() {
  try {
    const result = await syncEscrowEvents();
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Event sync failed.",
      },
      { status: 500 },
    );
  }
}
