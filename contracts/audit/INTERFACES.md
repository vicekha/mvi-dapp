# Contract Interfaces Summary

This document provides a quick reference for all public/external interfaces in the core contracts.

---

## WalletSwapMain.sol

### Events
```solidity
event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, AssetType typeIn, AssetType typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp);
event OrderExecuted(bytes32 indexed orderId, address indexed taker, uint256 amountOut, uint256 timestamp);
event OrderAutoMatched(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 timestamp);
event CrossChainCallbackExecuted(bytes32 indexed callbackId, bytes32 indexed orderId, uint256 amountOut, uint256 timestamp);
event MatchAttempted(bytes32 indexed orderId, address tokenIn, address tokenOut);
event MatchCalculated(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 amountAtoB, uint256 amountBtoA);
```

### External Functions
```solidity
function createOrder(
    address tokenIn, address tokenOut, 
    AssetType typeIn, AssetType typeOut,
    uint256 amountIn, uint256 amountOut, 
    uint256 minutesValueIn, uint256 minutesValueOut,
    uint256 slippageTolerance, uint256 duration, 
    bool enableRebooking, uint256 targetChainId
) external payable returns (bytes32);

function fulfillOrder(bytes32 orderId) external payable;

function cancelOrder(bytes32 orderId) external;

function executeInterChainOrder(
    address rvmId, 
    bytes32 orderId, 
    address beneficiary
) external;

function setAuthorizedReactiveVM(address _rvm) external; // onlyOwner
function setCallbackProxy(address _proxy) external; // onlyOwner
function updateComponents(address _lp, address _proc, address _fee, address _av) external; // onlyOwner
```

---

## EulerLagrangeOrderProcessor.sol

### Order Structure
```solidity
struct Order {
    address maker;
    address tokenIn;
    address tokenOut;
    AssetType typeIn;
    AssetType typeOut;
    uint256 amountIn;
    uint256 amountOut;
    uint256 minutesValueIn;
    uint256 minutesValueOut;
    uint256 slippageTolerance;
    uint256 filledAmount;
    uint256 timestamp;
    uint256 expiration;
    OrderStatus status;
    bool rebookEnabled;
    uint8 rebookAttempts;
    bytes32 verificationId;
    uint256 targetChainId;
}

enum OrderStatus { ACTIVE, FILLED, PARTIALLY_FILLED, CANCELLED, EXPIRED }
enum AssetType { ERC20, ERC721 }
```

### Events
```solidity
event OrderCreated(bytes32 indexed orderId, address indexed maker, ...);
event OrderFilled(bytes32 indexed orderId, uint256 filledAmount, uint256 timestamp);
event OrderCancelled(bytes32 indexed orderId, uint256 refundAmount, uint256 timestamp);
event OrderExpired(bytes32 indexed orderId, uint256 timestamp);
event CrossChainOrderCreated(bytes32 indexed orderId, uint256 targetChainId, uint256 timestamp);
```

### External Functions
```solidity
function createOrder(...) external returns (bytes32);
function cancelOrder(bytes32 orderId) external;
function updateOrderStatus(bytes32 orderId, OrderStatus status) external;
function updateOrderFill(bytes32 orderId, uint256 newFilledAmount) external;
function expireOrders() external;
function setWalletSwapMain(address _wsm) external; // onlyOwner
function removeFromPairIndex(bytes32 orderId) external;

// View Functions
function getOrder(bytes32 orderId) external view returns (Order memory);
function findMatchingOrder(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut) external view returns (bytes32);
function orderIds(uint256 index) external view returns (bytes32);
function ordersByPair(address tokenIn, address tokenOut, uint256 index) external view returns (bytes32);
```

---

## TrustWalletFeeDistributor.sol

### Events
```solidity
event FeeDistributed(address indexed token, address indexed from, uint256 amount, uint256 timestamp);
event TrustWalletUpdated(address indexed oldWallet, address indexed newWallet);
event DebtCovered(address indexed reactiveContract, address indexed token, uint256 amount, uint256 timestamp);
event ContractRegistered(address indexed contractAddress, bool registered);
```

### External Functions
```solidity
function distributeFee(
    address token, 
    AssetType assetType, 
    uint256 amount, 
    uint256 minutesValue, 
    address from, 
    bytes32 orderId
) external payable;

function calculateFee(
    address token, 
    AssetType assetType, 
    uint256 amount, 
    uint256 minutesValue
) external view returns (uint256);

function withdrawFees(address token) external; // onlyOwner
function setTrustWallet(address _wallet) external; // onlyOwner
function setMinimumFee(uint256 _minFee) external; // onlyOwner
function registerReactiveContract(address _contract) external;
function coverReactiveDebt(address reactiveContract, address token) external;
function getAccumulatedFees(address token) external view returns (uint256);
```

---

## VirtualLiquidityPool.sol

### Events
```solidity
event LiquidityUpdated(address indexed tokenA, address indexed tokenB, uint256 totalLiquidity, uint256 timestamp);
```

### External Functions
```solidity
function addLiquidity(address tokenA, address tokenB, uint256 amount) external;
function removeLiquidity(address tokenA, address tokenB, uint256 amount) external;
function getLiquidity(address tokenA, address tokenB) external view returns (uint256);
function getImpliedPrice(address tokenA, address tokenB) external view returns (int256);
function setLambdaDecay(uint256 _lambda) external; // onlyOwner
```

---

## AssetVerifier.sol

### Events
```solidity
event AssetVerified(bytes32 indexed verificationId, address indexed token, address indexed owner, uint256 amount);
event VerificationInvalidated(bytes32 indexed verificationId);
```

### External Functions
```solidity
function verifyToken(address token, address owner, uint256 amount) external returns (bytes32);
function verifyNft(address token, address owner, uint256 tokenId) external returns (bytes32);
function checkVerification(bytes32 verificationId) external view returns (bool);
function invalidateVerification(bytes32 verificationId) external;
function getVerificationDetails(bytes32 id) external view returns (...);
```

---

## SwapMatcherRSCv3.sol

### Events
```solidity
event MatchFound(bytes32 indexed orderA, bytes32 indexed orderB, uint256 timestamp);
event OrderStored(bytes32 indexed orderId, uint256 chainId, address tokenIn, address tokenOut);
event ReactCalled(uint256 chainId, uint256 topic0, uint256 blockNumber);
```

### External Functions
```solidity
function react(LogRecord calldata log) external; // vmOnly
function manualSubscribe(uint256 chainId, address contractAddr) external; // onlyOwner
function getOrderCount(uint256 chainId, address tIn, address tOut) external view returns (uint256);
function getOrder(uint256 chainId, address tIn, address tOut, uint256 index) external view returns (Order memory);
```

---

*Interfaces Reference v1.0 - 2026-01-28*
