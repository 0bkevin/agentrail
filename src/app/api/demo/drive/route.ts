import { randomUUID } from "node:crypto";

import {
  attachOnchainOrder,
  createProposal,
  createOrderFromProposalId,
  getOrderSnapshot,
  transitionOrder,
} from "@/lib/agentrail-store";

function isLocalRequest(request: Request) {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

function demoTx(label: string) {
  const hex = Buffer.from(`${label}:${randomUUID()}`).toString("hex").slice(0, 64).padEnd(64, "0");
  return `0x${hex}` as `0x${string}`;
}

function demoOnchainOrderId() {
  return String(Date.now()).slice(-6);
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return Response.json({ error: "Demo drive is only available on localhost." }, { status: 403 });
  }

  const body = (await request.json()) as {
    action?: "proposal" | "fund_order" | "accept" | "submit_proof" | "start_challenge" | "approve_early" | "dispute" | "settle" | "resolve" | "cancel";
    proposalId?: string;
    orderId?: string;
    reason?: string;
    providerWins?: boolean;
    prompt?: string;
  };

  if (!body.action) {
    return Response.json({ error: "action is required." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "proposal": {
        const proposal = await createProposal(
          body.prompt?.trim() || "Buy a signed company enrichment response and settle after proof verification.",
        );
        return Response.json({ proposal });
      }

      case "fund_order": {
        if (!body.proposalId) {
          return Response.json({ error: "proposalId is required." }, { status: 400 });
        }

        const created = await createOrderFromProposalId(body.proposalId, {
          role: "buyer",
          actorId: "0x1111111111111111111111111111111111111111",
        });
        const order = await attachOnchainOrder(created.id, demoOnchainOrderId(), demoTx("fund"));
        return Response.json({ order });
      }

      case "accept": {
        if (!body.orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }
        const current = await getOrderSnapshot(body.orderId);
        const order = await transitionOrder({
          orderId: body.orderId,
          action: "accept",
          actor: {
            role: "provider",
            actorId: current.providerWallet ?? "0xc9C94744BEc22DDF156e4d0a7d6D0D39ad863d46",
          },
          txHash: demoTx("accept"),
        });
        return Response.json({ order });
      }

      case "submit_proof": {
        if (!body.orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }
        const current = await getOrderSnapshot(body.orderId);
        const order = await transitionOrder({
          orderId: body.orderId,
          action: "submit_proof",
          actor: {
            role: "provider",
            actorId: current.providerWallet ?? "0xc9C94744BEc22DDF156e4d0a7d6D0D39ad863d46",
          },
          txHash: demoTx("submit-proof"),
          skipProofVerification: true,
        });
        return Response.json({ order });
      }

      case "start_challenge": {
        if (!body.orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }
        const order = await transitionOrder({
          orderId: body.orderId,
          action: "start_challenge",
          actor: {
            role: "operator",
            actorId: process.env.AGENTRAIL_OPERATOR_ADDRESS ?? "0x549390539BE66EA6efb99A0bB74be87Aeac18372",
          },
          txHash: demoTx("start-challenge"),
        });
        return Response.json({ order });
      }

      case "approve_early": {
        if (!body.orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }
        const current = await getOrderSnapshot(body.orderId);
        const order = await transitionOrder({
          orderId: body.orderId,
          action: "approve_early",
          actor: {
            role: "buyer",
            actorId: current.buyer,
          },
          txHash: demoTx("approve-early"),
        });
        return Response.json({ order });
      }

      case "dispute": {
        if (!body.orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }
        const current = await getOrderSnapshot(body.orderId);
        const order = await transitionOrder({
          orderId: body.orderId,
          action: "dispute",
          actor: {
            role: "buyer",
            actorId: current.buyer,
          },
          reason: body.reason ?? "Demo dispute triggered for walkthrough.",
          txHash: demoTx("dispute"),
        });
        return Response.json({ order });
      }

      case "settle": {
        if (!body.orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }
        const current = await getOrderSnapshot(body.orderId);
        const order = await transitionOrder({
          orderId: body.orderId,
          action: "settle",
          actor: {
            role: "operator",
            actorId: process.env.AGENTRAIL_OPERATOR_ADDRESS ?? current.buyer,
          },
          txHash: demoTx("settle"),
        });
        return Response.json({ order });
      }

      case "resolve": {
        if (!body.orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }
        const order = await transitionOrder({
          orderId: body.orderId,
          action: "resolve",
          actor: {
            role: "arbiter",
            actorId: process.env.AGENTRAIL_ARBITER_ADDRESS ?? "0x549390539BE66EA6efb99A0bB74be87Aeac18372",
          },
          providerWins: body.providerWins ?? true,
          txHash: demoTx("resolve"),
        });
        return Response.json({ order });
      }

      case "cancel": {
        if (!body.orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }
        const current = await getOrderSnapshot(body.orderId);
        const order = await transitionOrder({
          orderId: body.orderId,
          action: "cancel",
          actor: {
            role: "buyer",
            actorId: current.buyer,
          },
          txHash: demoTx("cancel"),
        });
        return Response.json({ order });
      }
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Demo action failed." },
      { status: 400 },
    );
  }
}
