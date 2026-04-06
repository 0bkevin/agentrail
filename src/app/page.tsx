import { AgentRailShell } from "@/components/agentrail-shell";
import { LandingHero } from "@/components/landing-hero";
import { getDashboardSnapshot } from "@/lib/agentrail-store";

export default async function Home() {
  const initialSnapshot = await getDashboardSnapshot();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <LandingHero />
      <AgentRailShell initialSnapshot={initialSnapshot} />
    </main>
  );
}
