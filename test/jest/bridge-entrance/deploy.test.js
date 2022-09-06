const { deployCCMProxy, deployCCM, deployLockProxy, deployBridgeEntrance } = require("../deploy");
const { getDefaultAccount, nextBlock, ZERO_ADDRESS, callContract, param } = require("../utils");

const chainId = "1";
const counterpartChainId = "5";

let key, owner;
let ccmContract, ccmAddress;
let ccmProxyContract, ccmProxyAddress;
let lockProxyContract, lockProxyAddress;
beforeAll(async () => {
  const acc = getDefaultAccount();
  owner = acc.address.toLowerCase();
  key = acc.key;

  await nextBlock();

  [ccmProxyContract] = await deployCCMProxy(key, { ccmAddress: ZERO_ADDRESS });
  ccmProxyAddress = ccmProxyContract.address.toLowerCase();

  [ccmContract] = await deployCCM(key, { chainId, ccmProxyAddress });
  ccmAddress = ccmContract.address.toLowerCase();

  await callContract(key, ccmProxyContract, "UpgradeTo", [
    param("new_crosschain_manager", "ByStr20", ccmAddress),
  ]);

  [lockProxyContract] = await deployLockProxy(key, { ccmAddress, ccmProxyAddress, counterpartChainId });
  lockProxyAddress = lockProxyContract.address.toLowerCase();
});

// test success
test('deploy BridgeEntrance successfully', async () => {
  const [contract] = await deployBridgeEntrance(key, { lockProxyAddress });
  expect(contract.address).toBeDefined();

  const state = await contract.getState();
  expect(state).toEqual({
    "_balance": "0",
    "current_admin": {
      "argtypes": ["ByStr20"],
      "arguments": [owner],
      "constructor": "Some",
    },
    "lock_proxy": lockProxyAddress,
    "paused": {
      "argtypes": [],
      "arguments": [],
      "constructor": "False",
    },
    "pending_admin": {
      "argtypes": ["ByStr20"],
      "arguments": [],
      "constructor": "None",
    },
  });
});
