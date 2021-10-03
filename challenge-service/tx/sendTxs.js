// TODO don't forget to think about address signer for web3.eth.getTransactionCount
const sendTransaction = require('./sendTransaction.js');
const { db, web3, config } = require('../inits');

const txTypes = ["newDispute", "prosecutorRespond", "timeout", "requestStuckStake", "removeStuckDispute"];
/*
txToDB
{
+txHash: '0x0dddfffaaa2323',
expectedBlock: 3,
+data: '0x4324324',
+nonce: 5,
+to: '0x342',
+gasLimit: '0x3424',
+value: '0x3424',
attempts: 1,
root: '0x4332432543254350000000000000',
timeLeftBeforeTimeout: 3324,
}
*/
async function sendNewDisputeTx(prosecutorRoot, claimKey, prosecutorNode) {
  const txData = await composeTxData("newDispute", {claimKey, prosecutorNode});
  const txHash = sendTransaction(txData);
  // write tx to db
  const txToDB = {...txData};
  txToDB.txHash = txHash;
  txToDB.root = prosecutorRoot;
  txToDB.attempts = 0;
  txToDB.expectedBlock = (await db._readBlockNumber()) + 1;
  const claimOutput = await web3.eth.call({
    to: config.claimVerifierAddress,
    data: web3.eth.abi.encodeFunctionSignature("getClaim(bytes32)") + claimKey.replace('0x','')
  });
  const currentTimestamp = await db._readBlockTimestamp();
  const claimTime = BigInt(claimOutput.substring(0, 66)); // claim.claimTime
  const timeout = BigInt('0x' + claimOutput.substring(66, 130)); // claim.timeout
  const leftTime = (claimTime + timeout / 2n) - BigInt(currentTimestamp);
  txToDB.timeLeftBeforeTimeout = Number(leftTime);
  txToDB.timeSend = currentTimestamp;

  await db._writeTxToList("txsNewDispute", txToDB);
  // write dispute to db
  const dispute = {
    currentSTEP: 0,
    currentSTEPTimeout: Number(claimTime + timeout / 2n),
    callTimeoutDeadline: 0
  }
  await db._writeDBDispute(prosecutorRoot, dispute);

}

async function sendProsecutorRespondTx(prosecutorRoot, lastActionTimestamp, depth, disagreementPoint) {
  const txData = await composeTxData("prosecutorRespond", {prosecutorRoot, depth, disagreementPoint});
  const txHash = sendTransaction(txData);
  // write tx to db
  const txToDB = {...txData};
  txToDB.txHash = txHash;
  txToDB.root = prosecutorRoot;
  txToDB.attempts = 0;
  txToDB.expectedBlock = (await db._readBlockNumber()) + 1;
  const stepTimeout = config.STEP_TIMEOUT;
  const currentTimestamp = await db._readBlockTimestamp();
  const leftTime = BigInt(lastActionTimestamp) + BigInt(stepTimeout) - BigInt(currentTimestamp);
  txToDB.timeLeftBeforeTimeout = Number(leftTime);
  txToDB.timeSend = currentTimestamp;

  await db._writeTxToList("txsProsecutorRespond", txToDB);
  // read dispute from db and adjust
  const dispute = await db._readDBDispute(prosecutorRoot);
  // write dispute to db
  dispute.currentSTEP = 2;
  dispute.currentSTEPTimeout = Number(BigInt(stepTimeout) + BigInt(lastActionTimestamp));
  await db._writeDBDispute(prosecutorRoot, dispute);

}

//this tx is called on deadline and has this stepTimeout (MAX_TREE_DEPTH * STEP_TIMEOUT)
async function sendTimeoutTx(prosecutorRoot) {
  const txData = await composeTxData("timeout", {prosecutorRoot});
  const txHash = sendTransaction(txData);
  // write tx to db
  const txToDB = {...txData};
  txToDB.txHash = txHash;
  txToDB.root = prosecutorRoot;
  txToDB.attempts = 0;
  txToDB.expectedBlock = (await db._readBlockNumber()) + 1;
  const stepTimeout = config.STEP_TIMEOUT;
  const maxTreeDepth = config.MAX_TREE_DEPTH;
  const currentTimestamp = await db._readBlockTimestamp();
  const leftTime = maxTreeDepth * stepTimeout;
  txToDB.timeLeftBeforeTimeout = Number(leftTime);
  txToDB.timeSend = await db._readBlockTimestamp();

  await db._writeTxToList("txsTimeout", txToDB);
  // read dispute from db and adjust
  const dispute = await db._readDBDispute(prosecutorRoot);
  // write dispute to db
  dispute.currentSTEP = 6;
  await db._writeDBDispute(prosecutorRoot, dispute);
  // remove dispute from db
  // remove tree from db
  // or better to remove in txHandler after success
}


/*
txData:
{ +data: '0x',
  +gasLimit: "0x5208",
  +maxPriorityFeePerGas: '0x3b9aca00',
  +maxFeePerGas: '0x4e3b29200',
  +nonce: "0x1a",
  +to: '0x69262F3256181cf0A62c5f5E9f8cd8fcC7B8F8e7',
  +value: '0x16345785d8a0000',
  +type: '0x02' }
*/
async function composeTxData(txType, data) {
  let txData = {
    type: '0x02',
    to: config.claimFalsifierAddress
  };
  const { baseFeePerGas, maxPriorityFeePerGas } = await db._readFees();
  if (BigInt(maxPriorityFeePerGas[1]) < 3500000000n) { //3.5Gwei
    txData.maxPriorityFeePerGas = maxPriorityFeePerGas[1];
  } else {
    txData.maxPriorityFeePerGas = maxPriorityFeePerGas[0]
  }
  txData.maxFeePerGas = '0x' + (BigInt(baseFeePerGas) + BigInt(txData.maxPriorityFeePerGas)).toString(16);
  txData.nonce = '0x' + BigInt(await getNonce()).toString(16);

  switch (txType) {
    case "newDispute":
      txData.data = craftNewDisputeData(data.claimKey, data.prosecutorNode);
      txData.value = config.STAKE_SIZE;
      break;
    case "prosecutorRespond":
      txData.data = await craftProsecutorRespondData(data.prosecutorRoot, data.depth, data.disagreementPoint);
      txData.value = '0x0';
      break;
    case "timeout":
      txData.data = craftTimeoutData(data.prosecutorRoot);
      txData.value = '0x0';
      break;
  }
  // better to wrap below into try catch and think how to handle revert here
  txData.gasLimit = await estimateGasLimit(txData.data, txData.value);

  return txData;
}


async function getNonce() {
  return db._takeAvailableNonce();
}

async function estimateGasLimit(data, value = '0x0') {
  const estimatedGas = await web3.eth.estimateGas({to: config.claimFalsifierAddress, data, value});
  const gasLimit = '0x' + (BigInt(estimatedGas) * 150n / 100n).toString(16);
  return gasLimit;
}

function craftNewDisputeData(claimKey, prosecutorNode) {
  const data = web3.eth.abi.encodeFunctionSignature("newDispute(bytes32,(bytes32,bytes32))") + web3.eth.abi.encodeParameters(["bytes32", "bytes32", "bytes32"], [claimKey, prosecutorNode.left, prosecutorNode.right]).replace('0x', '');
  return data;
}

async function craftProsecutorRespondData(prosecutorRoot, depth, disagreementPoint) {
  // take tree from db
  const tree = await db._readTree(prosecutorRoot);
  const prosecutorNode = _getDisagreementNode(tree, depth, disagreementPoint);
  const data = web3.eth.abi.encodeFunctionSignature("prosecutorRespond(bytes32,(bytes32,bytes32))") + web3.eth.abi.encodeParameters(["bytes32", "bytes32", "bytes32"], [prosecutorRoot, prosecutorNode.left, prosecutorNode.right]).replace('0x','');
  return data;
}

function craftTimeoutData(prosecutorRoot) {
  return web3.eth.abi.encodeFunctionSignature("timeout(bytes32)") + prosecutorRoot.replace('0x','');
}

function craftRequestStuckStakeData() {
  return web3.eth.abi.encodeFunctionSignature("requestStuckStake()");
}

function craftRemoveStuckDispute(prosecutorRoot) {
  return web3.eth.abi.encodeFunctionSignature("removeStuckDispute(bytes32)") + prosecutorRoot.replace('0x','');
}

function _getDisagreementNode(tree, parentLevel, parentIndex) {
  if (2 ** parentLevel < parentIndex) {
    throw Error("parentIndex couldn't be in this level of the tree.");
  } else if (parentLevel >= tree.depth) {
    throw Error(`parentLevel should be in range 0 and ${tree.depth - 1}.`);
  }
  const leftChild = tree.tree[tree.depth - parentLevel - 1][parentIndex << 1] || tree.defaultNodes[tree.depth - parentLevel - 1];
  const rightChild = tree.tree[tree.depth - parentLevel - 1][(parentIndex << 1) + 1] || tree.defaultNodes[tree.depth - parentLevel - 1];
  return {
    left: leftChild,
    right: rightChild
  };
}


module.exports = {
  sendNewDisputeTx,
  sendProsecutorRespondTx,
  sendTimeoutTx
}
