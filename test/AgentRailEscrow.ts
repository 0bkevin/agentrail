import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("AgentRailEscrow", function () {
  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  async function deployFixture() {
    const [owner, buyer, provider, verifier, resolver, outsider] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("MockUSDC");
    const token = await tokenFactory.deploy();
    await token.waitForDeployment();

    const escrowFactory = await ethers.getContractFactory("AgentRailEscrow");
    const escrow = await escrowFactory.deploy(owner.address, 60, SEVEN_DAYS);
    await escrow.waitForDeployment();

    await escrow.connect(owner).setVerifier(verifier.address, true);
    await escrow.connect(owner).setResolver(resolver.address, true);

    const mintAmount = 1_000_000_000n;
    await token.mint(buyer.address, mintAmount);
    await token.mint(provider.address, mintAmount);

    return { escrow, token, owner, buyer, provider, verifier, resolver, outsider };
  }

  it("creates an order and escrows buyer funds", async function () {
    const { escrow, token, buyer, provider } = await loadFixture(deployFixture);
    const paymentAmount = 50_000_000n;
    const stakeAmount = 10_000_000n;
    const requestHash = ethers.keccak256(ethers.toUtf8Bytes("request:api"));

    await token.connect(buyer).approve(await escrow.getAddress(), paymentAmount);

    await expect(
      escrow
        .connect(buyer)
        .createOrder(provider.address, await token.getAddress(), paymentAmount, stakeAmount, requestHash, 0),
    )
      .to.emit(escrow, "OrderCreated")
      .withArgs(1, buyer.address, provider.address, await token.getAddress(), paymentAmount, stakeAmount, requestHash, 0);

    const order = await escrow.getOrder(1);
    expect(order.status).to.equal(1);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(paymentAmount);
  });

  it("runs the happy path through challenge window settlement", async function () {
    const { escrow, token, buyer, provider, verifier } = await loadFixture(deployFixture);
    const paymentAmount = 42_000_000n;
    const stakeAmount = 20_000_000n;

    await token.connect(buyer).approve(await escrow.getAddress(), paymentAmount);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), paymentAmount, stakeAmount, ethers.keccak256(ethers.toUtf8Bytes("request:iot")), 1);

    await token.connect(provider).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(provider).acceptOrder(1);

    const fulfillmentHash = ethers.keccak256(ethers.toUtf8Bytes("proof:temperature"));
    await escrow.connect(provider).submitFulfillment(1, fulfillmentHash);

    const challengeDeadline = BigInt((await time.latest()) + 3600);
    await escrow.connect(verifier).startChallengeWindow(1, challengeDeadline);

    await time.increaseTo(challengeDeadline + 1n);

    await expect(escrow.connect(buyer).settleOrder(1)).to.emit(escrow, "OrderSettled").withArgs(1, buyer.address);

    expect(await token.balanceOf(provider.address)).to.equal(1_000_000_000n + paymentAmount);
  });

  it("allows buyer to dispute during the challenge window", async function () {
    const { escrow, token, buyer, provider, verifier, resolver } = await loadFixture(deployFixture);
    const paymentAmount = 75_000_000n;
    const stakeAmount = 15_000_000n;

    await token.connect(buyer).approve(await escrow.getAddress(), paymentAmount);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), paymentAmount, stakeAmount, ethers.keccak256(ethers.toUtf8Bytes("request:human")), 2);

    await token.connect(provider).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(provider).acceptOrder(1);
    await escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:bad")));

    const challengeDeadline = BigInt((await time.latest()) + 600);
    await escrow.connect(verifier).startChallengeWindow(1, challengeDeadline);

    const disputeHash = ethers.keccak256(ethers.toUtf8Bytes("reason:bad-proof"));
    await expect(escrow.connect(buyer).disputeOrder(1, disputeHash))
      .to.emit(escrow, "OrderDisputed")
      .withArgs(1, disputeHash, buyer.address);

    await expect(escrow.connect(resolver).resolveDispute(1, false))
      .to.emit(escrow, "DisputeResolved")
      .withArgs(1, false, resolver.address);

    await expect(escrow.connect(resolver).resolveDispute(1, false))
      .to.be.revertedWithCustomError(escrow, "InvalidState");

    expect(await token.balanceOf(buyer.address)).to.equal(1_000_000_000n + (stakeAmount / 2n));
    expect(await token.balanceOf(provider.address)).to.equal(1_000_000_000n - (stakeAmount / 2n));
  });

  it("allows buyer to approve early settlement before challenge deadline", async function () {
    const { escrow, token, buyer, provider, verifier } = await loadFixture(deployFixture);
    const paymentAmount = 10_000_000n;
    const stakeAmount = 3_000_000n;

    await token.connect(buyer).approve(await escrow.getAddress(), paymentAmount);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), paymentAmount, stakeAmount, ethers.keccak256(ethers.toUtf8Bytes("request:early-settle")), 0);

    await token.connect(provider).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(provider).acceptOrder(1);
    await escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:early-settle")));

    const challengeDeadline = BigInt((await time.latest()) + 600);
    await escrow.connect(verifier).startChallengeWindow(1, challengeDeadline);

    await expect(escrow.connect(buyer).approveEarlySettlement(1))
      .to.emit(escrow, "EarlySettlementApproved")
      .withArgs(1, buyer.address);

    const order = await escrow.getOrder(1);
    expect(order.status).to.equal(6);
    expect(await token.balanceOf(provider.address)).to.equal(1_000_000_000n + paymentAmount);
  });

  it("supports configurable provider slash bps on buyer win", async function () {
    const { escrow, token, owner, buyer, provider, verifier, resolver } = await loadFixture(deployFixture);
    const paymentAmount = 20_000_000n;
    const stakeAmount = 8_000_000n;

    await escrow.connect(owner).setProviderSlashBpsOnBuyerWin(2_500);

    await token.connect(buyer).approve(await escrow.getAddress(), paymentAmount);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), paymentAmount, stakeAmount, ethers.keccak256(ethers.toUtf8Bytes("request:slash-config")), 2);

    await token.connect(provider).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(provider).acceptOrder(1);
    await escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:slash-config")));

    const challengeDeadline = BigInt((await time.latest()) + 600);
    await escrow.connect(verifier).startChallengeWindow(1, challengeDeadline);
    await escrow.connect(buyer).disputeOrder(1, ethers.keccak256(ethers.toUtf8Bytes("reason:slash-config")));
    await escrow.connect(resolver).resolveDispute(1, false);

    const slashed = (stakeAmount * 2_500n) / 10_000n;
    const providerRefund = stakeAmount - slashed;

    expect(await token.balanceOf(buyer.address)).to.equal(1_000_000_000n + slashed);
    expect(await token.balanceOf(provider.address)).to.equal(1_000_000_000n - stakeAmount + providerRefund);
  });

  it("only allows the designated provider to accept", async function () {
    const { escrow, token, buyer, provider, outsider } = await loadFixture(deployFixture);

    await token.connect(buyer).approve(await escrow.getAddress(), 1_000_000n);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), 1_000_000n, 100_000n, ethers.keccak256(ethers.toUtf8Bytes("request:acl")), 0);

    await expect(escrow.connect(outsider).acceptOrder(1)).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("allows the buyer to cancel before provider acceptance", async function () {
    const { escrow, token, buyer, provider } = await loadFixture(deployFixture);

    await token.connect(buyer).approve(await escrow.getAddress(), 9_000_000n);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), 9_000_000n, 1_000_000n, ethers.keccak256(ethers.toUtf8Bytes("request:cancel")), 0);

    await expect(escrow.connect(buyer).cancelOrder(1)).to.emit(escrow, "OrderCancelled").withArgs(1, buyer.address);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0);
  });

  it("prevents submitting fulfillment twice by moving to Fulfilled", async function () {
    const { escrow, token, buyer, provider } = await loadFixture(deployFixture);

    await token.connect(buyer).approve(await escrow.getAddress(), 5_000_000n);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), 5_000_000n, 1_000_000n, ethers.keccak256(ethers.toUtf8Bytes("request:proof-once")), 0);

    await token.connect(provider).approve(await escrow.getAddress(), 1_000_000n);
    await escrow.connect(provider).acceptOrder(1);
    await escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:once")));

    const order = await escrow.getOrder(1);
    expect(order.status).to.equal(3);

    await expect(
      escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:twice"))),
    ).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("only lets verifiers start the challenge window", async function () {
    const { escrow, token, buyer, provider, outsider } = await loadFixture(deployFixture);

    await token.connect(buyer).approve(await escrow.getAddress(), 6_000_000n);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), 6_000_000n, 2_000_000n, ethers.keccak256(ethers.toUtf8Bytes("request:verify")), 0);

    await token.connect(provider).approve(await escrow.getAddress(), 2_000_000n);
    await escrow.connect(provider).acceptOrder(1);
    await escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:verify")));

    await expect(escrow.connect(outsider).startChallengeWindow(1, BigInt((await time.latest()) + 600)))
      .to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("closes disputes exactly at the challenge deadline", async function () {
    const { escrow, token, buyer, provider, verifier } = await loadFixture(deployFixture);

    await token.connect(buyer).approve(await escrow.getAddress(), 8_000_000n);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), 8_000_000n, 2_000_000n, ethers.keccak256(ethers.toUtf8Bytes("request:deadline")), 1);

    await token.connect(provider).approve(await escrow.getAddress(), 2_000_000n);
    await escrow.connect(provider).acceptOrder(1);
    await escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:deadline")));

    const challengeDeadline = BigInt((await time.latest()) + 300);
    await escrow.connect(verifier).startChallengeWindow(1, challengeDeadline);
    await time.increaseTo(challengeDeadline);

    await expect(
      escrow.connect(buyer).disputeOrder(1, ethers.keccak256(ethers.toUtf8Bytes("reason:too-late"))),
    ).to.be.revertedWithCustomError(escrow, "ChallengeWindowClosed");

    await expect(escrow.connect(provider).settleOrder(1)).to.emit(escrow, "OrderSettled").withArgs(1, provider.address);
  });

  it("allows resolver to settle disputed orders in provider favor", async function () {
    const { escrow, token, buyer, provider, verifier, resolver } = await loadFixture(deployFixture);
    const paymentAmount = 12_000_000n;
    const stakeAmount = 4_000_000n;

    await token.connect(buyer).approve(await escrow.getAddress(), paymentAmount);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), paymentAmount, stakeAmount, ethers.keccak256(ethers.toUtf8Bytes("request:provider-win")), 0);

    await token.connect(provider).approve(await escrow.getAddress(), stakeAmount);
    await escrow.connect(provider).acceptOrder(1);
    await escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:provider-win")));

    const challengeDeadline = BigInt((await time.latest()) + 600);
    await escrow.connect(verifier).startChallengeWindow(1, challengeDeadline);
    await escrow.connect(buyer).disputeOrder(1, ethers.keccak256(ethers.toUtf8Bytes("reason:review")));

    await expect(escrow.connect(resolver).resolveDispute(1, true))
      .to.emit(escrow, "DisputeResolved")
      .withArgs(1, true, resolver.address);

    expect(await token.balanceOf(provider.address)).to.equal(1_000_000_000n + paymentAmount);
  });

  it("rejects challenge windows outside configured bounds", async function () {
    const { escrow, token, buyer, provider, verifier } = await loadFixture(deployFixture);

    await token.connect(buyer).approve(await escrow.getAddress(), 7_000_000n);
    await escrow
      .connect(buyer)
      .createOrder(provider.address, await token.getAddress(), 7_000_000n, 1_000_000n, ethers.keccak256(ethers.toUtf8Bytes("request:window")), 0);

    await token.connect(provider).approve(await escrow.getAddress(), 1_000_000n);
    await escrow.connect(provider).acceptOrder(1);
    await escrow.connect(provider).submitFulfillment(1, ethers.keccak256(ethers.toUtf8Bytes("proof:window")));

    await expect(
      escrow.connect(verifier).startChallengeWindow(1, BigInt((await time.latest()) + 30)),
    ).to.be.revertedWithCustomError(escrow, "InvalidChallengeWindow");
  });
});
