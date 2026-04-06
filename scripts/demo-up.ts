import { spawn } from "node:child_process";

const services = [
  { name: "web", command: "pnpm", args: ["dev"] },
  { name: "provider-api", command: "pnpm", args: ["service:provider-api"] },
  { name: "device-sim", command: "pnpm", args: ["service:device-sim"] },
  { name: "proof-verifier", command: "pnpm", args: ["service:proof-verifier"] },
  { name: "human-solver", command: "pnpm", args: ["service:human-solver"] },
  { name: "sync-worker", command: "pnpm", args: ["worker:sync"] },
];

const children = services.map((service) => {
  const child = spawn(service.command, service.args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code) => {
    console.log(`[demo-up] ${service.name} exited with code ${code ?? 0}`);
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[demo-up] AgentRail demo stack started. Press Ctrl+C to stop all services.");
