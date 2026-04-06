import escrowArtifact from "../../artifacts/contracts/AgentRailEscrow.sol/AgentRailEscrow.json";
import mockUsdcArtifact from "../../artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json";

export const agentRailEscrowAbi = escrowArtifact.abi;
export const mockUsdcAbi = mockUsdcArtifact.abi;

export const CONTRACTS = {
  escrow: process.env.NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS as `0x${string}` | undefined,
  mockUsdc: process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as `0x${string}` | undefined,
};

export function requireEscrowAddress() {
  if (!CONTRACTS.escrow) {
    throw new Error("Missing NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS in environment.");
  }
  return CONTRACTS.escrow;
}

export function requireMockUsdcAddress() {
  if (!CONTRACTS.mockUsdc) {
    throw new Error("Missing NEXT_PUBLIC_MOCK_USDC_ADDRESS in environment.");
  }
  return CONTRACTS.mockUsdc;
}
