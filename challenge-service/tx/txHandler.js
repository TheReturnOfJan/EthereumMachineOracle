const activateMonitorMode = require('../challenge/activateMonitorMode.js');
const sendTransaction = require('./sendTransaction.js');
//const { sendProsecutorRespondTx } = require('./sendTxs');
const { db, web3, config } = require('../inits');


// param txFromDB: Object
/*
{
txHash: '0x0dddfffaaa2323',
expectedBlock: 3,
data: '0x4324324',
nonce: 5,
to: '0x342',
gasLimit: '0x3424',
value: '0x3424',
attempts: 1,
root: '0x4332432543254350000000000000',
timeLeftBeforeTimeout: 3432,
timeSend: 324234,
}
*/
async function handleTx(type, txFromDB) {
  let tx = {};
  let txToDB = {...txFromDB};
  txToDB.expectedBlock += 1;
  const blockTimestamp = await db._readBlockTimestamp();
  const timeSpend = blockTimestamp - txToDB.timeSend;
  txToDB.timeLeftBeforeTimeout = txToDB.timeLeftBeforeTimeout - timeSpend;
  txToDB.timeSend = blockTimestamp;

  const disputeOutput = await web3.eth.call({
    to: txFromDB.to,
    data: web3.eth.abi.encodeFunctionSignature('getDispute(bytes32)') + txFromDB.root.replace('0x', '')
  });

  const txReceipt = await web3.eth.getTransactionReceipt(txFromDB.txHash);

  // means tx is still pending
  if (txReceipt === null) {
    switch (type) {
      case "newDispute":
        const txToDBNewDispute = await _resendNewDisputeTx(txFromDB, txToDB, disputeOutput);
        return txToDBNewDispute;
        break;
      case "prosecutorRespond":
        const txToDBRespond = await _resendProsecutorRespondTx(txFromDB, txToDB);
        return txToDBRespond;
        break;
      case "timeout":
        const txToDBTimeout = await _resendTimeoutTx(txFromDB, txToDB);
        return txToDBTimeout;
        break;
    }
  } else {
    // means that tx included into block with success status
    if (txReceipt.status) {
      let dbDispute = await db._readDBDispute(txFromDB.root);
      const stepTimeout = config.STEP_TIMEOUT;

      switch (type) {
        case "newDispute":
          dbDispute.currentSTEP = 1;
          dbDispute.callTimeoutDeadline = Number(BigInt('0x' + disputeOutput.substring(834, 898))); // dispute.deadline
          dbDispute.currentSTEPTimeout = Number(BigInt('0x' + disputeOutput.substring(130, 194)) + BigInt(stepTimeout)); // lastActionTimestamp + STEP_TIMEOUT
          await db._writeDBDispute(txFromDB.root, dbDispute);
          break;
        case "prosecutorRespond":
          dbDispute.currentSTEP = 3;
          dbDispute.currentSTEPTimeout = Number(BigInt('0x' + disputeOutput.substring(130, 194)) + BigInt(stepTimeout)); // lastActionTimestamp + STEP_TIMEOUT
          await db._writeDBDispute(txFromDB.root, dbDispute);
          break;
        case "timeout":
          // ensure that prosecutor won
          // better to run matching here, as a standart first log from claimVerifier, second from claimFalsifier
          if (txReceipt.logs[1].topics[0] === web3.eth.abi.encodeEventSignature("ProsecutorWon(bytes32)")) {
            await _applyProsecutorWonDispute(txFromDB.root, txReceipt);
          } else if (txReceipt.logs[1].topics[0] === web3.eth.abi.encodeEventSignature("DefendantWon(bytes32)")) {
            await _applyDefenderWonDispute(txFromDB.root, txReceipt);
          } else {
            await db._writeUnexpBehavior(txReceipt.transactionHash);
          }
          break;
      }
      return;
    // means that tx failed
    } else if (!txReceipt.status) {
      // Check the reason of revert
      tx = await web3.eth.getTransaction(txReceipt.transactionHash);
      let errorData;
      try {
        await web3.eth.call(tx, tx.blockNumber);
      } catch (e) {
        errorData = e.data;
      }

      if (errorData.substring(0, 10) === '0x08c379a0') { // keccak256('Error(string)')
        if(errorData.substring(10, 74) === '0000000000000000000000000000000000000000000000000000000000000020') {
          const stringLengthHex = Number('0x' + errorData.substring(74, 138)) * 2;
          const errorString = '0x' + errorData.substring(138, 138 + stringLengthHex);

          switch (type) {
            case "newDispute":
              await handleNewDisputeRevertReason(errorString, txReceipt, txFromDB, disputeOutput);
              break;
            case "prosecutorRespond":
              await handleProsecutorRespondRevertReason(errorString, txReceipt, txFromDB, disputeOutput);
              break;
            case "timeout":
              await handleTimeoutRevertReason(errorString, txReceipt, txFromDB, disputeOutput);
              break;
          }
        }
      }
    } else {
     console.log("Unexpected behaviour! Should never happen.");
     console.log(txFromDB);
    }
  }
}

async function handleTimeoutRevertReason(errorString, txReceipt, txFromDB, disputeOutput) {
  switch (errorString) {
    case web3.utils.stringToHex("Can not timeout a non existent dispute."):
      // state is DisputeDoesnotExist
      // dispute is deleted by _prosecutorWins or _defenderWins
      const whoWon = await _whoWon(txFromDB);
      if (whoWon.winner === 'defender') {
        await _applyDefenderWonDispute(txFromDB.root, whoWon.log);
      } else if (whoWon.winner === 'prosecutor') {
        await _applyProsecutorWonDispute(txFromDB.root, whoWon.log);
      } else {
        console.log("WARNING!!! Unexpected behaviour.");
        await db._writeUnexpBehavior(txReceipt.transactionHash);
      }
      break;
    case web3.utils.stringToHex("This dispute can not be timeout out at this moment"):
      // find deadline
      const deadLine = Number(BigInt('0x' + disputeOutput.substring(834, 898)));
      const disputeFromDB = await db._readDBDispute(txFromDB.root);
      if (disputeFromDB.callTimeoutDeadline < deadLine) {
        disputeFromDB.callTimeoutDeadline = deadLine;
        await db._writeDBDispute(txFromDB.root, disputeFromDB);
      } else {
        console.log("WARNING!!! Unexpected behaviour.");
        await db._writeUnexpBehavior(txReceipt.transactionHash);
      }
      break;
  }
}

async function handleProsecutorRespondRevertReason(errorString, txReceipt, txFromDB, disputeOutput) {
  // Handle revert reason
  switch(errorString) {
    case web3.utils.stringToHex('Time to make an action is expired. The dispute is won by an opponent.'):
      // Lost dispute - there is an issue in this challenge service
      await db._writeFailedTx('pr_step_timeout_expired', txReceipt.transactionHash);
      // Form dispute for lostDisputes TODO - and create a function, because it will repeat often
      const dispute = await db._readDBDispute(txFromDB.root); // temporary just move from disputes => lostDisputes
      await db._writeDBDispute(txFromDB.root, dispute, "lostDisputes");
      await db._removeDBDispute(txFromDB.root);
      await db._removeTree(txFromDB.root);

      break;

    case web3.utils.stringToHex('Dispute state is not correct for this action.'):
      await db._writeFailedTx('pr_dispute_state_incorrect', txReceipt.transactionHash);

      // what is the dispute state?
      const disputeState = Number(BigInt('0x' + disputeOutput.substring(770, 834)));
      switch (disputeState) {
        case 0:
          // DoesNotExist
          // dispute is deleted by _prosecutorWins or _defenderWins
          const whoWon = await _whoWon(txFromDB);
          if (whoWon.winner === 'defender') {
            await _applyDefenderWonDispute(txFromDB.root, whoWon.log);
          } else if (whoWon.winner === 'prosecutor') {
            await _applyProsecutorWonDispute(txFromDB.root, whoWon.log);
          } else {
            console.log("WARNING!!! Unexpected behaviour.");
            await db._writeUnexpBehavior(txReceipt.transactionHash);
          }
          break;

        case 1:
          // Opened
          // Super rare case, can happen if service was offline, dispute was resolved and new dispute with the same root was opened

          // Ensure that the dispute is actually new one
          const currentBlockNumber = (await web3.eth.getBlock('latest')).number;
          const prosecutor = '0x' + disputeOutput.substring(66, 130); // dispute.prosecutor
          if (BigInt(prosecutor) === BigInt(config.address)) {
            // should not happen - assumption is wrong, let's check blocks
            if (currentBlockNumber === txFromDB.expectedBlock) {
              // impossible to imagine the case
              console.log("WARNING!!! Unexpected behaviour");
              await db._writeUnexpBehavior(txReceipt.transactionHash);
            } else {
              // case absolutely rare, old dispute was resolved while service was offline, new dispute with the same root was opened by this service (or other way - the same address become prosecutor)
              // think what to do
              // what to do: check if the claim is correct, if yes - remove and forget, if no - check if dispute root is correct computation root, if yes ->  _resendProsecutorRespondTx with all crafted params for step after newDispute landed
            }
          } else {
            // assumption is right => same logic as DoesNotExist
            const whoWon = await _whoWon(txFromDB, {endBlock: currentBlockNumber});
            if (whoWon.winner === 'defender') {
              await _applyDefenderWonDispute(txFromDB.root, whoWon.log);
            } else if (whoWon.winner === 'prosecutor') {
              await _applyProsecutorWonDispute(txFromDB.root, whoWon.log);
            } else {
              console.log("WARNING!!! Unexpected behaviour.");
              await db._writeUnexpBehavior(txReceipt.transactionHash);
            }
          }
          break;

        case 2:
          // ProsecutorTurn
          // cannot happen
          console.log("WARNING!!! Unexpected behaviour.");
          await db._writeUnexpBehavior(txReceipt.transactionHash);
          break;
        case 3:
          // DefendantTurn
          // almost nothing to do here
          // for interest compare the current depth and tx depth (was tx send when needed and someone else send the same tx? or tx was send by mistake earlier?)
          break;
        case 4:
          // Bottom
          // shouldn't happen, because the tx is sending when DefendantResponded event is emited and this event is replaced by BottomReached when the state become Bottom,
          // so no way prosecutorRespond tx is called
          break;
      }
      break;

    case web3.utils.stringToHex('Brought node from the wrong side.'):
      await db._writeFailedTx('pr_wrong_node', txReceipt.transactionHash);

      //await sendProsecutorRespondTx(prosecutorRoot, lastActionTimestamp, depth, disagreementPoint)
      // _resendProsecutorRespondTx - where the data should be adjusted
      break;
  }
}

async function handleNewDisputeRevertReason(errorString, txReceipt, txFromDB, disputeOutput) {
  // Handle revert reason
  switch(errorString) {
    case web3.utils.stringToHex('Not enough stake sent.'):
      await db._writeFailedTx('nd_not_enough_stake_sent', txReceipt.transactionHash);
      const currentStake = await web3.eth.call({
        to: txFromDB.to,
        data: web3.eth.abi.encodeFunctionSignature('STAKE_SIZE()')
      });
      // check if sender address has enough ETH
      const senderBalance = await web3.eth.getBalance(config.address);
      if (BigInt(senderBalance) < BigInt(currentStake)) { //+ (BigInt(txReceipt.effectiveGasPrice) * estimateGas
        // TODO In this case should be another error - discover it
        console.log("WARNING! The balance of account is less than stake size. Cannot process transactions anymore.");
        console.log("Need to send additional funds to sender");
        // or maybe use another address in config with more funds? and here make switch
        //_writeToDBFailedDisputes('empty_sender', txFromDB.root);
      } else {
        // resend tx with actual stake
        txFromDB.value = BigInt(currentStake).toString(16);
        const txToDB = await _resendNewDisputeTx(txFromDB, txToDB, disputeOutput);
        return txToDB;
      }
      break;

    case web3.utils.stringToHex('Dispute already exists.'):
      await db._writeFailedTx('nd_dispute_already_exists', txReceipt.transactionHash);
      activateMonitorMode(txFromDB.root);
      await db._removeDBDispute(txFromDB.root);
      await db._removeTree(txFromDB.root);
      break;

    case web3.utils.stringToHex('Claim does not exists.'):
      await db._writeFailedTx('nd_claim_does_not_exist', txReceipt.transactionHash);
      // Check if dispute exist
      const disputeLastActionTimestamp = BigInt('0x' + disputeOutput.substring(130, 194)); //dispute.lastActionTimestamp

      if (disputeLastActionTimestamp > 0n) {
        activateMonitorMode(txFromDB.root);
        await db._removeDBDispute(txFromDB.root);
        await db._removeTree(txFromDB.root);
      } else {
        // TODO think a little bit more why this can happen and what to do in this case
        await db._removeDBDispute(txFromDB.root);
        await db._removeTree(txFromDB.root);
      }
      break;

    case web3.utils.stringToHex('There is not enough time left for a dispute.'):
      await db._writeFailedTx('nd_not_enough_time_for_dispute', txReceipt.transactionHash);
      await db._removeDBDispute(txFromDB.root);
      await db._removeTree(txFromDB.root);
      break;
  }

}



async function _formTxWithPriorityFees(txFromDB, timeLeftBeforeTimeout) {
  let tx = {};
  let attempts;
  // calculate new maxPriorityFee and maxFee
  const { baseFeePerGas, maxPriorityFeePerGas } = await db._readFees();

  if (txFromDB.attempts === 1) {
    tx.maxPriorityFeePerGas = '0xb2d05e00'; // 3GWei
    attempts = 2;
  } else if (txFromDB.attempts === 6) {
    // stop trying to compete in a priority place, iterate again
    tx.maxPriorityFeePerGas = '0x77359400'; // 2GWei
    attempts = 1;
  } else {
    tx.maxPriorityFeePerGas = maxPriorityFeePerGas[txFromDB.attempts];
    attempts = txFromDB.attempts + 1;
  }

  // Speed up depends on timeLeftBeforeTimeout
  if (timeLeftBeforeTimeout < 20) {
    tx.maxPriorityFeePerGas = maxPriorityFeePerGas[5];
    tx.maxPriorityFeePerGas = '0x' + (BigInt(tx.maxPriorityFeePerGas) * 2n).toString(16);
  } else if (timeLeftBeforeTimeout > 20 && timeLeftBeforeTimeout < 40) {
    tx.maxPriorityFeePerGas = maxPriorityFeePerGas[4];
    tx.maxPriorityFeePerGas = '0x' + (BigInt(tx.maxPriorityFeePerGas) * 2n).toString(16);
  } else if (timeLeftBeforeTimeout > 40 && timeLeftBeforeTimeout < 60) {
    tx.maxPriorityFeePerGas = maxPriorityFeePerGas[3];
    tx.maxPriorityFeePerGas = '0x' + (BigInt(tx.maxPriorityFeePerGas) * 2n).toString(16);
  }

  // Form new tx
  tx.maxFeePerGas = '0x' + (BigInt(baseFeePerGas) + BigInt(tx.maxPriorityFeePerGas)).toString(16);
  tx.gasLimit = txFromDB.gasLimit;
  tx.to = txFromDB.to;
  tx.data = txFromDB.data;
  tx.value = txFromDB.value;
  tx.type = '0x02';

  return { tx, attempts };
}


// Please find pretty way to define who win without repeating code
async function _whoWon(txFromDB, options = {}) {
  // check if _defenderWins - fetching logs "DefendantWon" and if match txFromDB.root
  const startBlock = options.startBlock || txFromDB.expectedBlock - 10;
  const endBlock = options.endBlock || txFromDB.expectedBlock;
  let logs = await web3.eth.getPastLogs({
    fromBlock: startBlock,
    toBlock: endBlock,
    address: txFromDB.to,
    topics: [web3.eth.abi.encodeEventSignature('DefendantWon(bytes32)')]
  });

  let matched = logs.filter(e => {
    return e.data === txFromDB.root;
  })

  if (matched.length > 0) {
    return { winner: "defender", log: matched[0] };
  }

  logs = await web3.eth.getPastLogs({
    fromBlock: txFromDB.expectedBlock - 10,
    toBlock: txFromDB.expectedBlock,
    address: txFromDB.to,
    topics: [web3.eth.abi.encodeEventSignature('ProsecutorWon(bytes32)')]
  });

  matched = logs.filter(e => {
    return e.data === txFromDB.root;
  });

  if (matched.length > 0) {
    return { winner: "prosecutor", log: matched[0] };
  }
  return {};
}

async function _applyDefenderWonDispute(root, log) {
  const dispute = await db._readDBDispute(root);
  dispute.blockNumberWhenLost = log.blockNumber;
  dispute.transactionHashWhenLost = log.transactionHash;
  dispute.disputeOutputBeforeLose = await web3.eth.call({
    to: config.claimFalsifierAddress,
    data: web3.eth.abi.encodeFunctionSignature('getDispute(bytes32)') + root.replace('0x', '')
  }, dispute.blockNumberWhenLost - 1);
  await db._writeDBDispute(root, dispute, "lostDisputes");
  await db._removeDBDispute(root);
  await db._removeTree(root);
}

async function _applyProsecutorWonDispute(root, log) {
  const dispute = await db._readDBDispute(root);
  dispute.blockNumberWhenWon = log.blockNumber;
  dispute.transactionHashWhenWon = log.transactionHash;
  dispute.disputeOutputBeforeWon = await web3.eth.call({
    to: config.claimFalsifierAddress,
    data: web3.eth.abi.encodeFunctionSignature('getDispute(bytes32)') + root.replace('0x', '')
  }, dispute.blockNumberWhenWon - 1);
  await db._writeDBDispute(root, dispute, "wonDisputes");
  await db._removeDBDispute(root);
  await db._removeTree(root);
}

async function _resendNewDisputeTx(txFromDB, txToDB, disputeOutput) {
  // Check that dispute with this root was not opened yet
  const disputeLastActionTimestamp = BigInt('0x' + disputeOutput.substring(130, 194)); //dispute.lastActionTimestamp

  if (disputeLastActionTimestamp > 0n) {
    activateMonitorMode(txFromDB.root);
    await db._removeDBDispute(txFromDB.root);
    await db._removeTree(txFromDB.root);
  } else {
    let { tx, attempts } = await _formTxWithPriorityFees(txFromDB, txToDB.timeLeftBeforeTimeout);
    // replace with new nonce
    tx.nonce = '0x' + BigInt(await getNonce()).toString(16);
    txToDB.nonce = tx.nonce;
    txToDB.attempts = attempts;
    if (txFromDB.nonce === tx.nonce && BigInt(txFromDB.maxFeePerGas) > BigInt(tx.maxFeePerGas)) {
      return txToDB;
    } else {
      // Form tx to DB
      txToDB.txHash = sendTransaction(tx);
      return txToDB; // to write to db
    }
  }
  return;
}

async function getNonce() {
  return db._takeAvailableNonce();
}

// Run resendProsecutorTxs first with nonces sorted by left time
async function _resendProsecutorRespondTx(txFromDB, txToDB) {
  // there is no sense to resend if timeLeftBeforeTimeout is expired, so probably worth to check before
  let { tx, attempts } = await _formTxWithPriorityFees(txFromDB, txToDB.timeLeftBeforeTimeout);
  tx.nonce = '0x' + BigInt(await getNonce()).toString(16);
  txToDB.nonce = tx.nonce;
  txToDB.attempts = attempts;
  // think how effect if baseFee grow
  if (txFromDB.nonce === tx.nonce && BigInt(txFromDB.maxFeePerGas) > BigInt(tx.maxFeePerGas)) {
    return txToDB;
  } else {
    txToDB.txHash = sendTransaction(tx);
    return txToDB;
  }
}

async function _resendTimeoutTx(txFromDB, txToDB) {
  let { tx, attempts } = await _formTxWithPriorityFees(txFromDB, txToDB.timeLeftBeforeTimeout);
  txToDB.attempts = attempts;
  tx.nonce = '0x' + BigInt(await getNonce()).toString(16);
  txToDB.nonce = tx.nonce;
  if (txFromDB.nonce === tx.nonce && BigInt(txFromDB.maxFeePerGas) > BigInt(tx.maxFeePerGas)) {
    return txToDB;
  } else {
    txToDB.txHash = sendTransaction(tx);
    return txToDB;
  }
}
/*
const jsonOutputsDispute = [{"components":[{"internalType":"bytes32","name":"defendantRoot","type":"bytes32"},{"internalType":"address","name":"prosecutor","type":"address"},{"internalType":"uint256","name":"lastActionTimestamp","type":"uint256"},{"internalType":"uint256","name":"numberOfSteps","type":"uint256"},{"internalType":"uint256","name":"disagreementPoint","type":"uint256"},{"internalType":"bytes32","name":"firstDivergentStateHash","type":"bytes32"},{"internalType":"uint256","name":"depth","type":"uint256"},{"internalType":"bool","name":"goRight","type":"bool"},{"components":[{"internalType":"bytes32","name":"left","type":"bytes32"},{"internalType":"bytes32","name":"right","type":"bytes32"}],"internalType":"struct Merkle.TreeNode","name":"defendantNode","type":"tuple"},{"components":[{"internalType":"bytes32","name":"left","type":"bytes32"},{"internalType":"bytes32","name":"right","type":"bytes32"}],"internalType":"struct Merkle.TreeNode","name":"prosecutorNode","type":"tuple"},{"internalType":"enum IClaimFalsifier.DisputeState","name":"state","type":"uint8"},{"internalType":"uint256","name":"deadLine","type":"uint256"}],"internalType":"struct IClaimFalsifier.Dispute","name":"","type":"tuple"}];
*/

// run before events are handled
async function handleTxs() {
  const prosecutorRespondTxs = await db._popTxsListFromDB("txsProsecutorRespond");
  for (let i = 0; i < prosecutorRespondTxs.length; i++) {
    // better to create a task in a queue
    const txToDBRespond = await handleTx("prosecutorRespond", prosecutorRespondTxs[i]);
    if (txToDBRespond) {
      await db._writeTxToList("txsProsecutorRespond", txToDBRespond);
    }
  }
  // sort prosecutorRespond txs by time left (needed for giving first nonces for the most timesensitive txs)
  const prosecutorRespondTxsHandled = await db._popTxsListFromDB("txsProsecutorRespond");

  const temp = await Promise.all(prosecutorRespondTxsHandled.map(async (tx, index) => {
    const dispute = await db._readDBDispute(tx.root);
    // assert.equal(dispute.currentSTEP === 2)
    const blockTimestamp = await db._readBlockTimestamp();
    const timeleft = dispute.currentSTEPTimeout - blockTimestamp;
    return {index, timeleft};
  }));

  temp.sort((a,b) => {
    if (a.timeleft < b.timeleft) {
      return -1;
    }
    if (a.timeleft > b.timeleft) {
      return 1;
    }
    return 0;
  });

  const prosecutorRespondTxsSorted = temp.map((tx) => {
    return prosecutorRespondTxsHandled[tx.index]
  });

  for (let i = 0; i < prosecutorRespondTxsSorted.length; i++) {
    await db._writeTxToList("txsProsecutorRespond", prosecutorRespondTxsSorted[i]);
  }

  const newDisputeTxs = await db._popTxsListFromDB("txsNewDispute");
  for (let i = 0; i < newDisputeTxs.length; i++) {
    // better to create a task in a queue
    const txToDBNewDispute = await handleTx("newDispute", newDisputeTxs[i]);
    if (txToDBNewDispute) {
      await db._writeTxToList("txsNewDispute", txToDBNewDispute);
    }
  }

  const timeoutTxs = await db._popTxsListFromDB("txsTimeout");
  for (let i = 0; i < timeoutTxs.length; i++) {
    // better to create a task in a queue
    const txToDBTimeout = await handleTx("timeout", timeoutTxs[i]);
    if (txToDBTimeout) {
      await db._writeTxToList("txsTimeout", txToDBTimeout);
    }
  }

}

module.exports = handleTxs;
