import { randomUUID } from "node:crypto";

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import type { AgentProposal, Order, TerminalEntry } from "@/lib/agentrail-types";

neonConfig.webSocketConstructor = ws;

type StoredChallenge = {
  address: string;
  nonce: string;
  message: string;
  expiresAt: number;
};

type StoredSession = {
  token: string;
  address: string;
  expiresAt: number;
};

export interface AgentRailStorage {
  readonly mode: "memory" | "neon";
  initialize(): Promise<void>;
  hasOrders(): Promise<boolean>;
  listOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  upsertOrder(order: Order): Promise<void>;
  listTerminal(limit?: number): Promise<TerminalEntry[]>;
  appendTerminal(entry: TerminalEntry): Promise<void>;
  hasTerminalEntries(): Promise<boolean>;
  clearTerminal(): Promise<void>;
  clearSeedOrder(): Promise<void>;
  ensureProviders(providers: Array<{
    id: string;
    walletAddress: string;
    name: string;
    roleLabel: string;
    serviceTypes: string[];
    apiBaseUrl?: string;
    devicePublicKey?: string;
    reputationScore?: number;
    trustModel: string;
    verificationMode: string;
  }>): Promise<void>;
  logProof(params: {
    orderId: string;
    proofType: string;
    payloadJson: Record<string, unknown>;
    signature: string;
    proofHash: string;
    verified: boolean;
    verifiedAt: number;
  }): Promise<void>;
  openDispute(params: {
    orderId: string;
    openedBy: string;
    reason: string;
    evidenceUri?: string;
    status: string;
    createdAt: number;
  }): Promise<void>;
  resolveDispute(params: {
    orderId: string;
    status: string;
    resolution: string;
  }): Promise<void>;
  writeAuditLog(params: {
    orderId: string;
    source: string;
    eventType: string;
    payloadJson: Record<string, unknown>;
    createdAt: number;
  }): Promise<void>;
  getSyncCursor(key: string): Promise<bigint | null>;
  setSyncCursor(key: string, blockNumber: bigint): Promise<void>;
  storeProposal(proposal: AgentProposal): Promise<void>;
  getProposal(id: string): Promise<AgentProposal | null>;
  consumeProposal(id: string): Promise<AgentProposal | null>;
  deleteProposal(id: string): Promise<void>;
  updateOrderIfStatus(id: string, expectedStatus: Order["status"], nextOrder: Order): Promise<boolean>;
  upsertChallenge(challenge: StoredChallenge): Promise<void>;
  getChallenge(address: string): Promise<StoredChallenge | null>;
  deleteChallenge(address: string): Promise<void>;
  cleanupExpiredChallenges(now: number): Promise<void>;
  upsertSession(session: StoredSession): Promise<void>;
  getSession(token: string): Promise<StoredSession | null>;
  deleteSession(token: string): Promise<void>;
  cleanupExpiredSessions(now: number): Promise<void>;
  markChainEventProcessed(key: string, blockNumber: bigint): Promise<boolean>;
  resetDemoState(): Promise<void>;
}

const schemaStatements = [
  `
    create table if not exists agentrail_orders (
      id text primary key,
      created_at bigint not null,
      updated_at bigint not null,
      status text not null,
      buyer text not null,
      provider_id text not null,
      onchain_order_id text,
      provider_wallet text,
      service_type text,
      request_hash text,
      payment_amount bigint,
      provider_stake bigint,
      tx_create text,
      tx_accept text,
      tx_submit text,
      tx_settle text,
      fulfilled_at bigint,
      challenge_deadline bigint,
      settled_at bigint,
      data jsonb not null
    )
  `,
  `create index if not exists agentrail_orders_created_at_idx on agentrail_orders (created_at desc)`,
  `
    create table if not exists agentrail_proposals (
      id text primary key,
      created_at bigint not null,
      data jsonb not null
    )
  `,
  `
    create table if not exists agentrail_terminal_entries (
      id text primary key,
      created_at bigint not null,
      data jsonb not null
    )
  `,
  `create index if not exists agentrail_terminal_entries_created_at_idx on agentrail_terminal_entries (created_at desc)`,
  `
    create table if not exists agentrail_providers (
      id text primary key,
      wallet_address text not null,
      name text not null,
      role_label text not null,
      service_types jsonb not null,
      api_base_url text,
      device_public_key text,
      reputation_score integer,
      trust_model text not null,
      verification_mode text not null,
      created_at bigint not null,
      updated_at bigint not null
    )
  `,
  `
    create table if not exists agentrail_proofs (
      id text primary key,
      order_id text not null,
      proof_type text not null,
      payload_json jsonb not null,
      signature text not null,
      proof_hash text not null,
      verified_boolean boolean not null,
      verified_at bigint not null,
      created_at bigint not null
    )
  `,
  `create index if not exists agentrail_proofs_order_idx on agentrail_proofs (order_id)`,
  `
    create table if not exists agentrail_disputes (
      id text primary key,
      order_id text not null,
      opened_by text not null,
      reason text not null,
      evidence_uri text,
      status text not null,
      resolution text,
      created_at bigint not null,
      updated_at bigint not null
    )
  `,
  `create index if not exists agentrail_disputes_order_idx on agentrail_disputes (order_id)`,
  `
    create table if not exists agentrail_audit_logs (
      id text primary key,
      order_id text not null,
      source text not null,
      event_type text not null,
      payload_json jsonb not null,
      created_at bigint not null
    )
  `,
  `create index if not exists agentrail_audit_logs_order_idx on agentrail_audit_logs (order_id, created_at desc)`,
  `
    create table if not exists agentrail_sync_state (
      key text primary key,
      block_number text not null,
      updated_at bigint not null
    )
  `,
  `
    create table if not exists agentrail_auth_challenges (
      address text primary key,
      expires_at bigint not null,
      data jsonb not null
    )
  `,
  `create index if not exists agentrail_auth_challenges_expires_at_idx on agentrail_auth_challenges (expires_at)`,
  `
    create table if not exists agentrail_auth_sessions (
      token text primary key,
      address text not null,
      expires_at bigint not null
    )
  `,
  `create index if not exists agentrail_auth_sessions_expires_at_idx on agentrail_auth_sessions (expires_at)`,
  `create table if not exists agentrail_chain_events (key text primary key, block_number text not null, processed_at bigint not null)`,
  `alter table agentrail_providers add column if not exists api_base_url text`,
  `alter table agentrail_providers add column if not exists device_public_key text`,
  `alter table agentrail_providers add column if not exists reputation_score integer`,
  `alter table agentrail_disputes add column if not exists evidence_uri text`,
  `alter table agentrail_orders add column if not exists onchain_order_id text`,
  `alter table agentrail_orders add column if not exists provider_wallet text`,
  `alter table agentrail_orders add column if not exists service_type text`,
  `alter table agentrail_orders add column if not exists request_hash text`,
  `alter table agentrail_orders add column if not exists payment_amount bigint`,
  `alter table agentrail_orders add column if not exists provider_stake bigint`,
  `alter table agentrail_orders add column if not exists tx_create text`,
  `alter table agentrail_orders add column if not exists tx_accept text`,
  `alter table agentrail_orders add column if not exists tx_submit text`,
  `alter table agentrail_orders add column if not exists tx_settle text`,
  `alter table agentrail_orders add column if not exists fulfilled_at bigint`,
  `alter table agentrail_orders add column if not exists challenge_deadline bigint`,
  `alter table agentrail_orders add column if not exists settled_at bigint`,
];

function deserialize<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

class MemoryStorage implements AgentRailStorage {
  readonly mode = "memory" as const;

  private readonly orders = new Map<string, Order>();
  private readonly proposals = new Map<string, AgentProposal>();
  private terminal: TerminalEntry[] = [];
  private readonly challenges = new Map<string, StoredChallenge>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly syncState = new Map<string, bigint>();
  private readonly processedChainEvents = new Set<string>();

  async initialize() {}

  async hasOrders() {
    return this.orders.size > 0;
  }

  async listOrders() {
    return [...this.orders.values()];
  }

  async getOrder(id: string) {
    return this.orders.get(id) ?? null;
  }

  async upsertOrder(order: Order) {
    this.orders.set(order.id, structuredClone(order));
  }

  async listTerminal(limit = 32) {
    return this.terminal.slice(0, limit).map((entry) => structuredClone(entry));
  }

  async hasTerminalEntries() {
    return this.terminal.length > 0;
  }

  async clearTerminal() {
    this.terminal = [];
  }

  async clearSeedOrder() {
    this.orders.delete("ord-seed-001");
  }

  async ensureProviders() {}

  async logProof() {}

  async openDispute() {}

  async resolveDispute() {}

  async writeAuditLog() {}

  async getSyncCursor(key: string) {
    return this.syncState.get(key) ?? null;
  }

  async setSyncCursor(key: string, blockNumber: bigint) {
    this.syncState.set(key, blockNumber);
  }

  async appendTerminal(entry: TerminalEntry) {
    this.terminal = [structuredClone(entry), ...this.terminal].slice(0, 64);
  }

  async storeProposal(proposal: AgentProposal) {
    this.proposals.set(proposal.id, structuredClone(proposal));
  }

  async getProposal(id: string) {
    return this.proposals.get(id) ?? null;
  }

  async consumeProposal(id: string) {
    const proposal = this.proposals.get(id) ?? null;
    if (proposal) {
      this.proposals.delete(id);
      return structuredClone(proposal);
    }
    return null;
  }

  async deleteProposal(id: string) {
    this.proposals.delete(id);
  }

  async updateOrderIfStatus(id: string, expectedStatus: Order["status"], nextOrder: Order) {
    const current = this.orders.get(id);
    if (!current || current.status !== expectedStatus) {
      return false;
    }
    this.orders.set(id, structuredClone(nextOrder));
    return true;
  }

  async upsertChallenge(challenge: StoredChallenge) {
    this.challenges.set(challenge.address, { ...challenge });
  }

  async getChallenge(address: string) {
    return this.challenges.get(address) ?? null;
  }

  async deleteChallenge(address: string) {
    this.challenges.delete(address);
  }

  async cleanupExpiredChallenges(now: number) {
    for (const [address, challenge] of this.challenges.entries()) {
      if (challenge.expiresAt <= now) {
        this.challenges.delete(address);
      }
    }
  }

  async upsertSession(session: StoredSession) {
    this.sessions.set(session.token, { ...session });
  }

  async getSession(token: string) {
    return this.sessions.get(token) ?? null;
  }

  async deleteSession(token: string) {
    this.sessions.delete(token);
  }

  async cleanupExpiredSessions(now: number) {
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }

  async markChainEventProcessed(key: string, _blockNumber: bigint) {
    void _blockNumber;
    if (this.processedChainEvents.has(key)) {
      return false;
    }
    this.processedChainEvents.add(key);
    return true;
  }

  async resetDemoState() {
    this.orders.clear();
    this.proposals.clear();
    this.terminal = [];
    this.challenges.clear();
    this.sessions.clear();
    this.syncState.clear();
    this.processedChainEvents.clear();
  }
}

class NeonStorage implements AgentRailStorage {
  readonly mode = "neon" as const;

  private readonly pool: Pool;
  private initPromise?: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize() {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.pool.query("select pg_advisory_lock(hashtext('agentrail_schema_migration_lock'))");
        try {
          for (const statement of schemaStatements) {
            await this.pool.query(statement);
          }
        } finally {
          await this.pool.query("select pg_advisory_unlock(hashtext('agentrail_schema_migration_lock'))");
        }
      })();
    }

    await this.initPromise;
  }

  async hasOrders() {
    await this.initialize();
    const result = await this.pool.query<{ count: string }>("select count(*)::text as count from agentrail_orders");
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async listOrders() {
    await this.initialize();
    const result = await this.pool.query<{ data: unknown }>("select data from agentrail_orders order by created_at desc");
    return result.rows.map((row) => deserialize<Order>(row.data));
  }

  async getOrder(id: string) {
    await this.initialize();
    const result = await this.pool.query<{ data: unknown }>("select data from agentrail_orders where id = $1 limit 1", [id]);
    const row = result.rows[0];
    return row ? deserialize<Order>(row.data) : null;
  }

  async upsertOrder(order: Order) {
    await this.initialize();
    await this.pool.query(
      `
        insert into agentrail_orders (id, created_at, updated_at, status, buyer, provider_id, onchain_order_id, provider_wallet, service_type, request_hash, payment_amount, provider_stake, tx_create, tx_accept, tx_submit, tx_settle, fulfilled_at, challenge_deadline, settled_at, data)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb)
        on conflict (id) do update set
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          status = excluded.status,
          buyer = excluded.buyer,
          provider_id = excluded.provider_id,
          onchain_order_id = excluded.onchain_order_id,
          provider_wallet = excluded.provider_wallet,
          service_type = excluded.service_type,
          request_hash = excluded.request_hash,
          payment_amount = excluded.payment_amount,
          provider_stake = excluded.provider_stake,
          tx_create = excluded.tx_create,
          tx_accept = excluded.tx_accept,
          tx_submit = excluded.tx_submit,
          tx_settle = excluded.tx_settle,
          fulfilled_at = excluded.fulfilled_at,
          challenge_deadline = excluded.challenge_deadline,
          settled_at = excluded.settled_at,
          data = excluded.data
      `,
      [
        order.id,
        order.createdAt,
        Date.now(),
        order.status,
        order.buyer,
        order.providerId,
        order.onchainOrderId ?? null,
        order.providerWallet ?? null,
        order.serviceType,
        order.requestHash,
        order.paymentAmount,
        order.providerStake,
        order.txCreate,
        order.txAccept ?? null,
        order.txSubmit ?? null,
        order.txSettle ?? null,
        order.fulfilledAt ?? null,
        order.challengeDeadline ?? null,
        order.settledAt ?? null,
        JSON.stringify(order),
      ],
    );
  }

  async listTerminal(limit = 32) {
    await this.initialize();
    const result = await this.pool.query<{ data: unknown }>(
      "select data from agentrail_terminal_entries order by created_at desc limit $1",
      [limit],
    );
    return result.rows.map((row) => deserialize<TerminalEntry>(row.data));
  }

  async hasTerminalEntries() {
    await this.initialize();
    const result = await this.pool.query<{ count: string }>("select count(*)::text as count from agentrail_terminal_entries");
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async clearTerminal() {
    await this.initialize();
    await this.pool.query("delete from agentrail_terminal_entries");
  }

  async clearSeedOrder() {
    await this.initialize();
    await this.pool.query("delete from agentrail_orders where id = 'ord-seed-001'");
  }

  async ensureProviders(
    providers: Array<{
      id: string;
      walletAddress: string;
      name: string;
      roleLabel: string;
      serviceTypes: string[];
      apiBaseUrl?: string;
      devicePublicKey?: string;
      reputationScore?: number;
      trustModel: string;
      verificationMode: string;
    }>,
  ) {
    await this.initialize();
    for (const provider of providers) {
      const timestamp = Date.now();
      await this.pool.query(
        `
          insert into agentrail_providers
            (id, wallet_address, name, role_label, service_types, api_base_url, device_public_key, reputation_score, trust_model, verification_mode, created_at, updated_at)
          values
            ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)
          on conflict (id) do update set
            wallet_address = excluded.wallet_address,
            name = excluded.name,
            role_label = excluded.role_label,
            service_types = excluded.service_types,
            api_base_url = excluded.api_base_url,
            device_public_key = excluded.device_public_key,
            reputation_score = excluded.reputation_score,
            trust_model = excluded.trust_model,
            verification_mode = excluded.verification_mode,
            updated_at = excluded.updated_at
        `,
        [
          provider.id,
          provider.walletAddress,
          provider.name,
          provider.roleLabel,
          JSON.stringify(provider.serviceTypes),
          provider.apiBaseUrl ?? null,
          provider.devicePublicKey ?? null,
          provider.reputationScore ?? null,
          provider.trustModel,
          provider.verificationMode,
          timestamp,
          timestamp,
        ],
      );
    }
  }

  async logProof(params: {
    orderId: string;
    proofType: string;
    payloadJson: Record<string, unknown>;
    signature: string;
    proofHash: string;
    verified: boolean;
    verifiedAt: number;
  }) {
    await this.initialize();
    await this.pool.query(
      `
        insert into agentrail_proofs
          (id, order_id, proof_type, payload_json, signature, proof_hash, verified_boolean, verified_at, created_at)
        values
          ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
      `,
      [
        `proof-${randomUUID()}`,
        params.orderId,
        params.proofType,
        JSON.stringify(params.payloadJson),
        params.signature,
        params.proofHash,
        params.verified,
        params.verifiedAt,
        Date.now(),
      ],
    );
  }

  async openDispute(params: {
    orderId: string;
    openedBy: string;
    reason: string;
    evidenceUri?: string;
    status: string;
    createdAt: number;
  }) {
    await this.initialize();
    await this.pool.query(
        `
        insert into agentrail_disputes
          (id, order_id, opened_by, reason, evidence_uri, status, resolution, created_at, updated_at)
        values
          ($1, $2, $3, $4, $5, $6, null, $7, $8)
      `,
      [
        `disp-${randomUUID()}`,
        params.orderId,
        params.openedBy,
        params.reason,
        params.evidenceUri ?? null,
        params.status,
        params.createdAt,
        params.createdAt,
      ],
    );
  }

  async resolveDispute(params: {
    orderId: string;
    status: string;
    resolution: string;
  }) {
    await this.initialize();
    await this.pool.query(
      `
        update agentrail_disputes
        set status = $1, resolution = $2, updated_at = $3
        where id = (
          select id from agentrail_disputes
          where order_id = $4
          order by created_at desc
          limit 1
        )
      `,
      [params.status, params.resolution, Date.now(), params.orderId],
    );
  }

  async writeAuditLog(params: {
    orderId: string;
    source: string;
    eventType: string;
    payloadJson: Record<string, unknown>;
    createdAt: number;
  }) {
    await this.initialize();
    await this.pool.query(
      `
        insert into agentrail_audit_logs
          (id, order_id, source, event_type, payload_json, created_at)
        values
          ($1, $2, $3, $4, $5::jsonb, $6)
      `,
      [
        `audit-${randomUUID()}`,
        params.orderId,
        params.source,
        params.eventType,
        JSON.stringify(params.payloadJson),
        params.createdAt,
      ],
    );
  }

  async getSyncCursor(key: string) {
    await this.initialize();
    const result = await this.pool.query<{ block_number: string }>(
      "select block_number from agentrail_sync_state where key = $1 limit 1",
      [key],
    );
    const row = result.rows[0];
    return row ? BigInt(row.block_number) : null;
  }

  async setSyncCursor(key: string, blockNumber: bigint) {
    await this.initialize();
    await this.pool.query(
      `
        insert into agentrail_sync_state (key, block_number, updated_at)
        values ($1, $2, $3)
        on conflict (key) do update set
          block_number = excluded.block_number,
          updated_at = excluded.updated_at
      `,
      [key, blockNumber.toString(), Date.now()],
    );
  }

  async appendTerminal(entry: TerminalEntry) {
    await this.initialize();
    await this.pool.query(
      "insert into agentrail_terminal_entries (id, created_at, data) values ($1, $2, $3::jsonb)",
      [entry.id, entry.timestamp, JSON.stringify(entry)],
    );
  }

  async storeProposal(proposal: AgentProposal) {
    await this.initialize();
    await this.pool.query(
      `
        insert into agentrail_proposals (id, created_at, data)
        values ($1, $2, $3::jsonb)
        on conflict (id) do update set
          created_at = excluded.created_at,
          data = excluded.data
      `,
      [proposal.id, Date.now(), JSON.stringify(proposal)],
    );
  }

  async getProposal(id: string) {
    await this.initialize();
    const result = await this.pool.query<{ data: unknown }>("select data from agentrail_proposals where id = $1 limit 1", [id]);
    const row = result.rows[0];
    return row ? deserialize<AgentProposal>(row.data) : null;
  }

  async consumeProposal(id: string) {
    await this.initialize();
    const result = await this.pool.query<{ data: unknown }>(
      "delete from agentrail_proposals where id = $1 returning data",
      [id],
    );
    const row = result.rows[0];
    return row ? deserialize<AgentProposal>(row.data) : null;
  }

  async deleteProposal(id: string) {
    await this.initialize();
    await this.pool.query("delete from agentrail_proposals where id = $1", [id]);
  }

  async updateOrderIfStatus(id: string, expectedStatus: Order["status"], nextOrder: Order) {
    await this.initialize();
    const result = await this.pool.query(
      `
        update agentrail_orders
        set
          status = $1,
          updated_at = $2,
          buyer = $3,
          provider_id = $4,
          onchain_order_id = $5,
          provider_wallet = $6,
          service_type = $7,
          request_hash = $8,
          payment_amount = $9,
          provider_stake = $10,
          tx_create = $11,
          tx_accept = $12,
          tx_submit = $13,
          tx_settle = $14,
          fulfilled_at = $15,
          challenge_deadline = $16,
          settled_at = $17,
          data = $18::jsonb
        where id = $19 and status = $20
      `,
      [
        nextOrder.status,
        Date.now(),
        nextOrder.buyer,
        nextOrder.providerId,
        nextOrder.onchainOrderId ?? null,
        nextOrder.providerWallet ?? null,
        nextOrder.serviceType,
        nextOrder.requestHash,
        nextOrder.paymentAmount,
        nextOrder.providerStake,
        nextOrder.txCreate,
        nextOrder.txAccept ?? null,
        nextOrder.txSubmit ?? null,
        nextOrder.txSettle ?? null,
        nextOrder.fulfilledAt ?? null,
        nextOrder.challengeDeadline ?? null,
        nextOrder.settledAt ?? null,
        JSON.stringify(nextOrder),
        id,
        expectedStatus,
      ],
    );

    return result.rowCount === 1;
  }

  async upsertChallenge(challenge: StoredChallenge) {
    await this.initialize();
    await this.pool.query(
      `
        insert into agentrail_auth_challenges (address, expires_at, data)
        values ($1, $2, $3::jsonb)
        on conflict (address) do update set
          expires_at = excluded.expires_at,
          data = excluded.data
      `,
      [challenge.address, challenge.expiresAt, JSON.stringify(challenge)],
    );
  }

  async getChallenge(address: string) {
    await this.initialize();
    const result = await this.pool.query<{ data: unknown }>(
      "select data from agentrail_auth_challenges where address = $1 limit 1",
      [address],
    );
    const row = result.rows[0];
    return row ? deserialize<StoredChallenge>(row.data) : null;
  }

  async deleteChallenge(address: string) {
    await this.initialize();
    await this.pool.query("delete from agentrail_auth_challenges where address = $1", [address]);
  }

  async cleanupExpiredChallenges(now: number) {
    await this.initialize();
    await this.pool.query("delete from agentrail_auth_challenges where expires_at <= $1", [now]);
  }

  async upsertSession(session: StoredSession) {
    await this.initialize();
    await this.pool.query(
      `
        insert into agentrail_auth_sessions (token, address, expires_at)
        values ($1, $2, $3)
        on conflict (token) do update set
          address = excluded.address,
          expires_at = excluded.expires_at
      `,
      [session.token, session.address, session.expiresAt],
    );
  }

  async getSession(token: string) {
    await this.initialize();
    const result = await this.pool.query<{ token: string; address: string; expires_at: string | number }>(
      "select token, address, expires_at from agentrail_auth_sessions where token = $1 limit 1",
      [token],
    );
    const row = result.rows[0];
    return row
      ? {
          token: row.token,
          address: row.address,
          expiresAt: Number(row.expires_at),
        }
      : null;
  }

  async deleteSession(token: string) {
    await this.initialize();
    await this.pool.query("delete from agentrail_auth_sessions where token = $1", [token]);
  }

  async cleanupExpiredSessions(now: number) {
    await this.initialize();
    await this.pool.query("delete from agentrail_auth_sessions where expires_at <= $1", [now]);
  }

  async markChainEventProcessed(key: string, blockNumber: bigint) {
    await this.initialize();
    const result = await this.pool.query(
      `
        insert into agentrail_chain_events (key, block_number, processed_at)
        values ($1, $2, $3)
        on conflict (key) do nothing
      `,
      [key, blockNumber.toString(), Date.now()],
    );

    return result.rowCount === 1;
  }

  async resetDemoState() {
    await this.initialize();
    const statements = [
      "delete from agentrail_orders",
      "delete from agentrail_terminal_entries",
      "delete from agentrail_proposals",
      "delete from agentrail_proofs",
      "delete from agentrail_disputes",
      "delete from agentrail_audit_logs",
      "delete from agentrail_sync_state",
      "delete from agentrail_chain_events",
      "delete from agentrail_auth_challenges",
      "delete from agentrail_auth_sessions",
    ];

    for (const sql of statements) {
      await this.pool.query(sql);
    }
  }
}

const databaseUrl = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;

export const storage: AgentRailStorage = databaseUrl
  ? new NeonStorage(databaseUrl)
  : new MemoryStorage();

export async function initializeStorage() {
  await storage.initialize();
  return storage.mode;
}
