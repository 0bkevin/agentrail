import type { TerminalEntry } from "@/lib/agentrail-types";

const COLORS: Record<TerminalEntry["level"], string> = {
  system: "text-slate-500",
  info: "text-slate-300",
  warn: "text-amber-300",
  success: "text-emerald-300",
  error: "text-rose-300",
  confirm: "text-cyan-300",
};

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

export function TerminalPanel({ terminal }: { terminal: TerminalEntry[] }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-[#07101d] shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between border-b border-cyan-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">Execution Log</p>
      </div>
      <div className="max-h-[360px] space-y-2 overflow-y-auto px-4 py-4 font-mono text-xs">
        {terminal.map((line) => (
          <div key={line.id} className="grid grid-cols-[70px_1fr] gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
            <span className="text-slate-600">{formatTime(line.timestamp)}</span>
            <span className={COLORS[line.level]}>{line.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
