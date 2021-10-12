const calculateFees = require('./calculateFees');
const executeTask = require('../tasks/executeTask');
const { getLastEvents } = require('../events/handleEvents');
const timeoutChecker = require('./timeoutChecker');
const handleTxs = require('../tx/txHandler');
const { web3, config, db } = require('../inits');


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// add config.startBlock => write this to all events fromBlock
//runProsecutorChallenger
async function challenge() {
  while(1) {
    const blockNumberFromDB = await db._readBlockNumber();
    const blockNumberFromBC = await web3.eth.getBlockNumber();

    if (blockNumberFromDB !== blockNumberFromBC) {
      //here goes the whole logic
      // zero action is to write new data to db, a.k.a. update
      const newBlock = await web3.eth.getBlock(blockNumberFromBC);
      const nonce = await web3.eth.getTransactionCount(config.address);
      if (newBlock) {
        await db._writeBlockNumber(blockNumberFromBC);
        await db._writeBlockTimestamp(newBlock.timestamp);
        await db._writeAvailableNonce(nonce);
        let fees;
        try {
          fees = await calculateFees(blockNumberFromBC);
        } catch (e) {
          fees = await calculateFees(blockNumberFromDB);
        }
        await db._writeFees(fees.baseFeePerGas, fees.maxPriorityFeePerGas);

        // first action is handle previous transactions
        await handleTxs();

        // second action is request events and handle all requested events
        const events = ["DefendantResponded", "Reveal", "NewClaim", "BottomReached", "DefendantWon"];
        for (eventName of events) {
          const decodedEvents = await getLastEvents(eventName);
          if (decodedEvents.length !== 0) {
            await executeTask("handleEvents", {eventName, decodedEvents});
          }
        }

        // third action is timingRelatedChecksAndActions
        await timeoutChecker();

      }
    } else {
      await sleep(1000);
    }
  }
}

module.exports = challenge;
