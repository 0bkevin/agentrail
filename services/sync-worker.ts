import { syncEscrowEvents } from "../src/lib/event-sync";
import { getDashboardSnapshot } from "../src/lib/agentrail-store";
import { orchestrateAutoSettlement } from "../src/lib/verifier-orchestrator";

const DEFAULT_INTERVAL_MS = 10_000;

async function runLoop() {
  const intervalMs = Number(process.env.ESCROW_SYNC_INTERVAL_MS || DEFAULT_INTERVAL_MS);

  for (;;) {
    try {
      const result = await syncEscrowEvents();
      const snapshot = await getDashboardSnapshot();
      let autoSettled = 0;
      for (const order of snapshot.orders) {
        const settlement = await orchestrateAutoSettlement(order);
        if (settlement.attempted) {
          autoSettled += 1;
        }
      }
      console.log(
        JSON.stringify(
          {
            ts: new Date().toISOString(),
            worker: "escrow-sync",
            ok: true,
            autoSettled,
            ...result,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            ts: new Date().toISOString(),
            worker: "escrow-sync",
            ok: false,
            error: error instanceof Error ? error.message : "unknown error",
          },
          null,
          2,
        ),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

runLoop().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
