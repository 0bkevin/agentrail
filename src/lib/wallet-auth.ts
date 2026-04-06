import { createHash, randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { recoverMessageAddress } from "viem";

import { storage } from "@/lib/storage";

const SESSION_COOKIE = "agentrail_session";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function isWalletAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function cleanupExpired() {
  const currentTime = Date.now();
  await storage.cleanupExpiredChallenges(currentTime);
  await storage.cleanupExpiredSessions(currentTime);
}

export async function buildChallenge(address: string) {
  await cleanupExpired();

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
  ].join("\n");

  await storage.upsertChallenge({
    address: normalizedAddress,
    nonce,
    message,
    expiresAt,
  });

  return { message, nonce, expiresAt };
}

export async function verifyChallenge(params: {
  address: string;
  message: string;
  signature: `0x${string}`;
}) {
  await cleanupExpired();

  const normalizedAddress = normalizeAddress(params.address);
  const challenge = await storage.getChallenge(normalizedAddress);
  if (!challenge) {
    throw new Error("Challenge not found or expired.");
  }

  if (challenge.message !== params.message) {
    throw new Error("Challenge message mismatch.");
  }

  const recoveredAddress = normalizeAddress(
    await recoverMessageAddress({
      message: params.message,
      signature: params.signature,
    }),
  );

  if (recoveredAddress !== normalizedAddress) {
    throw new Error("Signature does not match the connected wallet.");
  }

  const sessionToken = createHash("sha256")
    .update(`${normalizedAddress}:${randomUUID()}`)
    .digest("hex");

  await storage.upsertSession({
    token: sessionToken,
    address: normalizedAddress,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  await storage.deleteChallenge(normalizedAddress);

  return sessionToken;
}

export async function setSessionCookie(sessionToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await storage.deleteSession(token);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionAddress() {
  await cleanupExpired();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = await storage.getSession(token);
  if (!session || session.expiresAt <= Date.now()) {
    await storage.deleteSession(token);
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return session.address;
}
