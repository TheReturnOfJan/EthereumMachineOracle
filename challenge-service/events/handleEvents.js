const { web3, db, config, getOffchainRunnerInstance, getTreeBuilderInstance } = require('../inits');
const sendTask = require('../tasks/sendTask');

const activateMonitorMode = require('../challenge/activateMonitorMode.js');

const offchainRunnerInstance = getOffchainRunnerInstance();
const treeBuilderInstance = getTreeBuilderInstance();

async function getLastEvents(eventName) {
  const eventInputs = {
    "NewClaim": [config.seedParam, {name: "imageHash", type: "bytes32", indexed: false}, {name: "claimKey", type: "bytes32", indexed: false}],
    "Reveal": [{name: "prosecutorRoot", type: "bytes32", indexed: false}, config.stateParam],
    "rest": [{name: "prosecutorRoot", type: "bytes32", indexed: false}],
  };
  const eventTopics = {
    "NewClaim": web3.eth.abi.encodeEventSignature({type: "event", name: "NewClaim", inputs: eventInputs.NewClaim}),
    "Reveal": web3.eth.abi.encodeEventSignature({type: "event", name: "Reveal", inputs: eventInputs.Reveal}),
    "DefendantResponded": web3.eth.abi.encodeEventSignature("DefendantResponded(bytes32)"),
    "BottomReached": web3.eth.abi.encodeEventSignature("BottomReached(bytes32)"),
    "DefendantWon": web3.eth.abi.encodeEventSignature("DefendantWon(bytes32)"),
  };


  const fromBlockNumber = await db._readFromBlock(eventName);
  const blockNumber = await db._readBlockNumber();
  const address = eventName === "NewClaim" ? config.claimVerifierAddress : config.claimFalsifierAddress;
  const options = {
    fromBlock: fromBlockNumber,
    toBlock: blockNumber,
    address,
    topics: [eventTopics[eventName]],
  }

  const events = await web3.eth.getPastLogs(options);
  let inputs;
  switch (eventName) {
    case "NewClaim":
      inputs = eventInputs.NewClaim;
      break;
    case "Reveal":
      inputs = eventInputs.Reveal;
      break;
    default:
      inputs = eventInputs.rest;
  }
  const decoded = events.map((ev) => {
    return web3.eth.abi.decodeLog(inputs, ev.data, options.topics);
  });
  await db._writeFromBlock(eventName, blockNumber + 1);
  return decoded;
}

async function handleNewClaimEvent(decodedEvent) {
  const seed = decodedEvent.seed; // what will be here? and will it correctly be consumed by offchainRunnerInstance?
  const imageHashDoubt = decodedEvent.imageHash;
  const claimKey = decodedEvent.claimKey;

  const [ image, imageHash ] = await offchainRunnerInstance.computeAnswer(seed);

  if (imageHashDoubt !== imageHash) {
    const tree = await treeBuilderInstance.buildTree(seed);
    const correctCommitmentRoot = tree.root;
    const flag = await _doesItMakeSenseToRunDispute(claimKey, correctCommitmentRoot);

    if (flag) {
      // first write to db.trees disputeRoot "tree"
      const dbResult = await db._writeTree(tree.root, tree);
      // handle db writes

      // then send task to sendTxs_Queue
      const prosecutorNode = tree.getNodeByParent(0, 0);
      const msg = {
        txType: "newDispute",
        prosecutorRoot: correctCommitmentRoot,
        claimKey,
        prosecutorNode
      };
      await sendTask(msg);
    }
  }
}

async function handleRevealOrDefendantResponded(decodedEvent) {
  //the difference if exist split by event name
  const prosecutorRoot = decodedEvent.prosecutorRoot;

  const exists = await db._disputeExists(prosecutorRoot);

  if (exists) {
    const disputeOutput = await web3.eth.call({
      to: config.claimFalsifierAddress,
      data: web3.eth.abi.encodeFunctionSignature('getDispute(bytes32)') + prosecutorRoot.replace('0x', '')
    });
    const lastActionTimestamp = Number(BigInt('0x' + disputeOutput.substring(130, 194)));
    const stepTimeout = config.STEP_TIMEOUT;
    const currentTimestamp = await db._readBlockTimestamp();

    const state = Number(BigInt('0x' + disputeOutput.substring(770, 834)));

    //fool check
    //const prosecutor = '0x' + BigInt('0x' + disputeOutput.substring(66, 130)).toString(16);
    // me = prosecutor === config.address;
    // add me into if
    if (lastActionTimestamp + stepTimeout - currentTimestamp > 10 && state === 2) { //ProsecutorTurn
      const depth = Number(BigInt('0x' + disputeOutput.substring(386,450)));
      const disagreementPoint = Number(BigInt('0x' + disputeOutput.substring(258,322)));

      const msg = {
        txType: "prosecutorRespond",
        prosecutorRoot,
        lastActionTimestamp,
        depth,
        disagreementPoint
      };
      await sendTask(msg);
    }
  }
}

async function handleBottomReachedEvent(decodedEvent) {
  const prosecutorRoot = decodedEvent.prosecutorRoot;
  const exists = await db._disputeExists(prosecutorRoot);
  if (exists) {
    const disputeOutput = await web3.eth.call({
      to: config.claimFalsifierAddress,
      data: web3.eth.abi.encodeFunctionSignature('getDispute(bytes32)') + prosecutorRoot.replace('0x', '')
    });
    const lastActionTimestamp = Number(BigInt('0x' + disputeOutput.substring(130, 194)));
    const stepTimeout = config.STEP_TIMEOUT;
    const dispute = await db._readDBDispute(prosecutorRoot);
    dispute.currentSTEP = 4;
    dispute.currentSTEPTimeout = lastActionTimestamp + stepTimeout;
    await db._writeDBDispute(prosecutorRoot, dispute);
  }
}

async function handleDefendantWon(decodedEvent) {
  const prosecutorRoot = decodedEvent.prosecutorRoot;
  const exists = await db._disputeExists(prosecutorRoot);
  if (exists) {
    // double check
    const disputeOutput = await web3.eth.call({
      to: config.claimFalsifierAddress,
      data: web3.eth.abi.encodeFunctionSignature('getDispute(bytes32)') + prosecutorRoot.replace('0x', '')
    });
    const lastActionTimestamp = Number(BigInt('0x' + disputeOutput.substring(130, 194)));
    if (lastActionTimestamp === 0) {
      await db._removeDBDispute(prosecutorRoot);
      await db._removeTree(prosecutorRoot);
    }
  }
}

async function _doesItMakeSenseToRunDispute(claimKey, correctCommitmentRoot) {
  // check dispute is already opened or commitment root is busy (by bad actor)
  const disputeOutput = await web3.eth.call({
    to: config.claimFalsifierAddress,
    data: web3.eth.abi.encodeFunctionSignature("getDispute(bytes32)") + correctCommitmentRoot.replace('0x', '')
  });

  const disputeLastActionTimestamp = BigInt('0x' + disputeOutput.substring(130, 194)); //dispute.lastActionTimestamp
  if (disputeLastActionTimestamp > 0n) {
    activateMonitorMode(correctCommitmentRoot);
    return false;
  }

  //check is it enough time for dispute
  const claimOutput = await web3.eth.call({
    to: config.claimVerifierAddress,
    data: web3.eth.abi.encodeFunctionSignature("getClaim(bytes32)") + claimKey.replace('0x', '')
  });

  const currentTimestamp = await db._readBlockTimestamp();
  const claimTime = BigInt(claimOutput.substring(0, 66)); // claim.claimTime
  const timeout = BigInt('0x' + claimOutput.substring(66, 130)); // claim.timeout

  if (BigInt(currentTimestamp) > claimTime + (timeout / BigInt(2))) {
    return false;
  }
  return true;
}

module.exports = {
  getLastEvents,
  handleNewClaimEvent,
  handleRevealOrDefendantResponded,
  handleBottomReachedEvent,
  handleDefendantWon
}
