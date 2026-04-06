export function LandingHero() {
  return (
    <>
      <section className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end w-full relative z-10">
        <div className="relative">
          <div className="absolute -left-4 top-0 w-2 h-full bg-brut-red hover:w-6 transition-all duration-500 cursor-none"></div>
          <p className="text-sm font-black uppercase tracking-[0.35em] text-brut-red mb-6 animate-pulse hover-glitch">AGENTRAIL // SYSTEM_ONLINE</p>
          <h1 className="mt-4 max-w-4xl text-6xl font-black tracking-tighter text-white uppercase sm:text-7xl lg:text-[6rem] leading-[0.85] select-none hover:text-brut-red transition-colors duration-700">
            The trust &amp; settlement rail for <span className="text-brut-red relative inline-block group hover:text-white transition-colors duration-300">
              autonomous entities.
              <span className="absolute bottom-0 left-0 w-full h-2 bg-brut-red group-hover:bg-white transition-colors duration-300"></span>
            </span>
          </h1>
          <p className="mt-12 max-w-3xl text-xl font-mono text-white/80 uppercase border-y border-brut-red/30 py-6 tracking-wider leading-relaxed">
            AgentRail coordinates escrow, signed fulfillment proofs, optimistic verification windows, and dispute fallback for machine-to-machine commerce.
          </p>
        </div>

        <div className="brutalist-container transform translate-y-8 hover:translate-y-4 transition-transform duration-500 bg-black/80 backdrop-blur-sm border-4 hover:shadow-[16px_16px_0px_0px_var(--brut-red)]">
          <div className="absolute top-0 right-0 p-2 bg-brut-red text-black font-black text-xs hover-glitch cursor-help">V.0.1.0</div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brut-red mb-8 border-b border-brut-red/30 pb-4">WHAT_THIS_BUILD_PROVES</p>
          <ul className="space-y-6 text-sm font-mono uppercase text-white/90">
            <li className="flex items-start gap-4 group cursor-crosshair">
              <span className="text-brut-red mt-1 group-hover:animate-ping">]</span>
              <span className="group-hover:text-brut-red transition-colors">AI request normalization into a structured order proposal</span>
            </li>
            <li className="flex items-start gap-4 group cursor-crosshair">
              <span className="text-brut-red mt-1 group-hover:animate-ping">]</span>
              <span className="group-hover:text-brut-red transition-colors">Escrow funding before any provider action</span>
            </li>
            <li className="flex items-start gap-4 group cursor-crosshair">
              <span className="text-brut-red mt-1 group-hover:animate-ping">]</span>
              <span className="group-hover:text-brut-red transition-colors">Provider stake and proof submission</span>
            </li>
            <li className="flex items-start gap-4 group cursor-crosshair">
              <span className="text-brut-red mt-1 group-hover:animate-ping">]</span>
              <span className="group-hover:text-brut-red transition-colors">Optimistic challenge window before settlement</span>
            </li>
            <li className="flex items-start gap-4 group cursor-crosshair">
              <span className="text-brut-red mt-1 group-hover:animate-ping">]</span>
              <span className="group-hover:text-brut-red transition-colors">Arbiter fallback for disputed proofs</span>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
