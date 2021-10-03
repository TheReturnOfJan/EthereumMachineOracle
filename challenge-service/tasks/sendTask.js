const {
  sendNewDisputeTx,
  sendProsecutorRespondTx,
} = require('../tx/sendTxs');

async function sendTask(msg) {
    switch (msg.txType) {
      case "newDispute":
        await sendNewDisputeTx(msg.prosecutorRoot, msg.claimKey, msg.prosecutorNode);
        break;
      case "prosecutorRespond":
        await sendProsecutorRespondTx(msg.prosecutorRoot, msg.lastActionTimestamp, msg.depth, msg.disagreementPoint);
        break;
    }
}

module.exports = sendTask;
