import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import {
  compactSignatureToSignature,
  createPublicClient,
  http,
  isErc6492Signature,
  parseCompactSignature,
  parseErc6492Signature,
  recoverMessageAddress,
  serializeSignature,
} from "viem";
import { mainnet, sepolia } from "viem/chains";

const SESSION_COOKIE = "agentrail_session";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const signatureVerifierClients = [
  createPublicClient({ chain: mainnet, transport: http() }),
  createPublicClient({ chain: sepolia, transport: http() }),
];

type SignedChallenge = {
  address: string;
  nonce: string;
  message: string;
  expiresAt: number;
};

type SignedSession = {
  address: string;
  expiresAt: number;
  nonce: string;
};

function shouldUseSecureCookie() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  const localHost = appUrl.includes("localhost") || appUrl.includes("127.0.0.1");
  return process.env.NODE_ENV === "production" && !localHost;
}

function authSecret() {
  return (
    process.env.WALLET_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "agentrail-dev-wallet-auth-secret"
  );
}

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("hex");
}

function encode(payload: object) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decode<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function createSignedToken(payload: object) {
  const encoded = encode(payload);
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

function verifySignedToken<T>(token: string): T | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  return decode<T>(encoded);
}

function normalizeRecoverableSignature(signature: unknown): `0x${string}` {
  let normalized: string;

  if (typeof signature === "string") {
    normalized = signature.trim();
  } else if (
    typeof signature === "object" &&
    signature !== null &&
    "r" in signature &&
    "s" in signature &&
    ("v" in signature || "yParity" in signature)
  ) {
    normalized = serializeSignature(signature as Parameters<typeof serializeSignature>[0]) as `0x${string}`;
  } else {
    throw new Error("Wallet returned an invalid signature format.");
  }

  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }

  if (normalized.startsWith("0X")) {
    normalized = `0x${normalized.slice(2)}`;
  }

  if (!normalized.startsWith("0x")) {
    throw new Error("Wallet returned a non-hex signature.");
  }

  if (isErc6492Signature(normalized as `0x${string}`)) {
    const parsed = parseErc6492Signature(normalized as `0x${string}`);
    normalized = parsed.signature as `0x${string}`;
  }

  if (normalized.length === 130) {
    normalized = serializeSignature(
      compactSignatureToSignature(parseCompactSignature(normalized as `0x${string}`)),
    ) as `0x${string}`;
  }

  if (normalized.length !== 132) {
    throw new Error("Wallet returned an unsupported signature length.");
  }

  return normalized as `0x${string}`;
}

function toHexSignature(signature: unknown): `0x${string}` {
  if (typeof signature !== "string") {
    throw new Error("Wallet returned an invalid signature format.");
  }

  const normalized = signature.trim().replace(/^"|"$/g, "");
  if (!normalized.startsWith("0x") && !normalized.startsWith("0X")) {
    throw new Error("Wallet returned a non-hex signature.");
  }

  return (`0x${normalized.slice(2)}` as `0x${string}`);
}

async function verifyWithPublicClients(
  address: `0x${string}`,
  message: string,
  signature: `0x${string}`,
) {
  for (const client of signatureVerifierClients) {
    try {
      const ok = await client.verifyMessage({
        address,
        message,
        signature,
      });
      if (ok) {
        return true;
      }
    } catch {
      // ignore and try next chain verifier
    }
  }

  return false;
}

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function isWalletAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function buildChallenge(address: string) {
  if (!isWalletAddress(address)) {
    throw new Error("A valid wallet address is required.");
  }

  const normalizedAddress = normalizeAddress(address);
  const nonce = randomUUID();
  const issuedAt = new Date().toISOString();
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const message = [
    "AgentRail wallet authentication",
    `Address: ${normalizedAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expires At: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");

  const challengeToken = createSignedToken({
    address: normalizedAddress,
    nonce,
    message,
    expiresAt,
  });

  return { message, challengeToken, expiresAt };
}

export async function verifyChallenge(params: {
  address: string;
  message: string;
  signature: unknown;
  challengeToken: string;
}) {
  const normalizedAddress = normalizeAddress(params.address);
  const challenge = verifySignedToken<SignedChallenge>(params.challengeToken);
  if (!challenge) {
    throw new Error("Challenge is invalid.");
  }

  if (challenge.expiresAt <= Date.now()) {
    throw new Error("Challenge has expired.");
  }

  if (challenge.address !== normalizedAddress || challenge.message !== params.message) {
    throw new Error("Challenge message mismatch.");
  }

  const hexSignature = toHexSignature(params.signature);

  let verified = false;
  try {
    const recoverableSignature = normalizeRecoverableSignature(hexSignature);
    const recoveredAddress = normalizeAddress(
      await recoverMessageAddress({
        message: params.message,
        signature: recoverableSignature,
      }),
    );
    verified = recoveredAddress === normalizedAddress;
  } catch {
    verified = false;
  }

  if (!verified) {
    verified = await verifyWithPublicClients(normalizedAddress as `0x${string}`, params.message, hexSignature);
  }

  if (!verified) {
    throw new Error("Signature does not match the connected wallet.");
  }

  return createSignedToken({
    address: normalizedAddress,
    expiresAt: Date.now() + SESSION_TTL_MS,
    nonce: randomUUID(),
  });
}

export async function setSessionCookie(sessionToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionAddress() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = verifySignedToken<SignedSession>(token);
  if (!session || session.expiresAt <= Date.now()) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return session.address;
}
