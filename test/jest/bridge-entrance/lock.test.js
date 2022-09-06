const elliptic = require("elliptic");
const { deployCCMProxy, deployCCM, deployLockProxy, deployBridgeEntrance, deployZRC2Token } = require("../deploy");
const { getDefaultAccount, nextBlock, ZERO_ADDRESS, callContract, param, createRandomAccount, getUnencodedPubKey, serializeHeader, getBookKeeper, serializeRegisterAssetTxArgs } = require("../utils");

const chainId = "18";
const counterpartChainId = "5";

const ZIL_ASSET_HASH = "zil_asset";
const ZRC2_ASSET_HASH = "zrc2_asset";

let key, owner;
let ccmContract, ccmAddress;
let ccmProxyContract, ccmProxyAddress;
let lockProxyContract, lockProxyAddress;
let bridgeEntranceContract, bridgeEntranceAddress;
beforeAll(async () => {
  const acc = getDefaultAccount();
  owner = acc.address.toLowerCase();
  key = acc.key;

  await nextBlock();

  [ccmProxyContract] = await deployCCMProxy(key, { ccmAddress: ZERO_ADDRESS });
  ccmProxyAddress = ccmProxyContract.address.toLowerCase();

  [ccmContract] = await deployCCM(key, { chainId, ccmProxyAddress });
  ccmAddress = ccmContract.address.toLowerCase();

  await callContract(key, ccmProxyContract, "UpgradeTo", [param("new_crosschain_manager", "ByStr20", ccmAddress)]);
  await callContract(key, ccmProxyContract, "UnPause");

  [lockProxyContract] = await deployLockProxy(key, { ccmAddress, ccmProxyAddress, counterpartChainId });
  lockProxyAddress = lockProxyContract.address.toLowerCase();

  [bridgeEntranceContract] = await deployBridgeEntrance(key, { lockProxyAddress });
  bridgeEntranceAddress = bridgeEntranceContract.address.toLowerCase();

  await callContract(key, ccmProxyContract, "PopulateOperators", [
    param("addr", "ByStr20", owner),
  ]);
});

test('call BridgeEntrance.lock with native $ZIL successfully', async () => {
  await callContract(key, ccmProxyContract, "PopulateWhiteListFromContract", [
    param("addr", "ByStr20", bridgeEntranceAddress),
  ]);

  await callContract(key, lockProxyContract, "UnPause");
  await callContract(key, ccmContract, "mockTx", [
    param("recipient", "ByStr20", lockProxyAddress),
    param("method", "String", "registerAsset"),
    param("args", "ByStr", serializeRegisterAssetTxArgs({ assetHash: ZIL_ASSET_HASH, nativeAssetHash: ZERO_ADDRESS })),
    param("fromContractAddr", "ByStr", ZERO_ADDRESS),
    param("fromChainId", "Uint64", counterpartChainId),
  ]);

  await callContract(key, bridgeEntranceContract, "Lock", [
    param("tokenAddr", "ByStr20", ZERO_ADDRESS),
    param("targetProxyHash", "ByStr", ZERO_ADDRESS),
    param("recoveryAddress", "ByStr", ZERO_ADDRESS),
    param("fromAssetDenom", "ByStr", "0x" + Buffer.from(ZIL_ASSET_HASH, "utf8").toString("hex")),
    param("withdrawFeeAddress", "ByStr", ZERO_ADDRESS),
    param("toAddress", "ByStr", ZERO_ADDRESS),
    param("toAssetDenom", "ByStr", ZERO_ADDRESS),
    param("amount", "Uint256", "100"),
    param("withdrawFeeAmount", "Uint256", "10"),
  ], { amount: "100" });
});

test('call BridgeEntrance.lock with ZRC2 successfully', async () => {
  const [tokenContract] = await deployZRC2Token(key);
  const tokenAddress = tokenContract.address.toLowerCase();

  await callContract(key, ccmProxyContract, "PopulateWhiteListFromContract", [
    param("addr", "ByStr20", lockProxyAddress),
  ]);
  await callContract(key, ccmProxyContract, "PopulateWhiteListFromContract", [
    param("addr", "ByStr20", bridgeEntranceAddress),
  ]);

  await callContract(key, lockProxyContract, "UnPause");
  await callContract(key, ccmContract, "mockTx", [
    param("recipient", "ByStr20", lockProxyAddress),
    param("method", "String", "registerAsset"),
    param("args", "ByStr", serializeRegisterAssetTxArgs({ assetHash: ZRC2_ASSET_HASH, nativeAssetHash: tokenAddress })),
    param("fromContractAddr", "ByStr", ZERO_ADDRESS),
    param("fromChainId", "Uint64", counterpartChainId),
  ]);

  await callContract(key, tokenContract, "Mint", [
    param("recipient", "ByStr20", owner),
    param("amount", "Uint128", "100000"),
  ]);

  await callContract(key, tokenContract, "IncreaseAllowance", [
    param("spender", "ByStr20", bridgeEntranceAddress),
    param("amount", "Uint128", "1000"),
  ]);

  await callContract(key, bridgeEntranceContract, "Lock", [
    param("tokenAddr", "ByStr20", tokenAddress),
    param("targetProxyHash", "ByStr", ZERO_ADDRESS),
    param("recoveryAddress", "ByStr", ZERO_ADDRESS),
    param("fromAssetDenom", "ByStr", "0x" + Buffer.from(ZRC2_ASSET_HASH, "utf8").toString("hex")),
    param("withdrawFeeAddress", "ByStr", ZERO_ADDRESS),
    param("toAddress", "ByStr", ZERO_ADDRESS),
    param("toAssetDenom", "ByStr", ZERO_ADDRESS),
    param("amount", "Uint256", "100"),
    param("withdrawFeeAmount", "Uint256", "10"),
  ]);
});
