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
    <section className="rounded-3xl border border-white/12 bg-white/5 p-5 shadow-[0_20px_80px_rgba(10,15,26,0.35)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Settlement Flow</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Optimistic escrow lifecycle</h3>
        </div>
        <div className="rounded-full border border-white/12 bg-slate-950/60 px-3 py-1 text-xs text-slate-300">
          {order ? order.status.replaceAll("_", " ") : "waiting for request"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isActive = index === currentIndex;

          return (
            <div key={step.label} className="flex min-w-[140px] flex-1 items-center gap-3">
              <div
                className={[
                  "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold",
                  isActive
                    ? "border-cyan-300 bg-cyan-400/15 text-cyan-100"
                    : isComplete
                      ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-100"
                      : "border-white/12 bg-slate-950/70 text-slate-400",
                ].join(" ")}
              >
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{step.label}</p>
                <p className="text-xs text-slate-400">{step.sub}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
