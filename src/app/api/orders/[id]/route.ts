import { getOrderSnapshot } from "@/lib/agentrail-store";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    return Response.json({ order: await getOrderSnapshot(id) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Order not found." },
      { status: 404 },
    );
  }
}
