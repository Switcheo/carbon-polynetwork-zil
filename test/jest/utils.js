require("dotenv").config();
const elliptic = require("elliptic");
const secp256k1 = new elliptic.ec("secp256k1");
const fs = require("fs");
const { getAddressFromPrivateKey, getPubKeyFromPrivateKey, schnorr } = require("@zilliqa-js/crypto");
const { TxStatus, Transaction } = require("@zilliqa-js/account");
const { Zilliqa, units, bytes, BN, Long } = require("@zilliqa-js/zilliqa");
const { default: BigNumber } = require("bignumber.js");
const { ripemd160, sha256 } = require("@ethersproject/sha2");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const getPrivateKey = (key = "PRIVATE_KEY") => {
  const privateKey = process.env[key];
  if (!privateKey || privateKey === '') {
    throw new Error(`private key not found:${key}`);
  }
  return privateKey;
}

const getDefaultAccount = () => {
  const key = getPrivateKey();
  const address = getAddressFromPrivateKey(key);
  return { key, address };
}

const getNetwork = () => {
  const network = (process.env.NETWORK || '').toLowerCase()
  switch (network) {
    case 'testnet':
    case 'mainnet':
      return network
    default:
      return 'localhost'
  }
}

const getRpcUrl = (network = getNetwork()) => {
  switch (network) {
    case "mainnet": return "https://api.zilliqa.com/"
    case "testnet": return "https://dev-api.zilliqa.com/"
    case "localhost": return "http://localhost:5555/"
    default: throw new Error(`invalid network:${network}`);
  }
}

const getChainId = (network = getNetwork()) => {
  switch (network) {
    case 'mainnet': return 1;
    case 'testnet': return 333;
    default: return 222;
  }
}

const getTxVersion = (network = getNetwork()) => {
  return bytes.pack(getChainId(network), 1);
}

const zilInstances = {};

const getZilliqaInstance = (privateKey) => {
  let address = "";

  if (privateKey) {
    address = getAddressFromPrivateKey(privateKey).toLowerCase();
  }

  const instance = zilInstances[address];
  if (instance) return instance;

  const rpcUrl = getRpcUrl();
  const zilliqa = new Zilliqa(rpcUrl);

  if (privateKey)
    zilliqa.wallet.addByPrivateKey(privateKey);

  zilInstances[address] = zilliqa;

  return zilliqa;
}

const sendTxs = async (privateKey, txList) => {
  const zilliqa = getZilliqaInstance(privateKey);
  const signedTxList = await zilliqa.wallet.signBatch(txList);

  // send batch transaction
  return await zilliqa.blockchain.createBatchTransaction(signedTxList);
}

const getUnencodedPubKey = (privateKey) => {
  return secp256k1.keyFromPrivate(privateKey, "hex").getPublic(false, "hex");
}

const transfer = async (privateKey, toAddr, amount) => {
  if (!privateKey || privateKey === '') {
    throw new Error('No private key was provided!')
  }
  const zilliqa = getZilliqaInstance(privateKey);
  const minGasPrice = await zilliqa.blockchain.getMinimumGasPrice()
  const tx = await zilliqa.blockchain.createTransaction(
    zilliqa.transactions.new({
      version: getTxVersion(),
      toAddr,
      amount: new BN(units.toQa(amount, units.Units.Zil)),
      gasPrice: new BN(minGasPrice.result),
      gasLimit: Long.fromNumber(80000),
    }, false),
  );

  await nextBlock()

  return tx
}

const createRandomAccount = async (privateKey, initAmount = '10000') => {
  const key = schnorr.generatePrivateKey()
  const address = getAddressFromPrivateKey(key)
  const pubKey = getPubKeyFromPrivateKey(key)

  if (initAmount != '0') await transfer(privateKey, address, initAmount)

  return { key, pubKey, address: address.toLowerCase() }
}

const getDeployTx = async (zilliqa, filepath, init, opts = {}) => {
  let gasPrice = opts.gasPrice;
  if (!gasPrice) {
    const minGasPrice = await zilliqa.blockchain.getMinimumGasPrice()
    gasPrice = new BN(minGasPrice.result);
  }

  const codeBuffer = await fs.promises.readFile(filepath);
  const deployTx = new Transaction({
    version: getTxVersion(),
    toAddr: ZERO_ADDRESS,
    data: JSON.stringify(init),
    code: codeBuffer.toString(),
    amount: units.toQa(0, units.Units.Zil),
    gasPrice,
    gasLimit: Long.fromNumber(80000),
    nonce: opts.nonce,
  },
    zilliqa.provider,
    TxStatus.Initialised,
    false,
    false
  );

  return deployTx;
}

const getTransitionTx = async (zilliqa, contract, transition, params = [], opts = {}) => {
  let gasPrice = opts.gasPrice;
  if (!gasPrice) {
    const minGasPrice = await zilliqa.blockchain.getMinimumGasPrice()
    gasPrice = new BN(minGasPrice.result);
  }

  const newTx = new Transaction({
    version: getTxVersion(),
    toAddr: contract.address,
    data: JSON.stringify({
      _tag: transition,
      params,
    }),
    amount: new BN(opts.amount ?? 0),
    gasPrice: new BN(gasPrice),
    gasLimit: Long.fromNumber(80000),
    nonce: opts.nonce,
  },
    zilliqa.provider,
    TxStatus.Initialised,
    false,
    false
  );

  return newTx;
};

const callContract = async (privateKey, contract, transition, params, opts) => {
  const zilliqa = getZilliqaInstance(privateKey);
  const tx = await getTransitionTx(zilliqa, contract, transition, params, opts);

  const [txResult] = await sendTxs(privateKey, [tx]);
  return txResult;
};

const nextBlock = async (n = 1, network = getNetwork()) => {
  const zilliqa = getZilliqaInstance();
  if (network === 'localhost') {
    console.debug('Advancing block...')
    const response = await zilliqa.provider.send('IncreaseBlocknum', n);
    if (!response.result) {
      throw new Error(`Failed to advanced block! Error: ${JSON.stringify(response.error)}`)
    }
  }
}

const param = (vname, type, value) => {
  return { vname, type, value };
}

const noneParam = (address) => {
  return {
    constructor: `${address}.None`,
    argtypes: [],
    arguments: [],
  }
}

const hexNumeric = (number, bytes = 4) => {
  const length = bytes * 2;
  return ("0".repeat(length) + new BigNumber(number).toString(16)).substr(-length);
}

const varInt = (number) => {
  const bn = new BigNumber(number);
  if (bn.lt(0xFD)) {
    return Buffer.concat([Buffer.from(hexNumeric(bn, 1), "hex").reverse()]);
  } else if (bn.lte(0xFFFF)) {
    return Buffer.concat([Buffer.from([0xFD]), Buffer.from(hexNumeric(bn, 2), "hex").reverse()]);
  } else if (bn.lte(0xFFFFFFFF)) {
    return Buffer.concat([Buffer.from([0xFE]), Buffer.from(hexNumeric(bn, 4), "hex").reverse()]);
  } else {
    return Buffer.concat([Buffer.from([0xFF]), Buffer.from(hexNumeric(bn, 8), "hex").reverse()]);
  }
}


const getBookKeeper = (pubkeys) => {
  const n = pubkeys.length;
  const m = ~~(n - ((n - 1) / 3));

  const buff = Buffer.concat([
    Buffer.from(hexNumeric(n, 2), "hex").reverse(),
    Buffer.concat(pubkeys.map(_pubkey => {
      const pubkey = Buffer.from(_pubkey, "hex");
      const lastByteEven = pubkey.subarray(-1)[0] % 2 === 0;
      const pkBytes = pubkey.subarray(0, 35);
      pkBytes[2] = lastByteEven ? 0x02 : 0x03;
      const varIntBytes = varInt(pkBytes.length);
      return Buffer.concat([varIntBytes, pkBytes]);
    })),
    Buffer.from(hexNumeric(m, 2), "hex").reverse(),
  ]);

  return ripemd160(sha256(buff));
};

const serializeRegisterAssetTxArgs = ({
  assetHash,
  nativeAssetHash,
}) => {
  const bufAssetHash = Buffer.from(assetHash, "utf8");
  const lenAssetHash = varInt(bufAssetHash.length);
  const bufNativeAssetHash = Buffer.from(nativeAssetHash.replace(/^0x/i, ""), "hex");
  const lenNativeAssetHash = varInt(bufNativeAssetHash.length);

  return "0x" + Buffer.concat([
    lenAssetHash,
    bufAssetHash,
    lenNativeAssetHash,
    bufNativeAssetHash,
  ]).toString("hex");
};

const serializeHeader = ({
  version, chainId,
  prevBlockHash,
  transactionsRoot,
  crossStatesRoot,
  blockRoot,
  timestamp,
  height,
  consensusData,
  consensusPayload,
  nextBookkeeper,
}) => {

  const bufConsensusPayload = Buffer.from(consensusPayload.replace(/^0x/i, ""), "hex");
  const consensusPayloadLength = bufConsensusPayload.length;
  const varIntBytes = varInt(consensusPayloadLength);

  // console.log([
  //   "v: " + Buffer.from(hexNumeric(version, 4), "hex").reverse().toString("hex"),
  //   "c: " + Buffer.from(hexNumeric(chainId, 8), "hex").reverse().toString("hex"),
  //   "p: " + Buffer.from(prevBlockHash.replace(/^0x/i, ""), "hex").toString("hex"),
  //   "t: " + Buffer.from(transactionsRoot.replace(/^0x/i, ""), "hex").toString("hex"),
  //   "c: " + Buffer.from(crossStatesRoot.replace(/^0x/i, ""), "hex").toString("hex"),
  //   "b: " + Buffer.from(blockRoot.replace(/^0x/i, ""), "hex").toString("hex"),
  //   "t: " + Buffer.from(hexNumeric(timestamp, 4), "hex").reverse().toString("hex"),
  //   "h: " + Buffer.from(hexNumeric(height, 4), "hex").reverse().toString("hex"),
  //   "c: " + Buffer.from(hexNumeric(consensusData, 8), "hex").reverse().toString("hex"),
  //   "i: " + id.toString("hex"),
  //   "l: " + lengthByte.toString("hex"),
  //   "p: " + Buffer.from(consensusPayload.replace(/^0x/i, ""), "hex").toString("hex"),
  //   "b: " + Buffer.from(nextBookkeeper.replace(/^0x/i, ""), "hex").toString("hex"),
  // ].join("\n"))

  return "0x" + Buffer.concat([
    Buffer.from(hexNumeric(version, 4), "hex").reverse(),
    Buffer.from(hexNumeric(chainId, 8), "hex").reverse(),
    Buffer.from(prevBlockHash.replace(/^0x/i, ""), "hex"),
    Buffer.from(transactionsRoot.replace(/^0x/i, ""), "hex"),
    Buffer.from(crossStatesRoot.replace(/^0x/i, ""), "hex"),
    Buffer.from(blockRoot.replace(/^0x/i, ""), "hex"),
    Buffer.from(hexNumeric(timestamp, 4), "hex").reverse(),
    Buffer.from(hexNumeric(height, 4), "hex").reverse(),
    Buffer.from(hexNumeric(consensusData, 8), "hex").reverse(),
    varIntBytes,
    bufConsensusPayload,
    Buffer.from(nextBookkeeper.replace(/^0x/i, ""), "hex"),
  ]).toString("hex") + "0000";
};

module.exports = {
  ZERO_ADDRESS,

  getZilliqaInstance,
  getDefaultAccount,
  getTxVersion,
  getRpcUrl,
  getDeployTx,
  getTransitionTx,
  getPrivateKey,
  getUnencodedPubKey,
  getBookKeeper,

  createRandomAccount,
  transfer,
  sendTxs,
  callContract,
  nextBlock,

  param,
  noneParam,
  serializeHeader,
  serializeRegisterAssetTxArgs,
};
