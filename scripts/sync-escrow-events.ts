import { syncEscrowEvents } from "../src/lib/event-sync";

async function main() {
  const result = await syncEscrowEvents();
  console.log(
    JSON.stringify(
      { ok: true, ...result },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
