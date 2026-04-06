import type { Order } from "@/lib/agentrail-types";

const STEPS = [
  { label: "Request", sub: "Agent intent" },
  { label: "Escrow", sub: "Buyer funded" },
  { label: "Stake", sub: "Provider accepted" },
  { label: "Proof", sub: "Evidence submitted" },
  { label: "Review", sub: "Challenge window" },
  { label: "Settlement", sub: "Release or refund" },
];

function activeIndex(order?: Order) {
  if (!order) {
    return 0;
  }
  switch (order.status) {
    case "draft":
      return 0;
    case "funded":
      return 1;
    case "accepted":
      return 2;
    case "fulfilled":
      return 3;
    case "in_challenge":
      return 4;
    case "disputed":
      return 4;
    case "settled":
    case "refunded":
    case "cancelled":
      return 5;
  }

  return 0;
}

export function FlowDiagram({ order }: { order?: Order }) {
  const currentIndex = activeIndex(order);

  return (
    <section className="brutalist-container group">
      <div className="mb-6 flex items-center justify-between gap-3 border-b-2 border-brut-accent pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-brut-red mb-1 group-hover:hover-glitch">SETTLEMENT_FLOW</p>
          <h3 className="text-lg font-bold text-white uppercase tracking-tight">Optimistic escrow lifecycle</h3>
        </div>
        <div className="border border-brut-red bg-black px-4 py-2 font-mono text-xs font-bold text-brut-red uppercase tracking-widest shadow-[4px_4px_0px_0px_var(--brut-red)]">
          {order ? order.status.replaceAll("_", " ") : "WAITING_FOR_REQUEST"}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isActive = index === currentIndex;

          return (
            <div key={step.label} className="flex min-w-[150px] flex-1 flex-col gap-3 relative">
              <div
                className={[
                  "flex h-12 w-12 items-center justify-center border-2 font-mono text-sm font-bold z-10 transition-colors",
                  isActive
                    ? "border-brut-red bg-brut-red text-black shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] animate-pulse"
                    : isComplete
                      ? "border-white bg-white text-black shadow-[4px_4px_0px_0px_var(--brut-red)]"
                      : "border-brut-accent bg-black text-white/40",
                ].join(" ")}
              >
                {index + 1}
              </div>
              <div className="min-w-0 font-mono">
                <p className={`text-sm font-bold uppercase tracking-wide ${isActive || isComplete ? "text-white" : "text-white/50"}`}>{step.label}</p>
                <p className={`text-xs uppercase mt-1 ${isActive ? "text-brut-red" : isComplete ? "text-white/70" : "text-white/40"}`}>{step.sub}</p>
              </div>
              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div className={`absolute top-6 left-12 right-0 h-0.5 -z-0 -mr-4 ${isComplete ? "bg-white" : "bg-brut-accent"}`}></div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
