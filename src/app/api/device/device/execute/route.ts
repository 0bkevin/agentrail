import { privateKeyToAccount } from "viem/accounts";

import { getOrderSnapshot } from "@/lib/agentrail-store";
import { storeArtifact } from "@/lib/artifact-store";
import type { IotProofPayload, ProofSubmission } from "@/lib/agentrail-types";
import { proofMessage } from "@/lib/proof-message";

export const runtime = "nodejs";

const devicePrivateKey =
  (process.env.DEVICE_SIM_PRIVATE_KEY as `0x${string}` | undefined) ||
  "0x8b3a350cf5c34c9194ca5f9f80f2f0a2ce6a4b5dc1f4f2a20e3f9e5ab4f8d7c1";

const account = privateKeyToAccount(devicePrivateKey);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      orderId?: string;
      requestHash?: string;
      deviceId?: string;
      actionType?: string;
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

    if (order.serviceType !== "iot_action") {
      return Response.json({ ok: false, error: `Order ${order.id} is not an IoT fulfillment.` }, { status: 400 });
    }

    if (order.requestHash !== body.requestHash) {
      return Response.json({ ok: false, error: "requestHash does not match the order record." }, { status: 400 });
    }

    if (order.providerWallet && order.providerWallet.toLowerCase() !== account.address.toLowerCase()) {
      return Response.json(
        { ok: false, error: "Signer address does not match the assigned provider/device signer wallet." },
        { status: 400 },
      );
    }

    const expectedDeviceId = order.requestPayload.deviceId;
    const expectedAction = order.requestPayload.action;

    if (expectedDeviceId && body.deviceId && expectedDeviceId !== body.deviceId) {
      return Response.json(
        { ok: false, error: "Requested deviceId does not match order payload deviceId." },
        { status: 400 },
      );
    }

    if (expectedAction && body.actionType && expectedAction !== body.actionType) {
      return Response.json(
        { ok: false, error: "Requested actionType does not match order payload action." },
        { status: 400 },
      );
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

    return Response.json({
      ok: true,
      deviceSigner: account.address,
      proof,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate IoT proof." },
      { status: 500 },
    );
  }
}
