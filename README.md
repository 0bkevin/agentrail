# AgentRail MVP

AgentRail is a settlement rail for autonomous services: an AI agent (buyer) can pay an API/IoT/human provider only when verifiable work is delivered.

In plain terms, AgentRail does three things:
- locks buyer funds in escrow,
- requires cryptographically signed fulfillment proof,
- resolves outcomes via optimistic challenge + dispute fallback.

This repository includes a full Sepolia demo stack: smart contracts, role-based web app, proof services, and Neon persistence.

## Why this exists

Autonomous systems need trust-minimized payment rails. Traditional API billing assumes platform trust; AgentRail enforces settlement rules onchain:
- provider posts stake,
- provider submits proof hash,
- verifier opens challenge window,
- funds settle automatically if unchallenged,
- arbiter resolves disputes when needed.

## How it works

1. Buyer requests service and funds an escrow order.
2. Provider accepts and posts collateral.
3. Provider returns signed proof payload (API/IoT/human flow).
4. Proof verifier validates payload + signature.
5. Contract enters challenge window.
6. Final outcome:
   - early buyer approval, or
   - settle after window closes, or
   - dispute then arbiter resolution.

## Architecture

```text
Buyer UI / Agent
    |
    v
Next.js Dashboard + API  <---->  Provider API / Device Sim / Proof Verifier
    |                                        |
    v                                        v
Neon/Postgres                         Signed proof payloads
    |
    v
AgentRailEscrow + ProviderRegistry (Ethereum Sepolia)
```

## Core components

- `contracts/AgentRailEscrow.sol`
  - order lifecycle: `create`, `accept`, `submitFulfillment`, `startChallengeWindow`, `dispute`, `settle`, `resolve`, `cancel`
  - early settlement approval and configurable slashing
  - exact-token receipt checks for safer ERC20 accounting
- `contracts/ProviderRegistry.sol`
  - onchain provider metadata: wallet, device signer, service mask, metadata URI
- `src/app/*`
  - role dashboards: buyer, provider, operator, arbiter
- `services/*`
  - `provider-api.ts` (`:4101`), `device-sim.ts` (`:4102`), `proof-verifier.ts` (`:4103`), `human-solver.ts` (`:4104`)
- `src/lib/storage.ts`
  - Neon-backed persistence for orders, audits, proofs, disputes, sessions
- `scripts/sync-escrow-events.ts`
  - chain event sync with idempotent ingestion

## Supported flows

- Paid API fulfillment with signed proof
- IoT action fulfillment with device-signed proof
- Human-task fulfillment with signed result package

## Quick start

1) Install dependencies:

```bash
pnpm install
```

Generate contract artifacts (required before app build if `artifacts/` is not present):

```bash
pnpm contracts:compile
```

2) Configure environment:

```bash
cp .env.example .env.local
```

3) Start demo stack:

```bash
pnpm demo:up
```

4) Open dashboards:
- `/buyer`
- `/provider`
- `/operator`
- `/arbiter`

Reset demo/offchain state between runs:

```bash
pnpm demo:reset
```

## Environment variables

Required (minimum meaningful setup):

- Chain + deploy
  - `SEPOLIA_RPC_URL`
  - `DEPLOYER_PRIVATE_KEY`
  - `NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS`
  - `NEXT_PUBLIC_MOCK_USDC_ADDRESS`
  - `PROVIDER_REGISTRY_ADDRESS` and/or `NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS`
- Roles
  - `AGENTRAIL_OPERATOR_ADDRESS`
  - `AGENTRAIL_OPERATOR_PRIVATE_KEY`
  - `AGENTRAIL_ARBITER_ADDRESS`
- Database
  - `DATABASE_URL` or `NEON_DATABASE_URL`
- Service signers + service URLs
  - `PROVIDER_API_PRIVATE_KEY`
  - `DEVICE_SIM_PRIVATE_KEY`
  - `HUMAN_SOLVER_PRIVATE_KEY`
  - `NEXT_PUBLIC_PROVIDER_API_URL`
  - `NEXT_PUBLIC_DEVICE_SIM_URL`
  - `NEXT_PUBLIC_PROOF_VERIFIER_URL`
  - `NEXT_PUBLIC_HUMAN_SOLVER_URL`

Optional:
- `GRADIENT_API_KEY`, `GRADIENT_BASE_URL`, `GRADIENT_MODEL`
- `AGENTRAIL_CHALLENGE_WINDOW_SECONDS` (default `120`)
- `AGENTRAIL_AUTOSTART_CHALLENGE` (default `true`)
- `AGENTRAIL_AUTOSETTLE_ENABLED` (default `true`)
- `ESCROW_SYNC_INTERVAL_MS` (default `10000`)

## Smart contract commands

Compile + test:

```bash
pnpm contracts:compile
pnpm contracts:test
```

Deploy escrow + mock token:

```bash
pnpm contracts:deploy:sepolia
```

Deploy provider registry:

```bash
pnpm contracts:deploy:registry:sepolia
```

Configure verifier/resolver roles:

```bash
pnpm contracts:configure:roles:sepolia
```

## Service commands (manual mode)

If you do not use `pnpm demo:up`, run components manually:

```bash
pnpm dev
pnpm service:provider-api
pnpm service:device-sim
pnpm service:proof-verifier
pnpm service:human-solver
pnpm worker:sync
```

## API surface

App API:
- `POST /api/agent/request-service`
- `POST /api/orders/quote`
- `POST /api/orders`
- `POST /api/orders/action`
- `POST /api/orders/:id/dispute`
- `GET /api/orders/:id`
- `POST /api/sync/escrow-events`

Service API:
- `POST /v1/company-enrichment` (provider API)
- `POST /device/execute` (device simulator)
- `POST /v1/verify-and-start` (proof verifier)
- `POST /v1/human-task` (human solver)

## Source of truth and data model

- Contract state and emitted events are the settlement source of truth.
- Neon stores operational state for UX, orchestration, auditability, and sessions.
- Event sync deduplicates by transaction log identity to avoid double-processing.

## Demo narrative (4-6 min)

1. Buyer creates and funds order.
2. Provider accepts and submits proof.
3. Operator/verifier opens challenge window.
4. Show one happy-path settlement and one dispute resolution.
5. Close with tx hashes + audit timeline.
