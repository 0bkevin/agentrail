export type ServiceType = "paid_api" | "iot_action" | "human_task";

export type ActorRole = "buyer" | "provider" | "operator" | "arbiter";

export type OrderStatus =
  | "draft"
  | "funded"
  | "accepted"
  | "fulfilled"
  | "in_challenge"
  | "disputed"
  | "settled"
  | "refunded"
  | "cancelled";

export type TerminalLevel = "system" | "info" | "warn" | "success" | "error" | "confirm";

export type TransitionAction =
  | "accept"
  | "submit_proof"
  | "start_challenge"
  | "approve_early"
  | "dispute"
  | "settle"
  | "resolve"
  | "cancel";

export interface ActorContext {
  role: ActorRole;
  actorId: string;
}

export interface Provider {
  id: string;
  name: string;
  roleLabel: string;
  onchainProviderId?: string;
  walletAddress: string;
  deviceSignerAddress?: string;
  apiBaseUrl?: string;
  devicePublicKey?: string;
  reputationScore?: number;
  serviceTypes: ServiceType[];
  trustModel: string;
  avgLatency: string;
  verificationMode: string;
}

export interface AgentProposal {
  id: string;
  prompt: string;
  title: string;
  summary: string;
  serviceType: ServiceType;
  providerId: string;
  providerName: string;
  providerWallet?: string;
  paymentAmount: number;
  providerStake: number;
  requestPayload: Record<string, string>;
  requestHash: string;
  rationale: string[];
}

export interface ProofRecord {
  hash: string;
  summary: string;
  resultUri: string;
  submittedAt: number;
  signerAddress?: string;
  verified?: boolean;
}

export type ApiProofPayload = {
  kind: "api";
  orderId: string;
  requestHash: string;
  resultUri: string;
  responseHash: string;
  timestamp: number;
  result: unknown;
};

export type IotProofPayload = {
  kind: "iot";
  orderId: string;
  requestHash: string;
  resultUri: string;
  responseHash: string;
  timestamp: number;
  deviceId: string;
  actionType: string;
  result: unknown;
};

export type ProofPayload = ApiProofPayload | IotProofPayload;

export interface ProofSubmission {
  payload: ProofPayload;
  signature: `0x${string}`;
}

export interface ActivityEntry {
  id: string;
  label: string;
  detail: string;
  timestamp: number;
}

export interface Order {
  id: string;
  onchainOrderId?: string;
  title: string;
  summary: string;
  buyer: string;
  providerId: string;
  providerName: string;
  providerWallet?: string;
  serviceType: ServiceType;
  paymentToken: string;
  paymentAmount: number;
  providerStake: number;
  requestHash: string;
  requestPayload: Record<string, string>;
  status: OrderStatus;
  createdAt: number;
  acceptedAt?: number;
  fulfilledAt?: number;
  challengeDeadline?: number;
  settledAt?: number;
  disputedAt?: number;
  resolution?: string;
  proof?: ProofRecord;
  txCreate: string;
  txAccept?: string;
  txSubmit?: string;
  txSettle?: string;
  txDispute?: string;
  txResolve?: string;
  activity: ActivityEntry[];
}

export interface TerminalEntry {
  id: string;
  timestamp: number;
  level: TerminalLevel;
  text: string;
}

export interface DashboardMetrics {
  activeOrders: number;
  securedVolumeUsd: number;
  disputedOrders: number;
  settlementRate: number;
}

export interface DashboardSnapshot {
  providers: Provider[];
  orders: Order[];
  terminal: TerminalEntry[];
  metrics: DashboardMetrics;
  generatedAt: number;
}
