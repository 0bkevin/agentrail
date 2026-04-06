import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { stableStringify } from "@/lib/proof-message";

function artifactsRoot() {
  return path.resolve(process.cwd(), "data", "artifacts");
}

function digest(content: string) {
  return `0x${createHash("sha256").update(content).digest("hex")}`;
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function storeArtifact(params: {
  service: string;
  orderId: string;
  result: unknown;
}) {
  const normalized = stableStringify(params.result);
  const responseHash = digest(normalized);

  const dir = path.join(artifactsRoot(), safeSegment(params.service));
  await mkdir(dir, { recursive: true });

  const filename = `${safeSegment(params.orderId)}-${Date.now()}.json`;
  const fullPath = path.join(dir, filename);

  await writeFile(
    fullPath,
    JSON.stringify(
      {
        orderId: params.orderId,
        service: params.service,
        responseHash,
        result: params.result,
        storedAt: Date.now(),
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    resultUri: `file://${fullPath}`,
    responseHash,
  };
}

export async function verifyArtifact(uri: string, expectedResponseHash: string) {
  if (!uri.startsWith("file://")) {
    throw new Error("Only file:// artifact URIs are supported in MVP verification.");
  }

  const fullPath = uri.slice("file://".length);
  const raw = await readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw) as {
    responseHash?: string;
    result?: unknown;
  };

  const computed = digest(stableStringify(parsed.result ?? null));
  if (computed !== expectedResponseHash) {
    throw new Error("Artifact response hash does not match payload responseHash.");
  }

  if (parsed.responseHash && parsed.responseHash !== expectedResponseHash) {
    throw new Error("Artifact embedded responseHash does not match expected responseHash.");
  }

  return {
    computed,
  };
}
