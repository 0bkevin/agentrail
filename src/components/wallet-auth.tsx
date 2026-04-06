"use client";

import { useAppKit, useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { useSignMessage } from "wagmi";
import { useState, useEffect, useCallback } from "react";

async function postJson<T>(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? "Request failed.");
  }
  return json;
}

export function WalletAuth() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const connectedAddress = (isConnected && address ? address : null) as `0x${string}` | null;

  const isAuthenticated = Boolean(
    connectedAddress && sessionAddress && connectedAddress.toLowerCase() === sessionAddress.toLowerCase(),
  );

  const syncSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const json = (await response.json()) as { authenticated: boolean; address: string | null };
      setSessionAddress(json.authenticated ? json.address : null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!connectedAddress) {
      setSessionAddress(null);
      return;
    }
    void syncSession();
  }, [connectedAddress, syncSession]);

  async function authenticateWallet() {
    if (!connectedAddress) return;
    setAuthPending(true);
    try {
      const challenge = await postJson<{ message: string; challengeToken: string }>("/api/auth/challenge", {
        address: connectedAddress,
      });
      const signature = await signMessageAsync({ message: challenge.message });

      await postJson<{ ok: boolean }>("/api/auth/verify", {
        address: connectedAddress,
        message: challenge.message,
        signature,
        challengeToken: challenge.challengeToken,
      });
      await syncSession();
      window.dispatchEvent(new Event("auth-change"));
    } catch (error) {
      console.error(error);
    } finally {
      setAuthPending(false);
    }
  }

  async function handleDisconnect() {
    try {
      await postJson<{ ok: boolean }>("/api/auth/logout", {});
    } catch {}
    setSessionAddress(null);
    disconnect();
    window.dispatchEvent(new Event("auth-change"));
  }

  if (!isConnected || !connectedAddress) {
    return (
      <button onClick={() => open()} className="brutalist-button !py-1 !px-3 !text-xs">
        CONNECT_WALLET
      </button>
    );
  }

  if (!isAuthenticated) {
    return (
      <button onClick={authenticateWallet} disabled={authPending} className="brutalist-button !bg-brut-red !text-black hover:!bg-white !py-1 !px-3 !text-xs disabled:opacity-50">
        {authPending ? "SIGNING..." : "AUTH_REQUIRED [SIGN]"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-white/50 hidden md:block">
        AUTH_OK: {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
      </span>
      <button onClick={handleDisconnect} className="brutalist-button-outline !py-1 !px-3 !text-[10px] hover:!bg-white hover:!text-black hover:!border-white">
        DISCONNECT
      </button>
    </div>
  );
}
