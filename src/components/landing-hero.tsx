export function LandingHero() {
  return (
    <>
      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-200/70">AgentRail</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            The trust and settlement rail for AI agents and connected devices.
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
            AgentRail coordinates escrow, signed fulfillment proofs, optimistic verification windows, and dispute
            fallback for autonomous commerce.
          </p>
        </div>

        <div className="rounded-[32px] border border-cyan-300/20 bg-cyan-400/8 p-6 shadow-[0_20px_80px_rgba(34,211,238,0.12)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">What this build proves</p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-200">
            <li>AI request normalization into a structured order proposal</li>
            <li>Escrow funding before any provider action</li>
            <li>Provider stake and proof submission</li>
            <li>Optimistic challenge window before settlement</li>
            <li>Arbiter fallback for disputed proofs</li>
          </ul>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <TrustCard title="Innovation" body="Autonomous commerce with escrow, proof verification, and dispute-aware settlement." />
        <TrustCard title="Technical execution" body="Next.js app-router MVP with real route handlers and an inspectable order state machine." />
        <TrustCard title="Business viability" body="A reusable operator rail for API vendors, IoT fleets, marketplaces, and agent platforms." />
      </section>
    </>
  );
}

function TrustCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{title}</p>
      <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
    </section>
  );
}
