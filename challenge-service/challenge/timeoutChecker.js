const { db } = require('../inits');
const executeTask = require('../tasks/executeTask');

const steps = {
    "0": "newDisputeTxSended",
    "1": "newDisputeTxLanded",
    "2": "prosecutorRespondTxSended",
    "3": "prosecutorRespondTxLanded",
    "4": "bottomReached",
    "5": "defendantMissedStepTimeout",
    "6": "timeoutTxSended",
    "7": "timeoutTxLanded",
};

async function timeoutChecker() {
  const currentTimestamp = await db._readBlockTimestamp();
  const currentDisputes = await db._getAllDisputes();
  // first maybe filter by steps
  const disputeKeys = Object.keys(currentDisputes);
  for (computationRoot of disputeKeys) {
    const dispute = currentDisputes[computationRoot];

    switch (dispute.currentSTEP) {
      case 1:
      case 3:
      case 4:
        if (dispute.currentSTEPTimeout < currentTimestamp) {
          dispute.currentSTEP = 5;
          delete dispute.currentSTEPTimeout;
          await db._writeDBDispute(computationRoot, dispute);
        }
        break;
      case 5:
        if (dispute.callTimeoutDeadline <= currentTimestamp) {
          await executeTask("sendTxs", {txType: "timeout", prosecutorRoot: computationRoot});
        }
        break;
    }
  }
}


module.exports = timeoutChecker;
/*
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
