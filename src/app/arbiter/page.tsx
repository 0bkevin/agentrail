import { AgentRailShell } from "@/components/agentrail-shell";
import { getDashboardSnapshot } from "@/lib/agentrail-store";

export default async function ArbiterPage() {
  const initialSnapshot = await getDashboardSnapshot();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">Arbiter Dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Resolve disputed orders with auditable outcomes</h1>
      </section>
      <AgentRailShell initialSnapshot={initialSnapshot} initialRole="arbiter" />
    </main>
  );
}
