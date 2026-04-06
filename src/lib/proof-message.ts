import type { ProofPayload } from "@/lib/agentrail-types";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);

  return `{${entries.join(",")}}`;
}

export function proofMessage(payload: ProofPayload): string {
  return [
    "AgentRail Fulfillment Proof",
    "Version:1",
    `Payload:${stableStringify(payload)}`,
  ].join("\n");
}
