import cors from "@fastify/cors";
import Fastify from "fastify";
import { privateKeyToAccount } from "viem/accounts";

import type { IotProofPayload, ProofSubmission } from "../src/lib/agentrail-types";
import { storeArtifact } from "../src/lib/artifact-store";
import { proofMessage } from "../src/lib/proof-message";

const DEFAULT_PORT = 4102;
const DEFAULT_APP_URL = "http://localhost:3000";

const devicePrivateKey =
  (process.env.DEVICE_SIM_PRIVATE_KEY as `0x${string}` | undefined) ||
  "0x8b3a350cf5c34c9194ca5f9f80f2f0a2ce6a4b5dc1f4f2a20e3f9e5ab4f8d7c1";

const account = privateKeyToAccount(devicePrivateKey);

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
      service: "device-sim",
      deviceSigner: account.address,
    };
  });

  app.post("/device/execute", async (request) => {
    const body = request.body as {
      orderId?: string;
      requestHash?: string;
      deviceId?: string;
      actionType?: string;
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

    if (order.serviceType !== "iot_action") {
      return {
        ok: false,
        error: `Order ${order.id} is not an IoT fulfillment.`,
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
        error: "Signer address does not match the assigned provider/device signer wallet.",
      };
    }

    const expectedDeviceId = order.requestPayload.deviceId;
    const expectedAction = order.requestPayload.action;

    if (expectedDeviceId && body.deviceId && expectedDeviceId !== body.deviceId) {
      return {
        ok: false,
        error: "Requested deviceId does not match order payload deviceId.",
      };
    }

    if (expectedAction && body.actionType && expectedAction !== body.actionType) {
      return {
        ok: false,
        error: "Requested actionType does not match order payload action.",
      };
    }

    const deviceId = expectedDeviceId ?? body.deviceId ?? "dock-sensor-12";
    const actionType = expectedAction ?? body.actionType ?? "read-temperature";

    const result =
      actionType === "unlock"
        ? { status: "unlocked", door: deviceId }
        : { reading: "21.6C", humidity: "49%", sensor: deviceId };

    const artifact = await storeArtifact({
      service: "device-sim",
      orderId: body.orderId,
      result,
    });

    const payload: IotProofPayload = {
      kind: "iot",
      orderId: body.orderId,
      requestHash: body.requestHash,
      resultUri: artifact.resultUri,
      responseHash: artifact.responseHash,
      timestamp: Date.now(),
      deviceId,
      actionType,
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
      deviceSigner: account.address,
      proof,
    };
  });

  const port = Number(process.env.DEVICE_SIM_PORT || DEFAULT_PORT);
  await app.listen({ port, host: "0.0.0.0" });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
