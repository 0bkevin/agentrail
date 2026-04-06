import { recoverMessageAddress } from "viem";

import type { Order, ProofPayload, ProofSubmission, ServiceType } from "@/lib/agentrail-types";
import { verifyArtifact } from "@/lib/artifact-store";
import { proofMessage } from "@/lib/proof-message";

const PROOF_MAX_AGE_MS = 5 * 60 * 1000;

function mapServiceTypeToPayloadKind(serviceType: ServiceType) {
  switch (serviceType) {
    case "paid_api":
      return "api";
    case "iot_action":
      return "iot";
    case "human_task":
      return "api";
  }
}

export async function verifyProofSubmission(params: {
  order: Order;
  submission: ProofSubmission;
  expectedSigner: string;
  expectedDeviceId?: string;
  now?: number;
}) {
  const { order, submission, expectedSigner, expectedDeviceId } = params;
  const currentTime = params.now ?? Date.now();

  const payloadKind = mapServiceTypeToPayloadKind(order.serviceType);
  if (submission.payload.kind !== payloadKind) {
    throw new Error(`Invalid proof type for ${order.serviceType}.`);
  }

  if (submission.payload.orderId !== order.id) {
    throw new Error("Proof orderId does not match the order.");
  }

  if (submission.payload.requestHash !== order.requestHash) {
    throw new Error("Proof requestHash does not match the order request hash.");
  }

  if (Math.abs(currentTime - submission.payload.timestamp) > PROOF_MAX_AGE_MS) {
    throw new Error("Proof payload is outside the allowed freshness window.");
  }

  if (!submission.payload.responseHash || !submission.payload.resultUri) {
    throw new Error("Proof payload must include responseHash and resultUri.");
  }

  await verifyArtifact(submission.payload.resultUri, submission.payload.responseHash);

  if (submission.payload.kind === "iot") {
    if (!expectedDeviceId) {
      throw new Error("Expected device ID is required for IoT proof verification.");
    }
    if (submission.payload.deviceId !== expectedDeviceId) {
      throw new Error("Proof deviceId does not match the expected device.");
    }
  }

  const message = proofMessage(submission.payload as ProofPayload);
  const recoveredAddress = await recoverMessageAddress({
    message,
    signature: submission.signature,
  });

  if (recoveredAddress.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new Error("Proof signature does not match expected signer.");
  }

  return {
    message,
    signerAddress: recoveredAddress,
    payload: submission.payload,
  };
}
