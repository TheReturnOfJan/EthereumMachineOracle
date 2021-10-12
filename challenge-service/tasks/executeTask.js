const {
  sendTimeoutTx
} = require('../tx/sendTxs');

const {
  handleNewClaimEvent,
  handleRevealOrDefendantResponded,
  handleBottomReachedEvent,
  handleDefendantWon
} = require('../events/handleEvents');


async function executeTask(taskType, msg) {
  let result;
  switch (taskType) {
    case "sendTxs":
      switch (msg.txType) {
        case "timeout":
          await sendTimeoutTx(msg.prosecutorRoot);
          break;
      }
      break;
    case "handleEvents":
      switch (msg.eventName) {
        case "NewClaim":
          await Promise.all(msg.decodedEvents.map(async (ev) => {
            await handleNewClaimEvent(ev);
          }));
          break;
        case "DefendantResponded":
        case "Reveal":
          await Promise.all(msg.decodedEvents.map(async (ev) => {
            await handleRevealOrDefendantResponded(ev);
          }));
          break;
        case "BottomReached":
          await Promise.all(msg.decodedEvents.map(async (ev) => {
            await handleBottomReachedEvent(ev);
          }));
          break;
        case "DefendantWon":
          await Promise.all(msg.decodedEvents.map(async (ev) => {
            await handleDefendantWon(ev);
          }));
          break;
      }
      break;
  }
}

module.exports = executeTask;
