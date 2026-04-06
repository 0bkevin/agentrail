"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletAuth } from "@/components/wallet-auth";

export function Navigation() {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <nav className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <Link href="/" className="px-3 py-1 text-sm font-black tracking-[0.3em] text-brut-red hover-glitch uppercase border border-transparent hover:border-brut-red transition-colors">
        AGENTRAIL_SYS
      </Link>
      <div className="h-4 w-px bg-brut-accent mx-2 hidden sm:block"></div>
      
      {isLanding ? (
        <div className="ml-auto">
          <Link href="/buyer" className="brutalist-button !py-2 !px-4 text-xs group-hover:bg-black group-hover:text-brut-red group-hover:border-black hover:!bg-white hover:!text-black">
            START_APP [INIT]
          </Link>
        </div>
      ) : (
        <>
          <Link href="/buyer" className={`px-3 py-1 text-xs font-bold uppercase tracking-widest transition-all border border-transparent hover:text-white hover:bg-brut-red hover:shadow-[4px_4px_0px_0px_var(--brut-accent)] ${pathname === "/buyer" ? "text-white bg-brut-red shadow-[4px_4px_0px_0px_var(--brut-accent)]" : "text-white/70"}`}>BUYER</Link>
          <Link href="/provider" className={`px-3 py-1 text-xs font-bold uppercase tracking-widest transition-all border border-transparent hover:text-white hover:bg-brut-red hover:shadow-[4px_4px_0px_0px_var(--brut-accent)] ${pathname === "/provider" ? "text-white bg-brut-red shadow-[4px_4px_0px_0px_var(--brut-accent)]" : "text-white/70"}`}>PROVIDER</Link>
          <Link href="/operator" className={`px-3 py-1 text-xs font-bold uppercase tracking-widest transition-all border border-transparent hover:text-white hover:bg-brut-red hover:shadow-[4px_4px_0px_0px_var(--brut-accent)] ${pathname === "/operator" ? "text-white bg-brut-red shadow-[4px_4px_0px_0px_var(--brut-accent)]" : "text-white/70"}`}>OPERATOR</Link>
          <Link href="/arbiter" className={`px-3 py-1 text-xs font-bold uppercase tracking-widest transition-all border border-transparent hover:text-white hover:bg-brut-red hover:shadow-[4px_4px_0px_0px_var(--brut-accent)] ${pathname === "/arbiter" ? "text-white bg-brut-red shadow-[4px_4px_0px_0px_var(--brut-accent)]" : "text-white/70"}`}>ARBITER</Link>
          <div className="ml-auto">
            <WalletAuth />
          </div>
        </>
      )}
    </nav>
  );
}