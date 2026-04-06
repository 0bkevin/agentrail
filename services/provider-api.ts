import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import Fastify from "fastify";
import { privateKeyToAccount } from "viem/accounts";

import type { ApiProofPayload, ProofSubmission } from "../src/lib/agentrail-types";
import { storeArtifact } from "../src/lib/artifact-store";
import { proofMessage } from "../src/lib/proof-message";

const DEFAULT_PORT = 4101;
const DEFAULT_APP_URL = "http://localhost:3000";

const providerPrivateKey =
  (process.env.PROVIDER_API_PRIVATE_KEY as `0x${string}` | undefined) ||
  "0x59c6995e998f97a5a0044966f094538c5f6d8c6f0f7f13f0ef5f0f6a3d8f6b4a";

const account = privateKeyToAccount(providerPrivateKey);

async function fetchOrder(orderId: string) {
  const appUrl = process.env.AGENTRAIL_APP_URL || DEFAULT_APP_URL;
  const response = await fetch(`${appUrl}/api/orders/${orderId}`);
  const json = (await response.json()) as {
    order?: {
      id: string;
      status: string;
      providerId: string;
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
      service: "provider-api",
      providerAddress: account.address,
    };
  });

  app.post("/v1/company-enrichment", async (request) => {
    const body = request.body as {
      orderId?: string;
      requestHash?: string;
      company?: string;
    };

    if (!body.orderId || !body.requestHash) {
      return {
        ok: false,
        error: "orderId and requestHash are required.",
      };
    }

    const order = await fetchOrder(body.orderId);

    if (order.status !== "accepted") {
      return {
        ok: false,
        error: `Order ${order.id} is not accepted and cannot be fulfilled.`,
      };
    }

    if (order.serviceType !== "paid_api") {
      return {
        ok: false,
        error: `Order ${order.id} is not an API fulfillment.`,
      };
    }

    if (order.requestHash !== body.requestHash) {
      return {
        ok: false,
        error: "requestHash does not match the order record.",
      };
    }

    if (order.providerWallet && order.providerWallet.toLowerCase() !== account.address.toLowerCase()) {
      return {
        ok: false,
        error: "Signer address does not match the assigned provider wallet.",
      };
    }

    const expectedCompany = order.requestPayload.target;
    if (expectedCompany && body.company && expectedCompany !== body.company) {
      return {
        ok: false,
        error: "Requested company does not match order payload target.",
      };
    }

    const result = {
      company: expectedCompany ?? body.company ?? "Unknown",
      score: 87,
      riskTier: "medium",
      generatedAt: Date.now(),
      source: "provider-api-demo",
      traceId: randomUUID(),
    };

    const artifact = await storeArtifact({
      service: "provider-api",
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

    const signature = await account.signMessage({
      message: proofMessage(payload),
    });

    const proof: ProofSubmission = {
      payload,
      signature,
    };

    return {
      ok: true,
      providerAddress: account.address,
      proof,
    };
  });

  const port = Number(process.env.PROVIDER_API_PORT || DEFAULT_PORT);
  await app.listen({ port, host: "0.0.0.0" });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
