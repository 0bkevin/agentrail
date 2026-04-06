import { getDashboardSnapshot } from "@/lib/agentrail-store";

export async function GET() {
  return Response.json(getDashboardSnapshot());
}
