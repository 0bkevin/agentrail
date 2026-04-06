import { LandingHero } from "@/components/landing-hero";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex w-full flex-col min-h-screen">
      {/* Decorative Top Marquee */}
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

      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-16 sm:px-6 lg:px-8 lg:py-24 gap-32">
        
        {/* HERO SECTION */}
        <LandingHero />

        {/* CORE ARCHITECTURE SECTION */}
        <section className="grid md:grid-cols-2 gap-12 relative">
          <div className="absolute -left-full -right-full top-1/2 h-px bg-brut-red/30 -z-10 hidden md:block"></div>
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-brut-red/30 -z-10 hidden md:block"></div>

          <div id="tour-landing-what-is" className="brutalist-container group hover:-translate-y-2 transition-transform duration-300">
            <h2 className="text-3xl font-black text-brut-red uppercase tracking-tighter mb-6 group-hover:hover-glitch">What is AgentRail?</h2>
            <p className="text-white/80 font-mono leading-relaxed text-lg mb-6 uppercase">
              AgentRail is the missing layer for autonomous machine-to-machine commerce. 
              <br/><br/>
              It acts as an undeniable protocol that bridges the gap between AI agents requesting services and IoT devices or APIs fulfilling them, ensuring <span className="text-brut-red font-bold">trust</span> without centralized middlemen.
            </p>
          </div>

          <div className="brutalist-container group hover:-translate-y-2 transition-transform duration-300 bg-brut-red text-black border-white">
            <h2 className="text-3xl font-black uppercase tracking-tighter mb-6 group-hover:hover-glitch">What can you do?</h2>
            <ul className="font-mono text-black/90 font-bold space-y-4 uppercase text-lg">
              <li className="border-b border-black/20 pb-2 flex justify-between">
                <span>CREATE FUNDED ORDERS</span>
                <span>[01]</span>
              </li>
              <li className="border-b border-black/20 pb-2 flex justify-between">
                <span>SUBMIT CRYPTOGRAPHIC PROOFS</span>
                <span>[02]</span>
              </li>
              <li className="border-b border-black/20 pb-2 flex justify-between">
                <span>MONITOR VERIFICATION QUEUES</span>
                <span>[03]</span>
              </li>
              <li className="border-b border-black/20 pb-2 flex justify-between">
                <span>RESOLVE DISPUTED OUTCOMES</span>
                <span>[04]</span>
              </li>
            </ul>
          </div>
        </section>

        {/* FEATURES MATRIX */}
        <section id="tour-landing-features" className="space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b-4 border-brut-red pb-6">
            <div>
              <p className="text-brut-red font-black tracking-[0.3em] uppercase text-sm mb-2">SYSTEM_CAPABILITIES</p>
              <h2 className="text-5xl font-black text-white uppercase tracking-tighter">Core Features</h2>
            </div>
            <div className="text-white/50 font-mono text-right hidden md:block">
              MODULE_LOAD // 0x4B3A
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureBlock 
              number="01" 
              title="Immutable Escrow" 
              desc="Funds are locked securely before any provider action occurs. Total zero-counterparty risk." 
            />
            <FeatureBlock 
              number="02" 
              title="Signed Fulfillment" 
              desc="Providers submit cryptographically verifiable proof bundles tied to hardware roots of trust." 
            />
            <FeatureBlock 
              number="03" 
              title="Optimistic Auth" 
              desc="Optimistic challenge windows prevent bottlenecks, allowing rapid settlement for honest actors." 
            />
            <FeatureBlock 
              number="04" 
              title="Arbiter Fallback" 
              desc="Disputed proofs trigger decentralized or human-in-the-loop arbiter escalation for resolution." 
            />
          </div>
        </section>

        {/* TERMINAL ENTRY CTA */}
        <section id="tour-landing-cta" className="brutalist-container py-16 text-center flex flex-col items-center bg-[url('/scanline.png')] bg-cover relative group overflow-hidden">
          <div className="absolute inset-0 bg-brut-red transform translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.87,0,0.13,1)] z-0"></div>
          
          <div className="relative z-10 flex flex-col items-center group-hover:text-black transition-colors duration-500">
            <h2 className="text-5xl md:text-7xl font-black uppercase tracking-tighter mb-8">
              Initialize Sequence
            </h2>
            <p className="font-mono max-w-2xl mb-12 text-lg uppercase">
              The system is primed. Connect your wallet to access the role-based consoles and engage in autonomous settlement.
            </p>
            
            <div className="flex flex-wrap justify-center gap-6">
              <Link href="/buyer" className="brutalist-button group-hover:bg-black group-hover:text-brut-red group-hover:border-black hover:!bg-white hover:!text-black">
                Launch Dashboard [BUYER]
              </Link>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}

function FeatureBlock({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="border border-brut-accent p-6 flex flex-col gap-6 hover:border-brut-red hover:bg-brut-red/5 transition-colors group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-2 bg-brut-red text-black font-black text-xl leading-none transform translate-x-full group-hover:translate-x-0 transition-transform">
        {number}
      </div>
      <div className="text-brut-red font-black text-4xl group-hover:opacity-0 transition-opacity">
        {number}
      </div>
      <div>
        <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3 group-hover:text-brut-red transition-colors">{title}</h3>
        <p className="text-sm font-mono text-white/70 uppercase leading-relaxed group-hover:text-white transition-colors">{desc}</p>
      </div>
    </div>
  );
}
