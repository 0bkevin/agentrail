import { randomUUID } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";

import { getOrderSnapshot } from "@/lib/agentrail-store";
import { storeArtifact } from "@/lib/artifact-store";
import type { ApiProofPayload, ProofSubmission } from "@/lib/agentrail-types";
import { proofMessage } from "@/lib/proof-message";

export const runtime = "nodejs";

const providerPrivateKey =
  (process.env.PROVIDER_API_PRIVATE_KEY as `0x${string}` | undefined) ||
  "0x59c6995e998f97a5a0044966f094538c5f6d8c6f0f7f13f0ef5f0f6a3d8f6b4a";

const account = privateKeyToAccount(providerPrivateKey);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      orderId?: string;
      requestHash?: string;
      company?: string;
    };

    if (!body.orderId || !body.requestHash) {
      return Response.json({ ok: false, error: "orderId and requestHash are required." }, { status: 400 });
    }

    const order = await getOrderSnapshot(body.orderId);

    if (order.status !== "accepted") {
      return Response.json(
        { ok: false, error: `Order ${order.id} is not accepted and cannot be fulfilled.` },
        { status: 400 },
      );
    }

    if (order.serviceType !== "paid_api") {
      return Response.json({ ok: false, error: `Order ${order.id} is not an API fulfillment.` }, { status: 400 });
    }

    if (order.requestHash !== body.requestHash) {
      return Response.json({ ok: false, error: "requestHash does not match the order record." }, { status: 400 });
    }

    if (order.providerWallet && order.providerWallet.toLowerCase() !== account.address.toLowerCase()) {
      return Response.json(
        { ok: false, error: "Signer address does not match the assigned provider wallet." },
        { status: 400 },
      );
    }

    const expectedCompany = order.requestPayload.target;
    if (expectedCompany && body.company && expectedCompany !== body.company) {
      return Response.json(
        { ok: false, error: "Requested company does not match order payload target." },
        { status: 400 },
      );
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

    return Response.json({
      ok: true,
      providerAddress: account.address,
      proof,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate API proof." },
      { status: 500 },
    );
  }
}
