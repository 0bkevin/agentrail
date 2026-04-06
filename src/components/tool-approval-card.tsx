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
    <section className="rounded-3xl border border-cyan-300/25 bg-cyan-400/8 p-5 text-white shadow-[0_18px_60px_rgba(34,211,238,0.12)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/75">AI Proposal</p>
          <h3 className="mt-1 text-lg font-semibold">{proposal.title}</h3>
        </div>
        <span className="rounded-full border border-cyan-200/20 bg-slate-950/50 px-3 py-1 text-xs text-cyan-100">
          {proposal.serviceType.replaceAll("_", " ")}
        </span>
      </div>

      <p className="text-sm leading-6 text-slate-200">{proposal.summary}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Provider</p>
          <p className="mt-2 text-sm font-medium text-white">{proposal.providerName}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Escrow</p>
          <p className="mt-2 text-sm font-medium text-white">${proposal.paymentAmount} mockUSDC</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Provider Stake</p>
          <p className="mt-2 text-sm font-medium text-white">${proposal.providerStake} mockUSDC</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Why the agent chose this route</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-200">
          {proposal.rationale.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-cyan-300">+</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Funding escrow..." : "Approve and fund order"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="rounded-full border border-white/12 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </section>
  );
}
