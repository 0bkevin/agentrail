// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @custom:security-contact security@agentrail.dev
 */
contract AgentRailEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum OrderStatus {
        None,
        Funded,
        Accepted,
        Fulfilled,
        InChallenge,
        Disputed,
        Settled,
        Refunded,
        Cancelled
    }

    enum ServiceType {
        PaidApi,
        IoTAction,
        HumanTask
    }

    struct Order {
        uint256 id;
        address buyer;
        address provider;
        address paymentToken;
        uint256 paymentAmount;
        uint256 providerStake;
        bytes32 requestHash;
        bytes32 fulfillmentHash;
        uint64 createdAt;
        uint64 acceptedAt;
        uint64 fulfilledAt;
        uint64 challengeDeadline;
        OrderStatus status;
        ServiceType serviceType;
    }

    uint64 public immutable minChallengeWindow;
    uint64 public maxChallengeWindow;
    uint256 public nextOrderId = 1;

    mapping(uint256 => Order) public orders;
    mapping(uint256 => bytes32) public disputeReasonHashes;
    mapping(uint256 => bool) public earlySettlementApproved;
    mapping(address => bool) public verifiers;
    mapping(address => bool) public resolvers;

    uint16 public providerSlashBpsOnBuyerWin;
    uint16 private constant MAX_BPS = 10_000;

    error InvalidAddress();
    error InvalidAmount();
    error InvalidOrder();
    error InvalidState(OrderStatus expected, OrderStatus actual);
    error Unauthorized();
    error InvalidHash();
    error InvalidChallengeWindow();
    error ChallengeWindowStillOpen(uint64 challengeDeadline);
    error ChallengeWindowClosed(uint64 challengeDeadline);
    error InvalidBps();
    error UnexpectedTokenAmountReceived(uint256 expected, uint256 actual);

    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed provider,
        address paymentToken,
        uint256 paymentAmount,
        uint256 providerStake,
        bytes32 requestHash,
        ServiceType serviceType
    );
    event OrderAccepted(uint256 indexed orderId, address indexed provider, uint256 providerStake);
    event FulfillmentSubmitted(uint256 indexed orderId, bytes32 fulfillmentHash);
    event ChallengeWindowStarted(uint256 indexed orderId, uint64 challengeDeadline, address indexed verifier);
    event OrderDisputed(uint256 indexed orderId, bytes32 disputeReasonHash, address indexed challenger);
    event DisputeResolved(uint256 indexed orderId, bool providerWins, address indexed resolver);
    event OrderSettled(uint256 indexed orderId, address indexed settler);
    event OrderRefunded(uint256 indexed orderId, address indexed receiver, bool providerStakeSlashed);
    event OrderCancelled(uint256 indexed orderId, address indexed buyer);
    event VerifierUpdated(address indexed verifier, bool allowed);
    event ResolverUpdated(address indexed resolver, bool allowed);
    event MaxChallengeWindowUpdated(uint64 previousWindow, uint64 newWindow);
    event ProviderSlashBpsUpdated(uint16 previousBps, uint16 newBps);
    event EarlySettlementApproved(uint256 indexed orderId, address indexed buyer);
    event BuyerWinPayout(uint256 indexed orderId, uint256 buyerAmount, uint256 providerRefund, uint256 slashedAmount);

    constructor(address initialOwner, uint64 _minChallengeWindow, uint64 _maxChallengeWindow) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        if (_minChallengeWindow == 0 || _maxChallengeWindow < _minChallengeWindow) {
            revert InvalidChallengeWindow();
        }

        minChallengeWindow = _minChallengeWindow;
        maxChallengeWindow = _maxChallengeWindow;
        providerSlashBpsOnBuyerWin = 5_000;
    }

    modifier onlyVerifier() {
        if (!verifiers[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyResolver() {
        if (!resolvers[msg.sender]) revert Unauthorized();
        _;
    }

    function createOrder(
        address provider,
        address paymentToken,
        uint256 paymentAmount,
        uint256 providerStake,
        bytes32 requestHash,
        ServiceType serviceType
    ) external nonReentrant returns (uint256 orderId) {
        if (provider == address(0) || paymentToken == address(0)) revert InvalidAddress();
        if (paymentAmount == 0) revert InvalidAmount();
        if (requestHash == bytes32(0)) revert InvalidHash();

        orderId = nextOrderId++;

        orders[orderId] = Order({
            id: orderId,
            buyer: msg.sender,
            provider: provider,
            paymentToken: paymentToken,
            paymentAmount: paymentAmount,
            providerStake: providerStake,
            requestHash: requestHash,
            fulfillmentHash: bytes32(0),
            createdAt: uint64(block.timestamp),
            acceptedAt: 0,
            fulfilledAt: 0,
            challengeDeadline: 0,
            status: OrderStatus.Funded,
            serviceType: serviceType
        });

        _pullExactTokens(paymentToken, msg.sender, paymentAmount);

        emit OrderCreated(
            orderId,
            msg.sender,
            provider,
            paymentToken,
            paymentAmount,
            providerStake,
            requestHash,
            serviceType
        );
    }

    function acceptOrder(uint256 orderId) external nonReentrant {
        Order storage order = _getOrder(orderId);
        _requireStatus(order, OrderStatus.Funded);
        if (msg.sender != order.provider) revert Unauthorized();

        order.acceptedAt = uint64(block.timestamp);
        order.status = OrderStatus.Accepted;

        if (order.providerStake > 0) {
            _pullExactTokens(order.paymentToken, msg.sender, order.providerStake);
        }

        emit OrderAccepted(orderId, msg.sender, order.providerStake);
    }

    function submitFulfillment(uint256 orderId, bytes32 fulfillmentHash) external {
        Order storage order = _getOrder(orderId);
        _requireStatus(order, OrderStatus.Accepted);
        if (msg.sender != order.provider) revert Unauthorized();
        if (fulfillmentHash == bytes32(0)) revert InvalidHash();

        order.fulfillmentHash = fulfillmentHash;
        order.fulfilledAt = uint64(block.timestamp);
        order.status = OrderStatus.Fulfilled;

        emit FulfillmentSubmitted(orderId, fulfillmentHash);
    }

    function startChallengeWindow(uint256 orderId, uint64 challengeDeadline) external onlyVerifier {
        Order storage order = _getOrder(orderId);
        _requireStatus(order, OrderStatus.Fulfilled);
        if (order.fulfillmentHash == bytes32(0)) revert InvalidHash();

        uint64 currentTime = uint64(block.timestamp);
        uint64 duration = challengeDeadline > currentTime ? challengeDeadline - currentTime : 0;
        if (duration < minChallengeWindow || duration > maxChallengeWindow) {
            revert InvalidChallengeWindow();
        }

        order.challengeDeadline = challengeDeadline;
        order.status = OrderStatus.InChallenge;

        emit ChallengeWindowStarted(orderId, challengeDeadline, msg.sender);
    }

    function disputeOrder(uint256 orderId, bytes32 disputeReasonHash) external {
        Order storage order = _getOrder(orderId);
        _requireStatus(order, OrderStatus.InChallenge);
        if (disputeReasonHash == bytes32(0)) revert InvalidHash();
        if (msg.sender != order.buyer && !verifiers[msg.sender]) revert Unauthorized();
        if (block.timestamp >= order.challengeDeadline) revert ChallengeWindowClosed(order.challengeDeadline);

        order.status = OrderStatus.Disputed;
        disputeReasonHashes[orderId] = disputeReasonHash;

        emit OrderDisputed(orderId, disputeReasonHash, msg.sender);
    }

    function settleOrder(uint256 orderId) external nonReentrant {
        Order storage order = _getOrder(orderId);
        _requireStatus(order, OrderStatus.InChallenge);
        if (block.timestamp < order.challengeDeadline && !earlySettlementApproved[orderId]) {
            revert ChallengeWindowStillOpen(order.challengeDeadline);
        }

        order.status = OrderStatus.Settled;

        IERC20 token = IERC20(order.paymentToken);
        token.safeTransfer(order.provider, order.paymentAmount + order.providerStake);

        emit OrderSettled(orderId, msg.sender);
    }

    function approveEarlySettlement(uint256 orderId) external nonReentrant {
        Order storage order = _getOrder(orderId);
        _requireStatus(order, OrderStatus.InChallenge);
        if (msg.sender != order.buyer) revert Unauthorized();

        earlySettlementApproved[orderId] = true;
        order.status = OrderStatus.Settled;

        IERC20 token = IERC20(order.paymentToken);
        token.safeTransfer(order.provider, order.paymentAmount + order.providerStake);

        emit EarlySettlementApproved(orderId, msg.sender);
        emit OrderSettled(orderId, msg.sender);
    }

    function resolveDispute(uint256 orderId, bool providerWins) external nonReentrant onlyResolver {
        Order storage order = _getOrder(orderId);
        _requireStatus(order, OrderStatus.Disputed);

        IERC20 token = IERC20(order.paymentToken);
        if (providerWins) {
            order.status = OrderStatus.Settled;
            token.safeTransfer(order.provider, order.paymentAmount + order.providerStake);
            emit DisputeResolved(orderId, true, msg.sender);
            emit OrderSettled(orderId, msg.sender);
            return;
        }

        order.status = OrderStatus.Refunded;
        uint256 slashedAmount = (order.providerStake * providerSlashBpsOnBuyerWin) / MAX_BPS;
        uint256 providerRefund = order.providerStake - slashedAmount;
        uint256 buyerAmount = order.paymentAmount + slashedAmount;

        token.safeTransfer(order.buyer, buyerAmount);
        if (providerRefund > 0) {
            token.safeTransfer(order.provider, providerRefund);
        }

        emit DisputeResolved(orderId, false, msg.sender);
        emit OrderRefunded(orderId, order.buyer, slashedAmount > 0);
        emit BuyerWinPayout(orderId, buyerAmount, providerRefund, slashedAmount);
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = _getOrder(orderId);
        _requireStatus(order, OrderStatus.Funded);
        if (msg.sender != order.buyer) revert Unauthorized();

        order.status = OrderStatus.Cancelled;
        IERC20(order.paymentToken).safeTransfer(order.buyer, order.paymentAmount);

        emit OrderCancelled(orderId, order.buyer);
    }

    function setVerifier(address verifier, bool allowed) external onlyOwner {
        if (verifier == address(0)) revert InvalidAddress();
        verifiers[verifier] = allowed;
        emit VerifierUpdated(verifier, allowed);
    }

    function setResolver(address resolver, bool allowed) external onlyOwner {
        if (resolver == address(0)) revert InvalidAddress();
        resolvers[resolver] = allowed;
        emit ResolverUpdated(resolver, allowed);
    }

    function setMaxChallengeWindow(uint64 newWindow) external onlyOwner {
        if (newWindow < minChallengeWindow) revert InvalidChallengeWindow();
        uint64 previousWindow = maxChallengeWindow;
        maxChallengeWindow = newWindow;
        emit MaxChallengeWindowUpdated(previousWindow, newWindow);
    }

    function setProviderSlashBpsOnBuyerWin(uint16 newBps) external onlyOwner {
        if (newBps > MAX_BPS) revert InvalidBps();
        uint16 previousBps = providerSlashBpsOnBuyerWin;
        providerSlashBpsOnBuyerWin = newBps;
        emit ProviderSlashBpsUpdated(previousBps, newBps);
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _getOrder(orderId);
    }

    function _getOrder(uint256 orderId) internal view returns (Order storage order) {
        order = orders[orderId];
        if (order.id == 0) revert InvalidOrder();
    }

    function _requireStatus(Order storage order, OrderStatus expectedStatus) internal view {
        if (order.status != expectedStatus) {
            revert InvalidState(expectedStatus, order.status);
        }
    }

    function _pullExactTokens(address token, address from, uint256 amount) internal {
        IERC20 erc20Token = IERC20(token);
        uint256 balanceBefore = erc20Token.balanceOf(address(this));
        erc20Token.safeTransferFrom(from, address(this), amount);
        uint256 balanceAfter = erc20Token.balanceOf(address(this));
        uint256 received = balanceAfter - balanceBefore;
        if (received != amount) revert UnexpectedTokenAmountReceived(amount, received);
    }
}
