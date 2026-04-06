import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet, sepolia } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";

export const projectId =
  process.env.NEXT_PUBLIC_PROJECT_ID || "b56e18d47c72ab683b10814fe9495694";

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia, mainnet];

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  ssr: true,
});

export const metadata = {
  name: "AgentRail",
  description: "Autonomous commerce and settlement rail for AI agents and IoT devices.",
  url: "http://localhost:3000",
  icons: ["https://avatars.githubusercontent.com/u/179229932?s=200&v=4"],
};
