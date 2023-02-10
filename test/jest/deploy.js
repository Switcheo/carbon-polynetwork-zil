const { TransactionError } = require("@zilliqa-js/core");
const { getAddressFromPrivateKey } = require("@zilliqa-js/crypto");
const { getDeployTx, getZilliqaInstance, param, ZERO_ADDRESS, sendTxs } = require("./utils");

const verifyDeployment = (tx) => {
  // Check for txn execution success
  if (!tx.txParams.receipt.success) {
    const errors = tx.txParams.receipt.errors
    const errMsgs = errors
      ? Object.keys(errors).reduce((acc, depth) => {
        const errorMsgList = errors[depth].map(num => TransactionError[num])
        return { ...acc, [depth]: errorMsgList }
      }, {})
      : 'failed to deploy contract!'
    throw new Error(JSON.stringify(errMsgs, null, 2))
  }
}

const deployCCM = async (privateKey, { chainId, ccmProxyAddress }) => {
  const address = getAddressFromPrivateKey(privateKey).toLowerCase();
  const zilliqa = getZilliqaInstance(privateKey);

  const deployTx = await getDeployTx(zilliqa, "contracts/MockZilCrossChainManager.scilla", [
    param("_scilla_version", "Uint32", "0"),
    param("this_chain_id", "Uint64", chainId),
    param("init_proxy_address", "ByStr20", ccmProxyAddress),
    param("init_admin", "ByStr20", address),
  ]);

  const [confirmedDeployTx] = await sendTxs(privateKey, [deployTx]);
  verifyDeployment(confirmedDeployTx);

  const { result: contractAddress } = await zilliqa.blockchain.getContractAddressFromTransactionID(confirmedDeployTx.id);
  return [zilliqa.contracts.at(contractAddress), confirmedDeployTx]
};

const deployCCMProxy = async (privateKey, { ccmAddress }) => {
  const address = getAddressFromPrivateKey(privateKey).toLowerCase();
  const zilliqa = getZilliqaInstance(privateKey);

  const deployTx = await getDeployTx(zilliqa, "contracts/ZilCrossChainManagerProxy.scilla", [
    param("_scilla_version", "Uint32", "0"),
    param("init_crosschain_manager", "ByStr20", ccmAddress),
    param("init_admin", "ByStr20", address),
  ]);

  const [confirmedDeployTx] = await sendTxs(privateKey, [deployTx]);
  verifyDeployment(confirmedDeployTx);

  const { result: contractAddress } = await zilliqa.blockchain.getContractAddressFromTransactionID(confirmedDeployTx.id);
  return [zilliqa.contracts.at(contractAddress), confirmedDeployTx]
};

const deployZRC2Token = async (privateKey, {
  name = "ZRC2 Token", symbol = "TKN",
  decimals = "12", initSupply = "0",
} = {}) => {
  const address = getAddressFromPrivateKey(privateKey).toLowerCase();
  const zilliqa = getZilliqaInstance(privateKey);

  const deployTx = await getDeployTx(zilliqa, "contracts/FungibleToken.scilla", [
    param("_scilla_version", "Uint32", "0"),
    param("contract_owner", "ByStr20", address),
    param("name", "String", name),
    param("symbol", "String", symbol),
    param("decimals", "Uint32", decimals),
    param("init_supply", "Uint128", initSupply),
  ]);

  const [confirmedDeployTx] = await sendTxs(privateKey, [deployTx]);
  verifyDeployment(confirmedDeployTx);

  const { result: contractAddress } = await zilliqa.blockchain.getContractAddressFromTransactionID(confirmedDeployTx.id);
  return [zilliqa.contracts.at(contractAddress), confirmedDeployTx]
};

const deployLockProxy = async (privateKey, { ccmAddress, ccmProxyAddress, counterpartChainId }) => {
  const address = getAddressFromPrivateKey(privateKey).toLowerCase();
  const zilliqa = getZilliqaInstance(privateKey);

  const deployTx = await getDeployTx(zilliqa, "contracts/LockProxySwitcheo.scilla", [
    param("_scilla_version", "Uint32", "0"),
    param("init_admin", "ByStr20", address),
    param("init_manager_proxy", "ByStr20", ccmProxyAddress),
    param("init_manager", "ByStr20", ccmAddress),
    param("init_counterpart_chainId", "Uint64", counterpartChainId),
  ]);

  const [confirmedDeployTx] = await sendTxs(privateKey, [deployTx]);
  verifyDeployment(confirmedDeployTx);

  const { result: contractAddress } = await zilliqa.blockchain.getContractAddressFromTransactionID(confirmedDeployTx.id);
  return [zilliqa.contracts.at(contractAddress), confirmedDeployTx]
};

const deployBridgeEntrance = async (privateKey, { lockProxyAddress }) => {
  const address = getAddressFromPrivateKey(privateKey).toLowerCase();
  const zilliqa = getZilliqaInstance(privateKey);

  const deployTx = await getDeployTx(zilliqa, "contracts/BridgeEntrance.scilla", [
    param("_scilla_version", "Uint32", "0"),
    param("init_admin", "ByStr20", address),
    param("init_lock_proxy", "ByStr20", lockProxyAddress),
  ]);

  const [confirmedDeployTx] = await sendTxs(privateKey, [deployTx]);
  verifyDeployment(confirmedDeployTx);

  const { result: contractAddress } = await zilliqa.blockchain.getContractAddressFromTransactionID(confirmedDeployTx.id);
  return [zilliqa.contracts.at(contractAddress), confirmedDeployTx]
};

module.exports = {
  deployCCM,
  deployCCMProxy,
  deployLockProxy,
  deployBridgeEntrance,
  deployZRC2Token,
};
