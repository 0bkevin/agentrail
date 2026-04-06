import type { TerminalEntry } from "@/lib/agentrail-types";

const COLORS: Record<TerminalEntry["level"], string> = {
  system: "text-white/50",
  info: "text-white/80",
  warn: "text-brut-red",
  success: "text-green-500",
  error: "text-brut-red font-black underline",
  confirm: "text-brut-red font-bold",
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
    <section className="brutalist-container !p-0 flex flex-col group h-full max-h-[500px]">
      <div className="flex items-center justify-between border-b-2 border-brut-red bg-black px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 bg-brut-red opacity-80" />
          <span className="h-3 w-3 bg-brut-red opacity-50" />
          <span className="h-3 w-3 bg-brut-red opacity-30" />
        </div>
        <p className="font-mono text-xs font-black uppercase tracking-[0.3em] text-brut-red group-hover:hover-glitch">SYS_LOGS</p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4 font-mono text-xs bg-[url('/scanline.png')] bg-cover relative min-h-[300px]">
        <div className="absolute inset-0 bg-black/60 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col gap-2">
          {terminal.map((line) => (
            <div key={line.id} className="grid grid-cols-[70px_1fr] gap-3 border border-brut-accent bg-black p-2 hover:border-brut-red transition-colors">
              <span className="text-white/40">{formatTime(line.timestamp)}</span>
              <span className={`${COLORS[line.level]} uppercase tracking-tight break-words`}>{line.text}</span>
            </div>
          ))}
          {terminal.length === 0 && (
            <div className="text-white/40 uppercase tracking-widest text-center py-10 animate-pulse">Awaiting inputs...</div>
          )}
        </div>
      </div>
    </section>
  );
}
