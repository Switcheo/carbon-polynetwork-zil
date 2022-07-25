# Zilliqa cross chain smart contract

# Table of Content

- [Overview](#overview)
- [ZilCrossChainManager Contract Specification](#zilcrosschainmanager-contract-specification)
  * [Roles and Privileges](#roles-and-privileges)
  * [Data Types](#data-types)
  * [Immutable Parameters](#immutable-parameters)
  * [Mutable Fields](#mutable-fields)
  * [Transitions](#transitions)
    + [Housekeeping Transitions](#housekeeping-transitions)
    + [Crosschain Transitions](#crosschain-transitions)
    + [Upgrading Transitions](#upgrading-transitions)
- [ZilCrossChainManagerProxy Contract Specification](#zilcrosschainmanagerproxy-contract-specification)
  * [Roles and Privileges](#roles-and-privileges)
  * [Immutable Parameters](#immutable-parameters)
  * [Mutable Fields](#mutable-fields)
  * [Transitions](#transitions)
    + [Housekeeping Transitions](#housekeeping-transitions)
    + [Relay Transitions](#relay-transitions)
- [LockProxy Contract Specification](#lockproxy-contract-specification)
  * [Roles and Privileges](#roles-and-privileges)
  * [Immutable Parameters](#immutable-parameters)
  * [Mutable Fields](#mutable-fields)
  * [Transitions](#transitions)
- [LockProxySwitcheo Contract Specification](#lockproxyswitcheo-contract-specification)
  * [Roles and Privileges](#roles-and-privileges)
  * [Data Types](#data-types)
  * [Immutable Parameters](#immutable-parameters)
  * [Mutable Fields](#mutable-fields)
  * [Transitions](#transitions)
    + [Housekeeping Transitions](#housekeeping-transitions)
    + [Bridge Transitions](#bridge-transitions)
    + [Admin Transitions](#admin-transitions)
- [BridgeEntrace Contract Specification](#)
  * [Roles and Privileges](#roles-and-privileges)
  * [Immutable Parameters](#immutable-parameters)
  * [Mutable Fields](#mutable-fields)
  * [Transitions](#transitions)
- [Multi-signature Wallet Contract Specification](#multi-sigature)
  * [General Flow](#general-flow)
  * [Roles and Privileges](#roles-and-privileges-2)
  * [Immutable Parameters](#immutable-parameters-2)
  * [Mutable Fields](#mutable-fields-2)
  * [Transitions](#transitions-2)
    + [Submit Transitions](#submit-transitions)
    + [Action Transitions](#action-transitions)
- [SwitcheoTokenZRC2 Contract Specification](#switcheotokenzrc2-contract-specification)
- [More on cross chain infrastructure](#more-on-cross-chain-infrastructure)

# Overview

The table blow summarizes the purpose of the contracts that polynetwork will use:

| Contract Name | File and Location | Description |
|--|--| --|
|ZilCrossChainManager| [`ZilCrossChainManager.scilla`](./contracts/ZilCrossChainManager.scilla)  | The main contract that keeps track of the book keepers of Poly chain, push cross chain transaction event to relayer and execute the cross chain transaction from Poly chain to Zilliqa.|
|ZilCrossChainManagerProxy| [`ZilCrossChainManagerProxy.scilla`](./contracts/ZilCrossChainManagerProxy.scilla)  | A proxy contract that sits on top of the ZilCrossChainManager contract. Any call to the `ZilCrossChainManager` contract must come from `ZilCrossChainManagerProxy`. This contract facilitates upgradeability of the `ZilCrossChainManager` contract in case a bug is found.|
|LockProxy| [`LockProxy.scilla`](./old_contracts/LockProxy.scilla)  | A application contract that allows people to lock ZRC2 tokens and native zils to get corresponding tokens in target chain (e.g. ERC20 in ethereum) and vise versa.|
|LockProxySwitcheo| [`LockProxySwitcheo.scilla`](./contracts/LockProxySwitcheo.scilla)  | A Switcheo version contract that allows cross chain mananger to register assets, as well as allowing people to lock ZRC2 and native zils to get corresponding tokens in target chain (e.g. ERC20 in ethereum) and vise versa. |
|CCMMultisigWallet| [`CCMMultisigWallet.scilla`](./contracts/CCMMultisigWallet.scilla) | A multisig wallet that should be controlling crosss chain manager contract. |
|LockProxySwitcheoMultisigWallet| [`LockProxySwitcheoMultisigWallet.scilla`](./contracts/LockProxySwitcheoMultisigWallet.scilla) | A multisig wallet that should be controlling swticheo LockProxy contract. |
|SwitcheoTokenZRC2| [`SwitcheoTokenZRC2.scilla`](./contracts/SwitcheoTokenZRC2.scilla) | A Switcheo version of ZRC2 token contract. |


# ZilCrossChainManager Contract Specification

The `ZilCrossChainManager` contract is the main contract of the cross chain infrastructure between Zilliqa and Poly chain.

## Roles and Privileges

The table below describes the roles and privileges that this contract defines:

| Role | Description & Privileges|                                    
| --------------- | ------------------------------------------------- |
| `admin`         | The administrator of the contract.  `admin` is a multisig wallet contract (i.e., an instance of `Wallet`).    |
| `book keepers`         | Book keepers of Poly chain which can submit cross chain transactions from Poly chain to Zilliqa|

## Data Types

The contract defines and uses several custom ADTs that we describe below:

1. Error Data Type:

```ocaml
type Error =
  | ContractFrozenFailure
  | ConPubKeysAlreadyInitialized
  | ErrorDeserializeHeader
  | NextBookersIllegal
  | SignatureVerificationFailed
  | HeaderLowerOrBookKeeperEmpty
  | InvalidMerkleProof
  | IncorrectMerkleProof
  | MerkleProofDeserializeFailed
  | AddressFormatMismatch
  | WrongTransaction
  | TransactionAlreadyExecuted
  | TransactionHashInvalid
  | AdminValidationFailed
  | ProxyValidationFailed
  | StagingAdminValidationFailed
  | StagingAdminNotExist
  | InvalidFromContract
  | InvalidToContract
  | InvalidMethod
```

## Immutable Parameters

The table below lists the parameters that are defined at the contract deployment time and hence cannot be changed later on.

| Name | Type | Description |                                    
| ---------------      | ----------|-                                         |
| `this_chain_id`         | `Uint64` | The identifier of Zilliqa in Poly Chain. |
| `init_proxy_address` | `ByStr20` | The initial address of the `ZilCrossChainManagerProxy` contract.  |
| `init_admin`  | `ByStr20` |  The initial admin of the contract.  |

## Mutable Fields

The table below presents the mutable fields of the contract and their initial values. 

| Name        | Type       | Initial Value                           | Description                                        |
| ----------- | --------------------|--------------- | -------------------------------------------------- |
|`paused` | `ByStr20` | `True` | A flag to record the paused status of the contract. Certain transitions in the contract cannot be invoked when the contract is paused. |
| `conKeepersPublicKeyList` | `List ByStr20` |  `Nil {ByStr20}` | List of public key of consensus book Keepers. |
| `curEpochStartHeight` | `Uint32` |  `Uint32 0` | Current Epoch Start Height of Poly chain block. |
| `zilToPolyTxHashMap` | `Map Uint256 ByStr32` |  `Emp Uint256 ByStr32` | A map records transactions from Zilliqa to Poly chain. |
| `zilToPolyTxHashIndex` | `Uint256` |  `Uint256 0` | Record the length of aboving map. |
| `fromChainTxExist` | `Map Uint64 (Map ByStr32 Unit)` |  `Emp Uint64 (Map ByStr32 Unit)` |Record the from chain txs that have been processed. |
| `contractadmin` | `ByStr20` |  `init_admin` | Address of the administrator of this contract. |
| `stagingcontractadmin` | `Option ByStr20` |  `None {ByStr20}` | Address of the staging administrator of this contract. |
| `whiteListFromContract` | `Map ByStr20 Bool` |  `Emp ByStr20 Bool` | Map of whitelisted contract address that this contract can be called from. |
| `whiteListToContract` | `Map ByStr20 Bool` |  `Emp ByStr20 Bool` | Map of whitelisted contract address that this contract can call to. |
| `whiteListMethod` | `Map String Bool` |  `Emp ByStr20 Bool` | Map of whitelisted transition name that this contract can call. |


## Transitions 

Note that some of the transitions in the `ZilCrossChainManager` contract takes `initiator` as a parameter which as explained above is the caller that calls the `ZilCrossChainManagerProxy` contract which in turn calls the `ZilCrossChainManager` contract. 

> Note: No transition in the `ZilCrossChainManager` contract can be invoked directly. Any call to the `ZilCrossChainManager` contract must come from the `ZilCrossChainManagerProxy` contract.

All the transitions in the contract can be categorized into three categories:

* **Housekeeping Transitions:** Meant to facilitate basic admin-related tasks.
* **Crosschain Transitions:** The transitions that related to cross chain tasks.

### Housekeeping Transitions

| Name        | Params     | Description | Callable when paused? | Callable when not paused? | 
| ----------- | -----------|-------------|:--------------------------:|:--------------------------:|
| `Pause` | `initiator: ByStr20`| Pause the contract temporarily to stop any critical transition from being invoked. <br>  :warning: **Note:** `initiator` must be the current `contractadmin` of the contract.  | :heavy_check_mark: | :heavy_check_mark: |
| `Unpause` | `initiator: ByStr20`| Un-pause the contract to re-allow the invocation of all transitions. <br>  :warning: **Note:** `initiator` must be the current `contractadmin` of the contract.  | :heavy_check_mark: | :heavy_check_mark: |
| `UpdateAdmin` | `newAdmin: ByStr20, initiator: ByStr20` | Set a new `stagingcontractadmin` by `newAdmin`. <br>  :warning: **Note:** `initiator` must be the current `contractadmin` of the contract.| :heavy_check_mark: | :heavy_check_mark: |
| `ClaimAdmin` | ` initiator: ByStr20` | Claim to be new `contract admin`. <br>  :warning: **Note:** `initiator` must be the current `stagingcontractadmin` of the contract.| :heavy_check_mark: | :heavy_check_mark: 

### Crosschain Transitions

| Name        | Params     | Description | Callable when paused? | Callable when not paused? | 
| ----------- | -----------|-------------|:--------------------------:|:--------------------------:|
| `InitGenesisBlock` | `rawHeader: ByStr, pubkeys: List Pubkey`| Sync Poly chain genesis block header to smart contrat. | <center>:x:</center> | :heavy_check_mark: |
| `ChangeBookKeeper` | `rawHeader: ByStr, pubkeys: List Pubkey, sigList: List Signature`| Change Poly chain consensus book keeper. | <center>:x:</center> | :heavy_check_mark: |
| `CrossChain` | `toChainId: Uint64, toContract: ByStr, method: ByStr, txData: ByStr`| ZRC2 token cross chain to other blockchain. this function push tx event to blockchain. | <center>:x:</center> | :heavy_check_mark: |
| `VerifyHeaderAndExecuteTx` | `proof: Proof, rawHeader: ByStr, headerProof: Proof, curRawHeader: ByStr, headerSig: List Signature`| Verify Poly chain header and proof, execute the cross chain tx  from Poly chain to Zilliqa. | <center>:x:</center> | :heavy_check_mark: |

### Upgrading Transitions

| Name        | Params     | Description | Callable when paused? | Callable when not paused? | 
| ----------- | -----------|-------------|:--------------------------:|:--------------------------:|
| `PopulateWhiteListFromContract` | `addr: ByStr20, val: Bool, initiator: ByStr20`| Populate map whiteListFromContract after upgrading. | :heavy_check_mark: | :heavy_check_mark: |
| `PopulateWhiteListToContract` | `addr: ByStr20, val: Bool, initiator: ByStr20`| Populate map whiteListToContract after upgrading. | :heavy_check_mark: | :heavy_check_mark: |
| `PopulateWhiteListMethod` | `method: String, val: Bool, initiator: ByStr20`| Populate map whiteListMethod after upgrading. | :heavy_check_mark: | :heavy_check_mark: |
| `PopulateConKeepersPublicKeyList` | `keepers: List ByStr20, initiator: ByStr20`| Populate list conKeepersPublicKeyList after upgrading. | :heavy_check_mark: | :heavy_check_mark: |
| `PopulateCurEpochStartHeight` | `height: Uint32, initiator: ByStr20`| Populate field curEpochStartHeight after upgrading. | :heavy_check_mark: | :heavy_check_mark: |
| `PopulateZilToPolyTxHashMap` | `index: Uint256, val: ByStr32, initiator: ByStr20`| Populate map zilToPolyTxHashMap after upgrading. | :heavy_check_mark: | :heavy_check_mark: |
| `PopulateZilToPolyTxHashIndex` | `index: Uint256, initiator: ByStr20`| Populate field PopulateZilToPolyTxHashIndex after upgrading. | :heavy_check_mark: | :heavy_check_mark: |
| `PopulateFromChainTxExist` | `chainId: Uint64, txId: ByStr32, initiator: ByStr20`| Populate map fromChainTxExist after upgrading. | :heavy_check_mark: | :heavy_check_mark: |

# ZilCrossChainManagerProxy Contract Specification

`ZilCrossChainManagerProxy` contract is a relay contract that redirects calls to it to the `ZilCrossChainManager` contract.

## Roles and Privileges

The table below describes the roles and privileges that this contract defines:

| Role | Description & Privileges|                                    
| --------------- | ------------------------------------------------- |
| `init_admin`           | The initial admin of the contract which is usually the creator of the contract. `init_admin` is also the initial value of admin. |
| `admin`    | Current `admin` of the contract initialized to `init_admin`. Certain critical actions can only be performed by the `admin`, e.g., changing the current implementation of the `ZilCrossChainManager` contract. |
|`initiator` | The user who calls the `ZilCrossChainManagerProxy` contract that in turn calls the `ZilCrossChainManager` contract. |


## Immutable Parameters

The table below lists the parameters that are defined at the contract deployment time and hence cannot be changed later on.

| Name | Type | Description |
|--|--|--|
|`init_crosschain_manager`| `ByStr20` | The address of the `ZilCrossChainManager` contract. |
|`init_admin`| `ByStr20` | The address of the admin. |

## Mutable Fields

The table below presents the mutable fields of the contract and their initial values.

| Name | Type | Initial Value |Description |
|--|--|--|--|
|`crosschain_manager`| `ByStr20` | `init_crosschain_manager` | Address of the current implementation of the `ZilCrossChainManager` contract. |
|`admin`| `ByStr20` | `init_owner` | Current `admin` of the contract. |
|`stagingadmin`| `Option ByStr20` | `None {ByStr20}` | Staging `admin` of the contract. |

## Transitions

All the transitions in the contract can be categorized into two categories:
- **Housekeeping Transitions** meant to facilitate basic admin related tasks.
- **Relay Transitions** to redirect calls to the `ZilCrossChainManager` contract.

### Housekeeping Transitions

| Name | Params | Description |
|--|--|--|
|`UpgradeTo`| `new_crosschain_manager : ByStr20` |  Change the current implementation address of the `ZilCrossChainManager` contract. <br> :warning: **Note:** Only the `admin` can invoke this transition|
|`ChangeProxyAdmin`| `newAdmin : ByStr20` |  Change the current `stagingadmin` of the contract. <br> :warning: **Note:** Only the `admin` can invoke this transition.|
|`ClaimProxyAdmin` |  |  Change the current `admin` of the contract. <br> :warning: **Note:** Only the `stagingadmin` can invoke this transition.|

### Relay Transitions

These transitions are meant to redirect calls to the corresponding `ZilCrossChainManager`
contract. While redirecting, the contract may prepare the `initiator` value that
is the address of the caller of the `ZilCrossChainManagerProxy` contract. The signature of
transitions in the two contracts is exactly the same expect the added last
parameter `initiator` for the `ZilCrossChainManager` contract.

| Transition signature in the `ZilCrossChainManagerProxy` contract  | Target transition in the `ZilCrossChainManager` contract |
|--|--|
|`Pause()` | `Pause(initiator : ByStr20)` |
|`UnPause()` | `UnPause(initiator : ByStr20)` |
|`UpdateAdmin(newAdmin: ByStr20)` | `UpdateAdmin(admin: ByStr20, initiator : ByStr20)`|
|`ClaimAdmin()` | `ClaimAdmin(initiator : ByStr20)`|
|`InitGenesisBlock(rawHeader: ByStr, pubkeys: List Pubkey)` | `InitGenesisBlock(rawHeader: ByStr, pubkeys: List Pubkey)`|
|`ChangeBookKeeper(rawHeader: ByStr, pubkeys: List Pubkey, sigList: List Signature)` | `ChangeBookKeeper(rawHeader: ByStr, pubkeys: List Pubkey, sigList: List Signature)`|
| `CrossChain(toChainId: Uint64, toContract: ByStr, method: ByStr, txData: ByStr)` | ` CrossChain(toChainId: Uint64, toContract: ByStr, method: ByStr, txData: ByStr)`|
| `VerifyHeaderAndExecuteTx(proof: Proof, rawHeader: ByStr, headerProof: Proof, curRawHeader: ByStr, headerSig: List Signature)` | `VerifyHeaderAndExecuteTx(proof: Proof, rawHeader: ByStr, headerProof: Proof, curRawHeader: ByStr, headerSig: List Signature)`|
|`PopulateWhiteListFromContract(addr: ByStr20, val: Bool)` | `PopulateWhiteListFromContract(addr: ByStr20, val: Bool, initiator: ByStr20)` |
|`PopulateWhiteListToContract(addr: ByStr20, val: Bool)` | `PopulateWhiteListToContract(addr: ByStr20, val: Bool, initiator: ByStr20)`|
|`PopulateWhiteListMethod(method: String, val: Bool)` | `PopulateWhiteListMethod(method: String, val: Bool, initiator: ByStr20)`|
|`PopulateConKeepersPublicKeyList(keepers: List ByStr20)` | `PopulateConKeepersPublicKeyList(keepers: List ByStr20, initiator: ByStr20) `|
|`PopulateCurEpochStartHeight(height: Uint32)` | `PopulateCurEpochStartHeight(height: Uint32, initiator: ByStr20)` |
|`PopulateZilToPolyTxHashMap(index: Uint256, val: ByStr32)` | `PopulateZilToPolyTxHashMap(index: Uint256, val: ByStr32, initiator: ByStr20` |
|`PopulateZilToPolyTxHashIndex(index: Uint256)` | `PopulateZilToPolyTxHashIndex(index: Uint256, initiator: ByStr20)` |
|`PopulateFromChainTxExist(chainId: Uint64, txId: ByStr32)` | `PopulateFromChainTxExist(chainId: Uint64, txId: ByStr32, initiator: ByStr20)` |

# LockProxy Contract Specification

`LockProxy` is a contract that allows people to lock ZRC2 tokens and native zils to get corresponding tokens in target chain (e.g. ERC20 in ethereum) and vise versa.

## Roles and Privileges

The table below describes the roles and privileges that this contract defines:

| Role | Description & Privileges|                                    
| --------------- | ------------------------------------------------- |
| `init_admin`           | The initial admin of the contract which is usually the creator of the contract. `init_admin` is also the initial value of admin. |
| `admin`    | Current `admin` of the contract initialized to `init_admin`. Certain critical actions can only be performed by the `admin`. |
| `init_manager_proxy` | The initial cross chain manager proxy address. |
| `init_manager` | The initial cross chain manager address. |

## Immutable Parameters

The table below lists the parameters that are defined at the contract deployment time and hence cannot be changed later on.

| Name | Type | Description |
|--|--|--|
|`init_admin`| `ByStr20` | The address of the admin. |
|`init_manager_proxy`| `ByStr20` | The initial cross chain manager proxy address. |
|`init_manager`| `ByStr20` | The initial cross chain manager address. |

## Mutable Fields

The table below presents the mutable fields of the contract and their initial values.

| Name | Type | Initial Value |Description |
|--|--|--|--|
|`contractadmin`| `ByStr20` | `init_owner` | Current `admin` of the contract. |
|`manager`| `ByStr20` | `init_manager` | Address of the current `ZilCrossChainManager` contract. |
|`manager_proxy`| `ByStr20` | `init_manager_proxy` | Address of the current `ZilCrossChainManagerProxy` contract. |

## Transitions

| Name | Params | Description |
|--|--|--|
|`Lock`| `fromAssetHash: ByStr20, toChainId: Uint64, toAddress: ByStr, amount: Uint128` | Invoked by the user, a certin amount tokens will be locked in the proxy contract the invoker/msg.sender immediately, then the same amount of tokens will be unloked from target chain proxy contract at the target chain with chainId later.|
|`Unlock`| `txData: ByStr, fromContractAddr: ByStr, fromChainId: Uint64` | Invoked by the Zilliqa crosschain management contract, then mint a certin amount of tokens to the designated address since a certain amount was burnt from the source chain invoker.|

# LockProxySwitcheo Contract Specification

`LockProxySwitcheo` is a Switcheo version contract that allows people to lock ZRC2 tokens and native zils to get corresponding tokens in target chain (e.g. ERC20 in ethereum) and vise versa.

## Roles and Privileges

The table below describes the roles and privileges that this contract defines:

| Role | Description & Privileges|                                    
| --------------- | ------------------------------------------------- |
| `init_admin`           | The initial admin of the contract which is usually the creator of the contract. `init_admin` is also the initial value of admin. |
| `admin`    | Current `admin` of the contract initialized to `init_admin`. Certain critical actions can only be performed by the `admin`. |
| `init_manager_proxy` | The initial cross chain manager proxy address. |
| `init_manager` | The initial cross chain manager address. |


The contract defines and uses several custom ADTs that we describe below:

1. Error Data Type:

```ocaml
type Error = 
  | AdminValidationFailed
  | AmountCannotBeZero
  | LockAmountMismatch
  | ManagerValidationFailed
  | IllegalAmount
  | EmptyFromProxy
  | IllegalFromChainId
  | IllegalRegisterAssetArgs
  | AssetAlreadyRegistered
  | AssetNotRegistered
  | EmptyHashStr
  | InvalidFeeAmount
  | InvalidFromChainId
  | InvalidUnlockArgs
  | DeserializeRegisterAssetArgsFail
  | StagingAdminValidationFailed
  | StagingAdminNotExist
  | ContractPaused
  | ContractNotPaused
```

2. Cross-Chain Transaction Data Type:

```ocaml
(* toAssetHash, toAddress, amount *)
type TxArgs = 
| TxArgs of ByStr ByStr Uint256

(* used for corss-chain registerAsset method *)
(* assetHash, nativeAssetHash *)
type RegisterAssetTxArgs = 
| RegisterAssetTxArgs of ByStr ByStr

(* used for cross-chain lock and unlock methods *)
(* fromAssetHash toAssetHash toAddress fromAddress amount feeAmount feeAddress nonce *)
type TransferTxArgs =
| TransferTxArgs of ByStr ByStr ByStr ByStr Uint256 Uint256 ByStr Uint256
```


## Immutable Parameters

The table below lists the parameters that are defined at the contract deployment time and hence cannot be changed later on.

| Name | Type | Description |
|--|--|--|
|`init_admin`| `ByStr20` | The address of the admin. |
|`init_manager_proxy`| `ByStr20` | The initial cross chain manager proxy address. |
|`init_manager`| `ByStr20` | The initial cross chain manager address. |
|`init_counterpart_chainId`| `Uint64` | The initial counterpart chain id. |

## Mutable Fields

The table below presents the mutable fields of the contract and their initial values.

| Name | Type | Initial Value |Description |
|--|--|--|--|
|`contractadmin`| `ByStr20` | `init_owner` | Current `admin` of the contract. |
|`stagingcontractadmin`| `ByStr20` | `init_owner` | Current `admin` of the contract. |
|`manager`| `ByStr20` | `init_manager` | Address of the current `ZilCrossChainManager` contract. |
|`manager_proxy`| `ByStr20` | `init_manager_proxy` | Address of the current `ZilCrossChainManagerProxy` contract. |
|`counterpart_chainId`| `Uint64` | `init_counterpart_chainId` | The counterpart chain id. |

## Transitions

### Housekeeping Transitions

| Name        | Params     | Description | Callable when paused? | Callable when not paused? | 
| ----------- | -----------|-------------|:--------------------------:|:--------------------------:|
| `Pause` | | Pause the contract temporarily to stop any critical transition from being invoked. | :heavy_check_mark: | :heavy_check_mark: |
| `Unpause` | | Un-pause the contract to re-allow the invocation of all transitions. | :heavy_check_mark: | :heavy_check_mark: |
| `UpdateAdmin` | `newAdmin: ByStr20` | Set a new `stagingcontractadmin` by `newAdmin`.| :heavy_check_mark: | :heavy_check_mark: |
| `ClaimAdmin` |  | Claim to be new `contract admin`. | :heavy_check_mark: | :heavy_check_mark: 


### Bridge Transitions

| Name | Params | Description | Callable when paused? | Callable when not paused? | 
|--|--|--|:----:|:----:|
|`lock`| `tokenAddr: ByStr20, targetProxyHash: ByStr, toAddress: ByStr, toAssetHash: ByStr, feeAddr: ByStr, amount: Uint256, feeAmount: Uint256` | Invoked by the user, a certin amount tokens will be locked in the proxy contract the invoker/msg.sender immediately, then the same amount of tokens will be unloked from target chain proxy contract at the target chain with chainId later.| <center>:x:</center> | :heavy_check_mark: |
|`unlock`| `args: ByStr, fromContractAddr: ByStr, fromChainId: Uint64` | Invoked by the Zilliqa crosschain management contract, then mint a certin amount of tokens to the designated address since a certain amount was burnt from the source chain invoker.| <center>:x:</center> | :heavy_check_mark: |
|`registerAsset`| `args: ByStr, fromContractAddr: ByStr, fromChainId: Uint64` | Marks an asset as registered by mapping the asset address to the specified. | <center>:x:</center> | :heavy_check_mark: |

### Admin Transitions

| Name | Params | Description | Callable when paused? | Callable when not paused? | 
|--|--|--|:----:|:----:|
|`WithdrawZIL`| `amount: Uint128` | Withdraw native zils to admin acount|:heavy_check_mark: | <center>:x:</center> |
|`WithdWithdrawZRC2rawZIL`| `token: ByStr20, amount: Uint128` | Withdraw zrc2 token to admin acount|:heavy_check_mark: | <center>:x:</center> |
|`SetManager`| `new_manager: ByStr20` | Setup cross chain manager contract|:heavy_check_mark: | :heavy_check_mark: |
|`SetManagerProxy`| `new_manager_proxy: ByStr20` | Setup cross chain manager proxy contract|:heavy_check_mark: | :heavy_check_mark: |

# BridgeEntrance Contract Specification

`BridgeEntrance` is a Switcheo version contract that builds on the `LockProxy`, allowing people to lock ZRC2 tokens and native zils in the LockProxy contract and while getting corresponding tokens in the target chain simultaneously (e.g. ERC20 in ethereum) and vice versa.

## Roles and Privileges

The table below describes the roles and privileges that this contract defines:

| Role | Description & Privileges|                                    
| --------------- | ------------------------------------------------- |
| `init_admin`      | The initial admin of the contract which is usually the creator of the contract. `init_admin` is also the initial value of admin. |
| `current_admin`    | Current `admin` of the contract initialized to `init_admin`. Certain critical actions can only be performed by the `admin`. |
| `pending_admin`    | Next `admin` of the contract initialized to `none`. Used during the transfer of ownership. |
| `init_lock_proxy` | The initial LockProxy contract address |
| `lock_proxy` | The current LockProxy contract address. |

The contract defines and uses several custom ADTs that we describe below:

1. Error Data Type:

```ocaml
type Error = 
  | AmountCannotBeZero
  | AssetNotRegistered
  | ContractPaused
  | EmptyHashStr
  | IllegalAmount
  | IllegalRegisterAssetArgs
  | InvalidFeeAmount
  | InvalidLockProxyContract
  | NotPendingAdmin
  | NotAdmin
  | PendingAdminNotEmpty
```

2. Cross-Chain Transaction Data Type:

```ocaml
(* used for cross-chain lock and unlock methods *)
(* fromAssetAddress fromAssetDenom toAssetDenom recoveryAddress toAddress amount withdrawFeeAmount withdrawFeeAddress *)
type TransferTxArgs =
| TransferTxArgs of ByStr ByStr ByStr ByStr ByStr Uint256 Uint256 ByStr
```

## Immutable Parameters

The table below lists the parameters that are defined at the contract deployment time and hence cannot be changed later on.

| Name | Type | Description |
|--|--|--|
|`init_admin`| `ByStr20` | The initial address of the admin. |
|`init_lock_proxy`| `ByStr20` | The initial LockProxy address. |

## Mutable Fields

The table below presents the mutable fields of the contract and their initial values.

| Name | Type | Initial Value |Description |
|--|--|--|--|
|`current_admin`| `Option ByStr20` | `init_admin` | Current `admin` of the contract. |
|`pending_admin`| `Option ByStr20` | `None {ByStr20}` | Next `admin` of the contract. |
|`lock_proxy`| `ByStr20` | `init_lock_proxy` | Address of the current `LockProxy` contract. |
|`paused`| `Bool` | `False` | A Boolean field that shows if the contract is `paused`  |

## Transitions

### Housekeeping Transitions

| Name        | Params     | Description | Callable when paused? | Callable when not paused? | 
| ----------- | -----------|-------------|:--------------------------:|:--------------------------:|
| `Pause` | | Pause the contract temporarily to stop any critical transition from being invoked. | :heavy_check_mark: | :heavy_check_mark: |
| `Unpause` | | Un-pause the contract to re-allow the invocation of all transitions. | :heavy_check_mark: | :heavy_check_mark: |
| `UpdateLockProxy` | `new_lock_proxy: ByStr20` | Set a new `lock_proxy` by `current_admin`.| :heavy_check_mark: | :heavy_check_mark: |
| `RevokeOwnership` |  | Removes the `contract current_admin`. | :heavy_check_mark: | :heavy_check_mark: |
| `TransferOwnership` |  | Transfers contract ownership to `pending_admin`. | :heavy_check_mark: | :heavy_check_mark: |
| `AcceptOwnership` |  | `pending_admin` finalizes the transfer of contract ownership. | :heavy_check_mark: | :heavy_check_mark: 

### Bridge Transitions

| Name | Params | Description | Callable when paused? | Callable when not paused? | 
|--|--|--|:----:|:----:|
|`lock`| `tokenAddr: ByStr20, targetProxyHash: ByStr, recoveryAddress: ByStr, fromAssetDenom: ByStr,  withdrawFeeAddress: ByStr, toAddress: ByStr, toAssetDenom: ByStr, amount: Uint256, withdrawFeeAmount: Uint256` | Invoked by the user, a certain amount of tokens will be locked in the LockProxy contract, then the same amount of tokens will be unlocked from target chain proxy contract at the target chain with chainId later.| <center>:x:</center> | :heavy_check_mark: |

### Callback Transitions

| Name | Params | Description | Callable when paused? | Callable when not paused? | 
|--|--|--|:----:|:----:|
|`TransferFromSuccessCallBack`| `initiator: ByStr20, sender: ByStr20` | Callback used when transferring ZRC-2 tokens using `TransferFrom`|:heavy_check_mark: | :heavy_check_mark: |

# Multi-signature Wallet Contract Specification

This contract has two main roles. First, it holds funds that can be paid out to
arbitrary users, provided that enough people from a pre-defined set of owners
have signed off on the payout.

Second, and more generally, it also represents a group of users that can invoke
a transition in another contract only if enough people in that group have
signed off on it. In the staking context, it represents the `admin` in the
`SSNList` contract. This provides added security for the privileged `admin`
role.

## General Flow

Any transaction request (whether transfer of payments or invocation of a
foreign transition) must be added to the contract before signatures can be
collected. Once enough signatures are collected, the recipient (in case of
payments) and/or any of the owners (in the general case) can ask for the
transaction to be executed.

If an owner changes his mind about a transaction, the signature can be revoked
until the transaction is executed.

This wallet does not allow adding or removing owners, or changing the number of
required signatures. To do any of those, perform the following steps:

1. Deploy a new wallet with `owners` and `required_signatures` set to the new values. `MAKE SURE THAT THE NEW WALLET HAS BEEN SUCCESFULLY DEPLOYED WITH THE CORRECT PARAMETERS BEFORE CONTINUING!`
2. Invoke the `SubmitTransaction` transition on the old wallet with the following parameters:
   - `recipient` : The `address` of the new wallet
   - `amount` : The `_balance` of the old wallet
   - `tag` : `AddFunds`
3. Have (a sufficient number of) the owners of the old contract invoke the `SignTransaction` transition on the old wallet. The parameter `transactionId` should be set to the `Id` of the transaction created in step 2.
4. Have one of the owners of the old contract invoke the `ExecuteTransaction` transition on the old contract. This will cause the entire balance of the old contract to be transferred to the new wallet. Note that no un-executed transactions will be transferred to the new wallet along with the funds.

> WARNING: If a sufficient number of owners lose their private keys, or for any other reason are unable or unwilling to sign for new transactions, the funds in the wallet will be locked forever. It is therefore a good idea to set required_signatures to a value strictly less than the number of owners, so that the remaining owners can retrieve the funds should such a scenario occur.
<br> <br> If an owner loses his private key, the remaining owners should move the funds to a new wallet (using the workflow described above) to  ensure that funds are not locked if another owner loses his private key. The owner who originally lost his private key can generate a new key, and the corresponding address be added to the new wallet, so that the same set of people own the new wallet.

## Roles and Privileges

The table below list the different roles defined in the contract.

| Name | Description & Privileges |
|--|--|
|`owners` | The users who own this contract. |

## Immutable Parameters

The table below lists the parameters that are defined at the contract deployment time and hence cannot be changed later on.

| Name | Type | Description |
|--|--|--|
|`owners_list`| `List ByStr20` | List of initial owners. |
|`required_signatures`| `Uint32` | Minimum amount of signatures to execute a transaction. |

## Mutable Fields

The table below presents the mutable fields of the contract and their initial values.

| Name | Type | Initial Value | Description |
|--|--|--|--|
|`owners`| `Map ByStr20 Bool` | `owners_list` | Map of owners. |
|`transactionCount`| `Uint32` | `0` | The number of of transactions  requests submitted so far. |
|`signatures`| `Map Uint32 (Map ByStr20 Bool)` | `Emp Uint32 (Map ByStr20 Bool)` | Collected signatures for transactions by transaction ID. |
|`signature_counts`| `Map Uint32 Uint32` | `Emp Uint32 Uint32` | Running count of collected signatures for transactions. |
|`transactions`| `Map Uint32 Transaction` | `Emp Uint32 Transaction` | Transactions that have been submitted but not exected yet. |

## Transitions

All the transitions in the contract can be categorized into three categories:
- **Submit Transitions:** Create transactions for future signoff.
- **Action Transitions:** Let owners sign, revoke or execute submitted transactions.
- The `_balance` field keeps the amount of funds held by the contract and can be freely read within the implementation. `AddFunds transition` are used for adding native funds(ZIL) to the wallet from incoming messages by using `accept` keyword.

### Submit Transitions

The first transition is meant to submit request for transfer of native ZILs while the other are meant to submit a request to invoke transitions in the `ZilCrossChainManagerProxy` contract or `LockProxySwitcheo` contract.

#### CCMMultisigWallet

| Name | Params | Description |
|--|--|--|
|`SubmitNativeTransaction`| `recipient : ByStr20, amount : Uint128, tag : String` | Submit a request for transfer of native tokens for future signoffs. |
|`SubmitCustomUpgradeToTransaction`| `calleeContract : ByStr20, newCrosschainManager : ByStr20` | Submit a request to invoke the `UpgradeTo` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomChangeProxyAdminTransaction`| `calleeContract : ByStr20, newAdmin : ByStr20` | Submit a request to invoke the `ChangeProxyAdmin` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomClaimProxyAdminTransaction`| `calleeContract : ByStr20` | Submit a request to invoke the `ClaimProxyAdmin` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPauseTransaction`| `calleeContract : ByStr20` | Submit a request to invoke the `Pause` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomUnpauseTransaction`| `calleeContract : ByStr20` | Submit a request to invoke the `UnPause` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomUpdateAdminTransaction`| `calleeContract : ByStr20, newAdmin : ByStr20` | Submit a request to invoke the `UpdateAdmin` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomClaimAdminTransaction`| `calleeContract : ByStr20` | Submit a request to invoke the `ClaimAdmin` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPopulateWhiteListFromContractTransaction`| `calleeContract : ByStr20, addr: ByStr20, val: Bool` | Submit a request to invoke the `PopulateWhiteListFromContract` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPopulateWhiteListToContractTransaction`| `calleeContract : ByStr20, addr: ByStr20, val: Bool` | Submit a request to invoke the `PopulateWhiteListToContract` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPopulateWhiteListMethodTransaction`| `calleeContract : ByStr20, method: String, val: Bool` | Submit a request to invoke the `PopulateWhiteListMethod` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPopulateConKeepersPublicKeyListTransaction`| `calleeContract : ByStr20, keepers: List ByStr20` | Submit a request to invoke the `PopulateConKeepersPublicKeyList` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPopulateCurEpochStartHeightTransaction`| `calleeContract : ByStr20, height: Uint32` | Submit a request to invoke the `PopulateCurEpochStartHeight` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPopulateZilToPolyTxHashMapTransaction`| `calleeContract : ByStr20, index: Uint256, val: ByStr32` | Submit a request to invoke the `PopulateZilToPolyTxHashMap` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPopulateZilToPolyTxHashIndexTransaction`| `calleeContract : ByStr20, index: Uint256` | Submit a request to invoke the `PopulateZilToPolyTxHashIndex` transition in the `ZilCrossChainManagerProxy` contract. |
|`SubmitCustomPopulateFromChainTxExistTransaction`| `calleeContract : ByStr20, chainId: Uint64, txId: ByStr32` | Submit a request to invoke the `PopulateFromChainTxExist` transition in the `ZilCrossChainManagerProxy` contract. |

#### LockProxySwitcheoMultisigWallet

| Name | Params | Description |
|--|--|--|
|`SubmitNativeTransaction`| `recipient : ByStr20, amount : Uint128, tag : String` | Submit a request for transfer of native tokens for future signoffs. |
|`SubmitCustomPauseTransaction`| `calleeContract : ByStr20` | Submit a request to invoke the `Pause` transition in the `LockProxySwitcheo` contract. |
|`SubmitCustomUnpauseTransaction`| `calleeContract : ByStr20` | Submit a request to invoke the `UnPause` transition in the `LockProxySwitcheo` contract. |
|`SubmitCustomUpdateAdminTransaction`| `calleeContract : ByStr20, newAdmin : ByStr20` | Submit a request to invoke the `UpdateAdmin` transition in the `LockProxySwitcheo` contract. |
|`SubmitCustomClaimAdminTransaction`| `calleeContract : ByStr20` | Submit a request to invoke the `ClaimAdmin` transition in the `LockProxySwitcheo` contract. |
|`SubmitCustomWithdrawZILTransaction`| `calleeContract : ByStr20, amount: Uint128` | Submit a request to invoke the `WithdrawZIL` transition in the `LockProxySwitcheo` contract. |
|`SubmitCustomWithdrawZRC2Transaction`| `calleeContract : ByStr20, token: ByStr20, amount: Uint128` | Submit a request to invoke the `WithdrawZRC2` transition in the `LockProxySwitcheo` contract. |
|`SubmitCustomWithdrawZRC2Transaction`| `calleeContract : ByStr20, to: ByStr20, amount: Uint128` | Submit a request to invoke the `TransferZRC2` transition in the `LockProxySwitcheo` contract. |

### Action Transitions

| Name | Params | Description |
|--|--|--|
|`SignTransaction`| `transactionId : Uint32` | Sign off on an existing transaction. |
|`RevokeSignature`| `transactionId : Uint32` | Revoke signature of an existing transaction, if it has not yet been executed. |
|`ExecuteTransaction`| `transactionId : Uint32` | Execute signed-off transaction. |

# SwitcheoTokenZRC2 Contract Specification

Refer to https://github.com/Zilliqa/ZRC/blob/master/zrcs/zrc-2.md but only LockProxy can mint and burn tokens.

# More on cross chain infrastructure

- [polynetwork](https://github.com/polynetwork/poly)
- [zilliqa-relayer](https://github.com/Zilliqa/zilliqa-relayer)
