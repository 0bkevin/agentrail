import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Demo | AgentRail",
  description: "Watch the AgentRail platform in action",
};

export default function DemoPage() {
  return (
    <main className="flex w-full flex-col min-h-screen bg-black">
      <div className="w-full border-y-2 border-brut-red bg-brut-red text-black overflow-hidden py-2 whitespace-nowrap flex items-center relative z-10">
        <div className="animate-marquee inline-flex gap-8 font-mono font-black uppercase text-sm tracking-[0.2em]">
          <span>SYSTEM_ONLINE // AGENTRAIL V.0.1.0</span>
          <span>AUTONOMOUS_COMMERCE</span>
          <span>SECURE_ESCROW</span>
          <span>OPTIMISTIC_VERIFICATION</span>
          <span>SYSTEM_ONLINE // AGENTRAIL V.0.1.0</span>
          <span>AUTONOMOUS_COMMERCE</span>
          <span>SECURE_ESCROW</span>
          <span>OPTIMISTIC_VERIFICATION</span>
          <span>SYSTEM_ONLINE // AGENTRAIL V.0.1.0</span>
          <span>AUTONOMOUS_COMMERCE</span>
          <span>SECURE_ESCROW</span>
          <span>OPTIMISTIC_VERIFICATION</span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-16 sm:px-6 lg:px-8 lg:py-24 gap-12">
        <div className="flex items-center justify-between">
          <Link 
            href="/" 
            className="font-mono text-sm text-white/60 hover:text-brut-red uppercase tracking-wider transition-colors"
          >
            ← BACK_TO_LANDING
          </Link>
        </div>

        <div className="brutalist-container">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-brut-red">PLATFORM_DEMO</p>
          <h1 className="mt-4 text-4xl font-black text-white uppercase tracking-tight">
            Watch AgentRail in Action
          </h1>
          <p className="mt-4 text-white/70 font-mono text-lg">
            See the full role-by-role workflow: buyer proposes → provider accepts → proof submission → operator verification → settlement → dispute resolution
          </p>
        </div>

        <div className="brutalist-container bg-black border-white">
          <video
            controls
            className="w-full aspect-video"
            preload="metadata"
          >
            <source src="/demo-artifacts/video/agentrail-full-demo-clean.webm" type="video/webm" />
            Your browser does not support the video tag.
          </video>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <Link href="/buyer" className="brutalist-container group hover:bg-brut-red hover:text-black transition-all duration-200 border-brut-red">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-brut-red group-hover:text-black">START_AS</p>
            <h2 className="mt-2 text-2xl font-black uppercase">Buyer</h2>
            <p className="mt-2 text-white/70 group-hover:text-black/70 font-mono text-sm">
              Create funded orders, approve proposals, settle completed work
            </p>
          </Link>

          <Link href="/provider" className="brutalist-container group hover:bg-brut-accent hover:text-black transition-all duration-200 border-brut-accent">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-brut-accent group-hover:text-black">START_AS</p>
            <h2 className="mt-2 text-2xl font-black uppercase">Provider</h2>
            <p className="mt-2 text-white/70 group-hover:text-black/70 font-mono text-sm">
              Accept work, stake collateral, submit proof bundles
            </p>
          </Link>

          <Link href="/operator" className="brutalist-container group hover:bg-white hover:text-black transition-all duration-200 border-white">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-white group-hover:text-black">START_AS</p>
            <h2 className="mt-2 text-2xl font-black uppercase">Operator</h2>
            <p className="mt-2 text-white/70 group-hover:text-black/70 font-mono text-sm">
              Monitor verification queues, audit proofs, track settlement
            </p>
          </Link>

          <Link href="/arbiter" className="brutalist-container group hover:bg-cyan-400 hover:text-black transition-all duration-200 border-cyan-400">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-400 group-hover:text-black">START_AS</p>
            <h2 className="mt-2 text-2xl font-black uppercase">Arbiter</h2>
            <p className="mt-2 text-white/70 group-hover:text-black/70 font-mono text-sm">
              Resolve disputed proofs, handle challenge decisions
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
