const asyncRedis = require("async-redis");
const config = require('./configInstance');

const client = asyncRedis.createClient({
  host: config.redis.options.host,
  port: config.redis.options.port
});

class DB {
  constructor() {
    this.db = client;
  }

  async _writeTxToList(listName, data) {
    let tx = JSON.stringify(data);
    return this.db.rpush(listName, tx);
  }

  async _writeFailedTx(reason, txHash) {
    const list = await this.db.hget("failedTxs", reason);
    let array;
    if (!list) {
      array = [txHash];
    } else {
      array = JSON.parse(list);
      array.push(txHash);
    }
    return this.db.hset("failedTxs", reason, JSON.stringify(array));
  }

  async _writeUnexpBehavior(txHash) {
    return this.db.rpush("unexpectedBehavior", txHash);
  }

  async _popTxsListFromDB(listName) {
    const arrayLength = await this.db.llen(listName);
    let txsList = await this.db.lpop(listName, arrayLength);
    if (txsList) {
      txsList = txsList.map(e => { return JSON.parse(e); });
    }
    return txsList || [];
  }

  async _readDBDispute(computationRoot) {
    const dispute = await this.db.hget("disputes", computationRoot);
    return JSON.parse(dispute);
  }

  async _disputeExists(computationRoot) {
    return this.db.hexists("disputes", computationRoot);
  }

  async _writeDBDispute(computationRoot, dispute, disputeType = "disputes") {
     return this.db.hset(disputeType, computationRoot, JSON.stringify(dispute));
  }

  async _removeDBDispute(computationRoot) {
    return this.db.hdel("disputes", computationRoot);
  }

  async _writeFees(baseFeePerGas, maxPriorityFeePerGas) {
    // or maybe call here _calculateFees and as input take blockNumber??
    await this.db.set("baseFeePerGas", baseFeePerGas);
    return this.db.set("maxPriorityFeePerGas", maxPriorityFeePerGas);
  }

  async _readFees() {
    const baseFeePerGas = await this.db.get("baseFeePerGas");
    let maxPriorityFeePerGas = await this.db.get("maxPriorityFeePerGas");
    maxPriorityFeePerGas = JSON.parse(maxPriorityFeePerGas);
    return {
      baseFeePerGas, //string
      maxPriorityFeePerGas //array
    }
  }

  async _writeBlockNumber(blockNumber) {
    return this.db.set("blockNumber", blockNumber);
  }

  async _readBlockNumber() {
    const blockNumber = await this.db.get("blockNumber");
    return Number(blockNumber);
  }

  async _writeBlockTimestamp(timestamp) {
    return this.db.set("blockTimestamp", timestamp);
  }

  async _readBlockTimestamp() {
    const blockTimestamp = await this.db.get("blockTimestamp");
    return Number(blockTimestamp);
  }

  async _writeTree(prosecutorRoot, tree) {
    return this.db.hset("trees", prosecutorRoot, JSON.stringify(tree));
  }

  async _readTree(prosecutorRoot) {
    const tree = await this.db.hget("trees", prosecutorRoot);
    return JSON.parse(tree);
  }

  async _removeTree(prosecutorRoot) {
    return this.db.hdel("trees", prosecutorRoot);
  }

  async _writeAvailableNonce(nonce) {
    return this.db.set("availableNonce", nonce);
  }

  async _readAvailableNonce() {
    return this.db.get("availableNonce");
  }

  async _takeAvailableNonce() {
    const nonce = await this._readAvailableNonce();
    await this._writeAvailableNonce(Number(nonce) + 1);
    return nonce;
  }

  async _getAllDisputes() {
    const disputes = await this.db.hgetall("disputes");
    if (disputes) {
      Object.keys(disputes).forEach((key) => {
        disputes[key] = JSON.parse(disputes[key]);
      });
    }
    return disputes || {};
  }

  async _writeFromBlock(eventName, blockNumber) {
    return this.db.hset("fromBlock", eventName, blockNumber);
  }

  async _readFromBlock(eventName) {
    const fromBlock = await this.db.hget("fromBlock", eventName);
    return Number(fromBlock);
  }

}

const dbInstance = new DB();


/*
"STEPS": {
    "0": "newDisputeTxSended",
    "1": "newDisputeTxLanded",
    "2": "prosecutorRespondTxSended",
    "3": "prosecutorRespondTxLanded",
    "4": "bottomReached",
    "5": "defendantMissedStepTimeout"
}

disputes
{
  "0x432": {
    currentSTEP: 0,
    currentSTEPTimeout: 12324230,
    callTimeoutDeadline: 12343256

  },
  '0x132': {
    currentSTEP: 2,
    currentSTEPTimeout: 12324265,
    callTimeoutDeadline: 12345256

  },

}
*/



module.exports = dbInstance;
