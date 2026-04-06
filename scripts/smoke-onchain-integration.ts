import { createPublicClient, createWalletClient, decodeEventLog, encodePacked, http, keccak256, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import escrowArtifact from "../artifacts/contracts/AgentRailEscrow.sol/AgentRailEscrow.json";
import tokenArtifact from "../artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json";
import { attachOnchainOrder, createOrderFromProposalId, createQuote } from "../src/lib/agentrail-store";

const DEFAULT_PROVIDER_PK = "0x59c6995e998f97a5a0044966f094538c5f6d8c6f0f7f13f0ef5f0f6a3d8f6b4a";
const DEFAULT_BUYER_PK = "0x8b3a350cf5c34c9194ca5f9f80f2f0a2ce6a4b5dc1f4f2a20e3f9e5ab4f8d7c1";

function normalizePk(value: string | undefined, label: string): `0x${string}` {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  return normalized as `0x${string}`;
}

function envPk(key: string) {
  const value = process.env[key]?.trim();
  return value ? (value as `0x${string}`) : undefined;
}

function fulfillmentHash(label: string) {
  return keccak256(encodePacked(["string"], [`proof:${label}:${Date.now()}`]));
}

async function run() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const escrowAddress = process.env.NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS as `0x${string}` | undefined;
  const tokenAddress = process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as `0x${string}` | undefined;

  if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required.");
  if (!escrowAddress) throw new Error("NEXT_PUBLIC_AGENTRAIL_ESCROW_ADDRESS is required.");
  if (!tokenAddress) throw new Error("NEXT_PUBLIC_MOCK_USDC_ADDRESS is required.");

  const deployer = privateKeyToAccount(normalizePk(envPk("DEPLOYER_PRIVATE_KEY"), "DEPLOYER_PRIVATE_KEY"));
  const provider = privateKeyToAccount(envPk("PROVIDER_API_PRIVATE_KEY") ?? DEFAULT_PROVIDER_PK);
  const buyer = privateKeyToAccount(envPk("DEVICE_SIM_PRIVATE_KEY") ?? DEFAULT_BUYER_PK);

  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const deployerClient = createWalletClient({ account: deployer, chain: sepolia, transport: http(rpcUrl) });
  const providerClient = createWalletClient({ account: provider, chain: sepolia, transport: http(rpcUrl) });
  const buyerClient = createWalletClient({ account: buyer, chain: sepolia, transport: http(rpcUrl) });

  const fundAmount = parseUnits("0.01", 18);
  await deployerClient.sendTransaction({ to: buyer.address, value: fundAmount });
  await deployerClient.sendTransaction({ to: provider.address, value: fundAmount });

  const mintAmount = parseUnits("200", 6);
  const paymentAmount = parseUnits("25", 6);
  const providerStake = parseUnits("10", 6);

  const mintBuyerTx = await deployerClient.writeContract({
    address: tokenAddress,
    abi: tokenArtifact.abi,
    functionName: "mint",
    args: [buyer.address, mintAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintBuyerTx });

  const mintProviderTx = await deployerClient.writeContract({
    address: tokenAddress,
    abi: tokenArtifact.abi,
    functionName: "mint",
    args: [provider.address, mintAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintProviderTx });

  async function createLinkedOrder(label: string) {
    const proposal = await createQuote("paid_api", {
      target: `smoke-${label}`,
      resultFormat: "json",
    });

    const offchain = await createOrderFromProposalId(proposal.id, {
      role: "buyer",
      actorId: buyer.address,
    });

    const approveTx = await buyerClient.writeContract({
      address: tokenAddress,
      abi: tokenArtifact.abi,
      functionName: "approve",
      args: [escrowAddress, paymentAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    const createTx = await buyerClient.writeContract({
      address: escrowAddress,
      abi: escrowArtifact.abi,
      functionName: "createOrder",
      args: [provider.address, tokenAddress, paymentAmount, providerStake, proposal.requestHash as `0x${string}`, 0],
    });
    const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTx });

    let onchainOrderId: string | null = null;
    for (const log of createReceipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: escrowArtifact.abi,
          data: log.data,
          topics: log.topics,
          strict: false,
        });
        if (decoded.eventName === "OrderCreated") {
          const extracted = (decoded.args as { orderId?: bigint }).orderId;
          if (typeof extracted === "bigint") {
            onchainOrderId = extracted.toString();
            break;
          }
        }
      } catch {
        // ignore unrelated logs
      }
    }

    if (!onchainOrderId) {
      throw new Error("Could not extract on-chain order id from OrderCreated event.");
    }

    await attachOnchainOrder(offchain.id, onchainOrderId, createTx);

    return {
      offchainOrderId: offchain.id,
      onchainOrderId,
      requestHash: proposal.requestHash,
      txCreate: createTx,
      txApproveBuyer: approveTx,
    };
  }

  async function providerAcceptAndSubmit(onchainOrderId: string, label: string) {
    const approveStakeTx = await providerClient.writeContract({
      address: tokenAddress,
      abi: tokenArtifact.abi,
      functionName: "approve",
      args: [escrowAddress, providerStake],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveStakeTx });

    const acceptTx = await providerClient.writeContract({
      address: escrowAddress,
      abi: escrowArtifact.abi,
      functionName: "acceptOrder",
      args: [BigInt(onchainOrderId)],
    });
    await publicClient.waitForTransactionReceipt({ hash: acceptTx });

    const submitTx = await providerClient.writeContract({
      address: escrowAddress,
      abi: escrowArtifact.abi,
      functionName: "submitFulfillment",
      args: [BigInt(onchainOrderId), fulfillmentHash(label)],
    });
    await publicClient.waitForTransactionReceipt({ hash: submitTx });

    return {
      txApproveStake: approveStakeTx,
      txAccept: acceptTx,
      txSubmit: submitTx,
    };
  }

  async function startChallenge(onchainOrderId: string, seconds = 120) {
    const latestBlock = await publicClient.getBlock();
    const deadline = latestBlock.timestamp + BigInt(seconds);
    const tx = await deployerClient.writeContract({
      address: escrowAddress,
      abi: escrowArtifact.abi,
      functionName: "startChallengeWindow",
      args: [BigInt(onchainOrderId), deadline],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    return { txStartChallenge: tx, challengeDeadline: deadline.toString() };
  }

  const happy = await createLinkedOrder("happy");
  const happyProvider = await providerAcceptAndSubmit(happy.onchainOrderId, "happy");
  const happyChallenge = await startChallenge(happy.onchainOrderId, 120);
  const happySettleTx = await buyerClient.writeContract({
    address: escrowAddress,
    abi: escrowArtifact.abi,
    functionName: "approveEarlySettlement",
    args: [BigInt(happy.onchainOrderId)],
  });
  await publicClient.waitForTransactionReceipt({ hash: happySettleTx });

  const dispute = await createLinkedOrder("dispute");
  const disputeProvider = await providerAcceptAndSubmit(dispute.onchainOrderId, "dispute");
  const disputeChallenge = await startChallenge(dispute.onchainOrderId, 120);

  const disputeReasonHash = keccak256(encodePacked(["string"], ["smoke-dispute-reason"]));
  const disputeTx = await buyerClient.writeContract({
    address: escrowAddress,
    abi: escrowArtifact.abi,
    functionName: "disputeOrder",
    args: [BigInt(dispute.onchainOrderId), disputeReasonHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: disputeTx });

  const resolveTx = await deployerClient.writeContract({
    address: escrowAddress,
    abi: escrowArtifact.abi,
    functionName: "resolveDispute",
    args: [BigInt(dispute.onchainOrderId), false],
  });
  await publicClient.waitForTransactionReceipt({ hash: resolveTx });

  console.log(
    JSON.stringify(
      {
        ok: true,
        accounts: {
          deployer: deployer.address,
          buyer: buyer.address,
          provider: provider.address,
        },
        happyPath: {
          ...happy,
          ...happyProvider,
          ...happyChallenge,
          txApproveEarlySettlement: happySettleTx,
        },
        disputePath: {
          ...dispute,
          ...disputeProvider,
          ...disputeChallenge,
          txDispute: disputeTx,
          txResolveBuyerWin: resolveTx,
        },
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
