import type { AgentProposal } from "@/lib/agentrail-types";

export function ToolApprovalCard({
  proposal,
  busy,
  onApprove,
  onReject,
}: {
  proposal: AgentProposal;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <section className="brutalist-container !border-white text-white group shadow-[8px_8px_0px_0px_rgba(255,255,255,1)]">
      <div className="absolute top-0 right-0 p-2 bg-white text-black font-black text-xs">AWAITING_APPROVAL</div>
      <div className="mb-6 border-b-2 border-white pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white mb-2">AI_PROPOSAL</p>
          <h3 className="text-2xl font-black uppercase tracking-tighter">{proposal.title}</h3>
        </div>
        <div className="mt-4 border border-white bg-black px-3 py-1 text-xs font-mono font-bold uppercase tracking-widest inline-block shadow-[4px_4px_0px_0px_var(--brut-red)] text-brut-red">
          [{proposal.serviceType.replaceAll("_", " ")}]
        </div>
      </div>

      <p className="text-sm font-mono leading-relaxed text-white/80 uppercase">{proposal.summary}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="border border-white bg-black p-4 relative hover:-translate-y-1 transition-transform">
          <div className="absolute top-0 left-0 w-full h-1 bg-brut-red"></div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/60">Provider</p>
          <p className="mt-2 text-sm font-mono font-bold text-white uppercase">{proposal.providerName}</p>
        </div>
        <div className="border border-white bg-black p-4 relative hover:-translate-y-1 transition-transform">
          <div className="absolute top-0 left-0 w-full h-1 bg-white"></div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/60">Escrow</p>
          <p className="mt-2 text-sm font-mono font-bold text-white uppercase">${proposal.paymentAmount} MOCK_USDC</p>
        </div>
        <div className="border border-white bg-black p-4 relative hover:-translate-y-1 transition-transform">
          <div className="absolute top-0 left-0 w-full h-1 bg-brut-red"></div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/60">Provider Stake</p>
          <p className="mt-2 text-sm font-mono font-bold text-white uppercase">${proposal.providerStake} MOCK_USDC</p>
        </div>
      </div>

      <div className="mt-6 border border-white bg-black p-4">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-white/60 border-b border-white/20 pb-2 mb-3">AGENT_RATIONALE</p>
        <ul className="space-y-3 text-sm font-mono text-white/90">
          {proposal.rationale.map((item) => (
            <li key={item} className="flex gap-3 uppercase items-start">
              <span className="text-brut-red font-black mt-0.5">&gt;</span>
              <span className="leading-tight">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 flex flex-wrap gap-4">
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className="brutalist-button !bg-white !text-black !border-white hover:!bg-black hover:!text-white disabled:cursor-not-allowed disabled:opacity-60 shadow-[6px_6px_0px_0px_var(--brut-red)] hover:shadow-[6px_6px_0px_0px_var(--brut-red)]"
        >
          {busy ? "FUNDING_ESCROW..." : "APPROVE_AND_FUND"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="brutalist-button-outline disabled:cursor-not-allowed disabled:opacity-60"
        >
          REJECT_PROPOSAL
        </button>
      </div>
    </section>
  );
}
