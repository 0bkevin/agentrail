"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppKit } from "@reown/appkit/react";
import { useAppKitAccount } from "@reown/appkit/react";

import { WalletAuth } from "@/components/wallet-auth";

export function ProtectedRoute({ children, title }: { children: React.ReactNode; title: string }) {
  const { address, isConnected } = useAppKitAccount();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [demoBypass, setDemoBypass] = useState(false);
  const { open } = useAppKit();
  const connectedAddress = (isConnected && address ? address : null) as `0x${string}` | null;
  const demoBypassEnabled = process.env.NEXT_PUBLIC_DEMO_BYPASS === "true" || demoBypass;

  useEffect(() => {
    const host = window.location.hostname;
    const localHost = host === "localhost" || host === "127.0.0.1";
    const bypassEnabled = localHost && window.localStorage.getItem("agentrail:demo:bypass-wallet") === "1";
    setDemoBypass(bypassEnabled);
  }, []);

  useEffect(() => {
    let active = true;

    async function syncSession() {
      if (!connectedAddress && !demoBypassEnabled) {
        if (!active) return;
        setSessionAddress(null);
        setSessionLoading(false);
        return;
      }

      setSessionLoading(true);
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const json = (await response.json()) as { authenticated: boolean; address: string | null };
        if (!active) return;
        setSessionAddress(json.authenticated ? json.address : null);
      } catch {
        if (!active) return;
        setSessionAddress(null);
      } finally {
        if (!active) return;
        setSessionLoading(false);
      }
    }

    void syncSession();

    const handleAuthChange = () => {
      void syncSession();
    };

    window.addEventListener("auth-change", handleAuthChange);
    return () => {
      active = false;
      window.removeEventListener("auth-change", handleAuthChange);
    };
  }, [connectedAddress, demoBypassEnabled]);

  const isAuthenticated = useMemo(() => {
    if (demoBypassEnabled) {
      return true;
    }
    if (!connectedAddress || !sessionAddress) {
      return false;
    }
    return connectedAddress.toLowerCase() === sessionAddress.toLowerCase();
  }, [connectedAddress, sessionAddress]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 border-2 border-brut-red bg-black/90 shadow-[8px_8px_0px_0px_var(--brut-red)] font-mono text-brut-red">
        <h2 className="text-2xl font-bold uppercase tracking-[0.2em] animate-pulse">Scanning Credentials...</h2>
      </div>
    );
  }

  if ((!isConnected && !demoBypassEnabled) || !isAuthenticated) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 border-2 border-brut-red bg-black shadow-[8px_8px_0px_0px_var(--brut-red)] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(211,47,47,0.1)_50%,transparent_50%)] bg-[length:100%_4px] opacity-20"></div>
        
        <div className="relative z-10 flex flex-col items-center gap-6 max-w-xl text-center">
          <div className="text-6xl font-black text-brut-red tracking-tighter uppercase">Access Denied</div>
          <div className="text-lg font-mono text-white/80 uppercase tracking-widest border-y border-brut-red/30 py-4 w-full">
            Terminal Lock engaged. Valid signature required to access the <span className="text-brut-red font-bold">{title}</span> interface.
          </div>
          {!isConnected ? (
            <button
              onClick={() => open()}
              className="group relative px-8 py-4 font-mono font-bold text-xl uppercase tracking-widest text-black bg-brut-red transition-all hover:bg-white active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)]"
            >
              <span className="relative z-10">Connect Wallet</span>
              <div className="absolute inset-0 border-2 border-transparent group-hover:border-black transition-colors"></div>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs font-mono text-white/70 uppercase tracking-widest">One click left: sign with wallet</p>
              <WalletAuth />
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
