import { rm } from "node:fs/promises";
import path from "node:path";

import { resetDemoState } from "../src/lib/agentrail-store";

async function main() {
  await resetDemoState();

  const artifactPath = path.resolve(process.cwd(), "data", "artifacts");
  await rm(artifactPath, { recursive: true, force: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "reset-demo-state",
        artifactsRemoved: artifactPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
