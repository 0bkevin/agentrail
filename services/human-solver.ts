import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import Fastify from "fastify";
import { privateKeyToAccount } from "viem/accounts";

import type { ApiProofPayload, ProofSubmission } from "../src/lib/agentrail-types";
import { storeArtifact } from "../src/lib/artifact-store";
import { proofMessage } from "../src/lib/proof-message";

const DEFAULT_PORT = 4104;
const DEFAULT_APP_URL = "http://localhost:3000";

const humanPrivateKey =
  (process.env.HUMAN_SOLVER_PRIVATE_KEY as `0x${string}` | undefined) ||
  (process.env.PROVIDER_API_PRIVATE_KEY as `0x${string}` | undefined) ||
  "0x59c6995e998f97a5a0044966f094538c5f6d8c6f0f7f13f0ef5f0f6a3d8f6b4a";

const account = privateKeyToAccount(humanPrivateKey);

async function fetchOrder(orderId: string) {
  const appUrl = process.env.AGENTRAIL_APP_URL || DEFAULT_APP_URL;
  const response = await fetch(`${appUrl}/api/orders/${orderId}`);
  const json = (await response.json()) as {
    order?: {
      id: string;
      status: string;
      providerWallet?: string;
      requestHash: string;
      serviceType: string;
      requestPayload: Record<string, string>;
    };
    error?: string;
  };

  if (!response.ok || !json.order) {
    throw new Error(json.error || `Unable to load order ${orderId} from app API.`);
  }

  return json.order;
}

async function start() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/health", async () => {
    return {
      ok: true,
      service: "human-solver",
      signerAddress: account.address,
    };
  });

  app.post("/v1/human-task", async (request) => {
    const body = request.body as {
      orderId?: string;
      requestHash?: string;
    };

    if (!body.orderId || !body.requestHash) {
      return {
        ok: false,
        error: "orderId and requestHash are required.",
      };
    }

    const order = await fetchOrder(body.orderId);
    if (order.status !== "accepted") {
      return { ok: false, error: `Order ${order.id} is not accepted and cannot be fulfilled.` };
    }
    if (order.serviceType !== "human_task") {
      return { ok: false, error: `Order ${order.id} is not a human-task fulfillment.` };
    }
    if (order.requestHash !== body.requestHash) {
      return { ok: false, error: "requestHash does not match the order record." };
    }
    if (order.providerWallet && order.providerWallet.toLowerCase() !== account.address.toLowerCase()) {
      return { ok: false, error: "Signer address does not match assigned human provider wallet." };
    }

    const result = {
      task: order.requestPayload.issue ?? "unspecified",
      resolution: "Patched config and restarted worker. Verification checks pass.",
      artifactUri: `ipfs://agentrail/human/${order.id}/${Date.now()}`,
      reviewedBy: "ops-human-01",
      traceId: randomUUID(),
      generatedAt: Date.now(),
    };

    const artifact = await storeArtifact({
      service: "human-solver",
      orderId: body.orderId,
      result,
    });

    const payload: ApiProofPayload = {
      kind: "api",
      orderId: body.orderId,
      requestHash: body.requestHash,
      resultUri: artifact.resultUri,
      responseHash: artifact.responseHash,
      timestamp: Date.now(),
      result,
    };

    const signature = await account.signMessage({ message: proofMessage(payload) });
    const proof: ProofSubmission = { payload, signature };

    return {
      ok: true,
      signerAddress: account.address,
      proof,
    };
  });

  const port = Number(process.env.HUMAN_SOLVER_PORT || DEFAULT_PORT);
  await app.listen({ port, host: "0.0.0.0" });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
