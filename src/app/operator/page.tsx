import { AgentRailShell } from "@/components/agentrail-shell";
import { getDashboardSnapshot } from "@/lib/agentrail-store";
import { ProtectedRoute } from "@/components/protected-route";

export default async function OperatorPage() {
  const initialSnapshot = await getDashboardSnapshot();

  return (
    <ProtectedRoute title="OPERATOR">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="brutalist-container">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-brut-red">OPERATOR_CONSOLE</p>
          <h1 className="mt-4 text-3xl font-black text-white uppercase tracking-tight">Monitor lifecycle, verification queues, and settlement risk</h1>
        </section>
        <AgentRailShell initialSnapshot={initialSnapshot} initialRole="operator" />
      </main>
    </ProtectedRoute>
  );
}
