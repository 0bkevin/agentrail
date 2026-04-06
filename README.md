# AgentRail MVP

AgentRail is an autonomous commerce settlement rail for AI agents and IoT devices. This app implements escrowed service orders, provider collateral, signed fulfillment proofs, optimistic challenge windows, and dispute fallback.

Agent request planning uses the DigitalOcean Gradient SDK-compatible chat completion API (with deterministic fallback heuristics if API credentials are absent).

## Implemented Scope

- Flow A: paid API provider fulfillment with signed proof.
- Flow B: IoT device simulator fulfillment with signed proof.
- Flow C: human task provider path (same escrow lifecycle, stretch flow).
- Wallet auth with Reown AppKit + signed session.
- On-chain lifecycle on Base Sepolia via `AgentRailEscrow`.
- Provider registry contract support via `ProviderRegistry`.
- Neon/Postgres persistence for orders/proofs/disputes/audit.
- Event sync worker with log-level idempotency keys.
- Dedicated proof verifier service boundary.
- Buyer early settlement approval before challenge deadline.
- Configurable partial slashing for buyer-win dispute resolution.

## Architecture

```text
Buyer UI / Agent
    |
    v
Next.js Dashboard + API  <---->  Provider API / Device Sim / Proof Verifier
    |                                        |
    v                                        v
Postgres (Neon)                        Signed proof payloads
    |
    v
AgentRailEscrow + ProviderRegistry (Base Sepolia)
```

## Smart Contracts

- `contracts/AgentRailEscrow.sol`
  - create, accept, submit proof hash, start challenge, dispute, settle, resolve, cancel
  - buyer early settlement approval: `approveEarlySettlement`
  - configurable buyer-win slash basis points: `setProviderSlashBpsOnBuyerWin`
- `contracts/ProviderRegistry.sol`
  - provider wallet + device signer + service mask + metadata

## Services

- `services/provider-api.ts` on `:4101`
- `services/device-sim.ts` on `:4102`
- `services/proof-verifier.ts` on `:4103`
- `services/human-solver.ts` on `:4104`
- `services/sync-worker.ts` (polling chain event sync)

## Required Environment

Copy `.env.example` to `.env.local` and fill values.

Important vars:

- `BASE_SEPOLIA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS`
- `NEXT_PUBLIC_MOCK_USDC_ADDRESS`
- `PROVIDER_REGISTRY_ADDRESS` and/or `NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS`
- `AGENTRAIL_OPERATOR_ADDRESS`
- `AGENTRAIL_OPERATOR_PRIVATE_KEY`
- `AGENTRAIL_ARBITER_ADDRESS`
- `DATABASE_URL` or `NEON_DATABASE_URL`
- `PROVIDER_API_PRIVATE_KEY`
- `DEVICE_SIM_PRIVATE_KEY`
- `NEXT_PUBLIC_PROVIDER_API_URL`
- `NEXT_PUBLIC_DEVICE_SIM_URL`
- `NEXT_PUBLIC_PROOF_VERIFIER_URL`
- `NEXT_PUBLIC_HUMAN_SOLVER_URL`
- `GRADIENT_API_KEY`
- `GRADIENT_BASE_URL` (default `https://api.gradient.ai/api`)
- `GRADIENT_MODEL`

Optional:

- `AGENTRAIL_CHALLENGE_WINDOW_SECONDS` (default 120)
- `AGENTRAIL_AUTOSTART_CHALLENGE` (default true)
- `AGENTRAIL_AUTOSETTLE_ENABLED` (default true)
- `ESCROW_SYNC_INTERVAL_MS` (default 10000)

## Install

```bash
pnpm install
```

## Contract Commands

Compile + test:

```bash
pnpm contracts:compile
pnpm contracts:test
```

Deploy escrow + token:

```bash
pnpm contracts:deploy:base-sepolia
```

Deploy provider registry:

```bash
pnpm contracts:deploy:registry:base-sepolia
```

Configure verifier/resolver roles:

```bash
pnpm contracts:configure:roles:base-sepolia
```

## Run Locally

Fastest demo startup:

```bash
pnpm demo:up
```

Reset all off-chain demo state (orders, proposals, terminal logs, proofs/disputes/audit rows, auth sessions, sync cursors, local artifacts):

```bash
pnpm demo:reset
```

Then rerun `pnpm demo:up`.

Terminal 1:

```bash
pnpm dev
```

Terminal 2:

```bash
pnpm service:provider-api
```

Terminal 3:

```bash
pnpm service:device-sim
```

Terminal 4:

```bash
pnpm service:proof-verifier
```

Terminal 5:

```bash
pnpm worker:sync
```

Terminal 6:

```bash
pnpm service:human-solver
```

## API Endpoints

- `POST /api/agent/request-service`
- `POST /api/orders/quote`
- `POST /api/orders`
- `POST /api/orders/action`
- `POST /api/orders/:id/dispute`
- `GET /api/orders/:id`
- `POST /api/sync/escrow-events`

Service endpoints:

- `POST /v1/company-enrichment` (provider API)
- `POST /device/execute` (device simulator)
- `POST /v1/verify-and-start` (proof verifier)
- `POST /v1/human-task` (human solver)

## MVP Freeze Checklist

- Freeze feature scope: no additional architecture changes.
- Keep demo to 2 flows only:
  - Happy path: fund -> accept -> proof -> verifier -> settle.
  - Dispute path: fund -> accept -> proof -> dispute -> arbiter resolve.
- Use one startup command: `pnpm demo:up`.
- Before each rehearsal/demo run: `pnpm demo:reset`.

## Demo Script (4-6 Minutes)

1. Setup (30s)
   - Show `/buyer` and connected authenticated wallet.
   - Mention escrow and challenge-based settlement model.
2. Happy path (2m)
   - Generate proposal from buyer prompt.
   - Approve proposal to fund escrow.
   - Switch to provider route and accept/stake.
   - Submit proof (provider API or IoT).
   - Show verifier/challenge start and settlement transition.
3. Dispute path (2m)
   - Create second order.
   - Accept and submit proof.
   - Open dispute from buyer/operator.
   - Resolve on `/arbiter` (provider wins or buyer refunded).
4. Close (30s)
   - Show timeline + tx hashes + terminal/audit indicators.
   - Emphasize reusable rail for AI/API/IoT/human providers.

## Rehearsal Timing Guidance

- Target total runtime: 4-6 minutes.
- Run 3 full rehearsals before live demo.
- Keep one backup browser tab already authenticated.
- If a step stalls, move to the next role route and continue the narrative.

## Demo Flow

1. Connect + authenticate wallet.
2. Buyer creates proposal and funds order (on-chain create).
3. Provider accepts (on-chain stake).
4. Provider API or device simulator returns signed proof.
5. Provider submits fulfillment hash on-chain.
6. Proof verifier validates signature + payload and starts challenge window.
7. Either:
   - buyer approves early settlement, or
   - no dispute until deadline then settle, or
   - dispute and arbiter resolve.

## Route-level Dashboards

- Landing: `/`
- Buyer: `/buyer`
- Provider: `/provider`
- Operator: `/operator`
- Arbiter: `/arbiter`

## Notes on Source of Truth

- On-chain tx execution is primary for settlement actions.
- Event sync ingests contract events and deduplicates by tx hash + log index.
- Off-chain state is persisted for UX, audit logs, and service orchestration.
