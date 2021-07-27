const { pimpVerifier, arraifyAsEthers, increaseTime } = require('./utils');

const OffchainRunner = require('../tools/vm/Machine.js');
const Challenger = require('../tools/challenger/Challenger.js');
const StructGenerator = require('../tools/structGen/structGen.js');

const Machine = artifacts.require('Machine');
const Merkle = artifacts.require('Merkle');
const ClaimVerifier = artifacts.require('ClaimVerifier');
const ClaimFalsifier = artifacts.require('ClaimFalsifier');
const Client = artifacts.require('Client');
const DEFAULT_STEP_TIMEOUT = 60;
const DEFAULT_STAKE_SIZE = '0x2c68af0bb140000';
const DEFAULT_MAX_TREE_DEPTH = 16;

const offchainRunnerInstance = new OffchainRunner.default(Machine._json);
const structGenerator = StructGenerator(Machine.source);
const seed = structGenerator.genSeed(); //(JAN: tool that ask dev to put nice seeds)
const challenger = new Challenger.default(offchainRunnerInstance, seed);


contract("EMO", async accounts => {
  const zeroNode = {left: "0x0000000000000000000000000000000000000000000000000000000000000000", right: "0x0000000000000000000000000000000000000000000000000000000000000000"};
  let client;
  let verifier;
  let falsifier;
  let stake;

  beforeEach(async () => {
      client = await Client.new(DEFAULT_MAX_TREE_DEPTH, DEFAULT_STEP_TIMEOUT); // -> this is not client-generic
      falsifier = await ClaimFalsifier.new(DEFAULT_STAKE_SIZE, DEFAULT_MAX_TREE_DEPTH, client.address, {gas: 7500000});
      let verifierAddress = await falsifier.claimVerifier();
      stake = await falsifier.STAKE_SIZE();
      verifier = await ClaimVerifier.at(verifierAddress);
      pimpVerifier(verifier);
      client.setClaimVerifier(verifier.address); // -> this is not client-generic
      client.setStake(stake); // -> is not client-generic
  });

  it("First interection - testing clients claim function", async () => {
    const image = await offchainRunnerInstance.run(seed);
    const imageHash = await offchainRunnerInstance.imageHash(image);
    const correctCommitmentRoot = await challenger.getCommitmentRoot();
    const incorrectCommitmentRoot = await challenger.getCommitmentRoot(false);
    const initialStateHash = await offchainRunnerInstance.stateHash(await offchainRunnerInstance.create(seed));

    // Starting from client claim
    // Also need to run syntax checker (TODO complete syntaxChecker) before unit tests are run (probably need to write a script and use it in an alias to emo box)
    const tx = await client.makeClaim(seed, image, correctCommitmentRoot, {value: stake});
    const balance = await web3.eth.getBalance(verifier.address);
    assert.equal(balance, stake, "Stake should be in a verifier contract");
    let clientTimeout = await client.defaultTimeout();

    const claim = await verifier.getClaim(correctCommitmentRoot);

    // Check that ClaimVerifier state was changed and claims mapping has new struct value with actual data
    assert.equal(claim.timeout, clientTimeout, "Should be default client timeout");
    assert.equal(claim.stake, stake, "Should be defined stake");
    assert.equal(claim.initialStateHash, initialStateHash, "Initial state hash should match.");
    assert.equal(claim.imageHash, imageHash, "Image hash should match.");

    // Check NewClaim event
    let events = await verifier.getPastEvents('NewClaim', {fromBlock: 0});
    assert.equal(events.length, 1, "Should be only one event.");
    assert.deepEqual(events[0].args.seed, arraifyAsEthers(seed, false), "Seed should match.");
    assert.equal(events[0].args.imageHash, imageHash, "Image hash should match.");
    assert.equal(events[0].args.claimKey, correctCommitmentRoot, "claimKey should be commitmentRoot");
  });

  it("Resolve true claim by timeout with no disputes", async () => {
    const image = await offchainRunnerInstance.run(seed);
    const imageHash = await offchainRunnerInstance.imageHash(image);
    const initialStateHash = await offchainRunnerInstance.stateHash(await offchainRunnerInstance.create(seed));
    const correctCommitmentRoot = await challenger.getCommitmentRoot();
    let tx = await client.makeClaim(seed, image, correctCommitmentRoot, {value: stake});
    try {
      tx = await verifier.resolveTrueClaim(correctCommitmentRoot);
    } catch (e) {
      assert.equal(e.reason, "Too early to resolve.", "Incorrect revert reason for resolving true claim.");
    }
    // Try to resolve unexisting claim
    try {
      tx = await verifier.resolveTrueClaim('0x0000000000000000000000000000000000000000000000000000000000000000');
    } catch (e) {
      assert.equal(e.reason, "Claim must exist.", "Incorrect revert reason for resolving true claim.");
    }

    // Try to resolve while timeout is not expired
    try {
      tx = await verifier.resolveTrueClaim(correctCommitmentRoot);
      console.log("Timing logic is broken");
    } catch (e) {
      assert.equal(e.reason, "Too early to resolve.", "Incorrect revert reason.");
    }

    const min_timeout = await verifier.MIN_TIMEOUT();
    await increaseTime(parseInt(min_timeout));
    tx = await verifier.resolveTrueClaim(correctCommitmentRoot);
    // Check logs
    assert.equal(tx.logs.length, 1, 'trigger one event'); // Probably we want to test also the case when callback failed and there is second event CallbackFailed
    assert.equal(tx.logs[0].event, 'TrueClaim', 'Should match event name.');
    assert.equal(tx.logs[0].args.claimKey, correctCommitmentRoot, 'claimKey should match.');

    // Checking only verifier balance. Skipped checking the client balance, because the subgoal is to make unit test generic for any client implementation.
    let balance = await web3.eth.getBalance(verifier.address);
    assert.equal(balance, 0, "Verifier should send stake to Client. Make sure Client contract has receive function.");

    // Checking the claim was deleted
    let claim = await verifier.getClaim(correctCommitmentRoot);
    _checkClaimRemoved(claim);

  });

  it("Resolve true claim after dispute - win dispute by revealing Bottom", async () => {
    const image = await challenger.computeImage(seed);
    const imageHash = await challenger.computeImageHash(image);
    const initialStateHash = await challenger.computeInitialStateHash(seed);

    const correctCommitmentRoot = await challenger.getCommitmentRoot();
    let disagreementPoint = 0;
    let disputeDepth = 0;

    const prosecutorRoot = await challenger.getCommitmentRoot(false); // incorrect root
    let defender = accounts[1];
    let prosecutor = accounts[2];

    // Make claim
    let defendandTx = await client.makeClaim(seed, image, correctCommitmentRoot, {from: defender, value: stake});

    // Starting dispute
    let prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false); // the start point is always 0, 0 - it's rootNode

    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    let actionTimestamp;
    let prosecutorTx = await falsifier.newDispute(correctCommitmentRoot, prosecutorNode, {from: prosecutor, value: stake});

    _checkLogsNewDispute(prosecutorTx, correctCommitmentRoot, prosecutorRoot);

    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(prosecutorRoot);
    actionTimestamp = dispute.lastActionTimestamp;
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, correctCommitmentRoot, prosecutor, prosecutorNode);

    // Step2. defendant calls reveal with args: prosecutorRoot, defendantNode, proofLeft, proofRight, finalState
    // PS. defendant should listen for NewDispute events and check if there is sense to defend claim
    let defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint); // it's 0, 0 - rootNode
    let proofLeft = await challenger.getProofByIndex(0);
    const finalStateIndex = (await challenger.finalState())[0];
    let proofRight = await challenger.getProofByIndex(finalStateIndex);
    let finalState = (await challenger.finalState())[1];

    defendandTx = await falsifier.reveal(prosecutorRoot, defendantNode, proofLeft, proofRight, finalState, {from: defender});
    let goRight = _goRight(prosecutorNode, defendantNode);
    disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
    disputeDepth++;
    _checkLogsReveal(defendandTx, prosecutorRoot, finalState);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(prosecutorRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should match.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 2, "Dispute state should be 'ProsecutorTurn'.");
    assert.equal(BigInt(dispute.numberOfSteps), BigInt(proofRight.path), "numberOfSteps should be equal path to the final leaf.");
    assert.equal(dispute.goRight, goRight, "prosecutor and defendant nodes are matched incorrect.");
    assert.equal(dispute.disagreementPoint, disagreementPoint, "First disagreementPoint update.");
    assert.equal(dispute.depth, disputeDepth, "We should go deeper into the tree to the next level, depth should be 1 now.");

    // Reproduce the challenge between prosecutor and defender, after defender revealing - there is iterating process until the bottom is reached
    for (let i = 0; i < DEFAULT_MAX_TREE_DEPTH - 2; i++) {
      //Step3. prosecutor calls prosecutorRespond with args: prosecutorRoot, prosecutorNode(next level, before calling check the dispute.goRight to define left or right node to use)
      //PS. prosector should listen for Reveal event and also checks the timeout if the event doesn't appear in the blockchain
      prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
      prosecutorTx = await falsifier.prosecutorRespond(prosecutorRoot, prosecutorNode, {from: prosecutor});
      _checkLogsProsecutorRespond(prosecutorTx, prosecutorRoot);

      // Check ClaimFalsifier state changes
      dispute = await falsifier.getDispute(prosecutorRoot);
      assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
      //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
      actionTimestamp = dispute.lastActionTimestamp;
      assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

      //Step4. defendant calls defendantRespond with args: prosecutorRoot, defendantNode
      defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
      defendandTx = await falsifier.defendantRespond(prosecutorRoot, defendantNode, {from: defender});
      // update
      goRight = _goRight(prosecutorNode, defendantNode);
      disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
      disputeDepth++;
      _checkLogsDefendantRespond(defendandTx, prosecutorRoot);

      // Check ClaimFalsifier state changes
      dispute = await falsifier.getDispute(prosecutorRoot);
      assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
      //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
      actionTimestamp = dispute.lastActionTimestamp;
      assert.equal(dispute.goRight, goRight, "left nodes of the prosecutor and defendant nodes should be equal.");
      assert.equal(dispute.disagreementPoint, disagreementPoint, "disagreementPoint should be updated.");
      assert.equal(dispute.depth, disputeDepth, "We should go deeper into the tree to the next level.");
      assert.equal(dispute.state, 2, "should be 'ProsecutorTurn'.");
    }

    //Step5. prosecutor respond last time
    prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
    prosecutorTx = await falsifier.prosecutorRespond(prosecutorRoot, prosecutorNode, {from: prosecutor});
    _checkLogsProsecutorRespond(prosecutorTx, prosecutorRoot);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(prosecutorRoot);
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

    // Balances before winning dispute
    let defenderBalanceBefore = await web3.eth.getBalance(defender);
    let falsifierBalanceBefore = await web3.eth.getBalance(falsifier.address);

    //Step6. defendant respond last time (in some cases it's enough for _defendantWins call execution)
    defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
    defendandTx = await falsifier.defendantRespond(prosecutorRoot, defendantNode, {from: defender});
    // update
    goRight = _goRight(prosecutorNode, defendantNode);
    disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
    disputeDepth++;

    if (disagreementPoint !== 0 && disagreementPoint <= finalStateIndex) {
      // Check ClaimFalsifier state changes
      dispute = await falsifier.getDispute(prosecutorRoot);
      assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
      //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
      actionTimestamp = dispute.lastActionTimestamp;
      assert.equal(dispute.goRight, goRight, "left nodes of the prosecutor and defendant nodes should be equal.");
      assert.equal(dispute.firstDivergentStateHash, goRight ? defendantNode.right : defendantNode.left, "The divergent state hash.");
      assert.equal(dispute.disagreementPoint, disagreementPoint, "Last disagreementPoint update.");
      assert.equal(dispute.depth, DEFAULT_MAX_TREE_DEPTH, "We reached the bottom. The depth should be equal MAX_TREE_DEPTH.");
      assert.equal(dispute.state, 4, "should be 'Bottom'.");

      _checkLogsBottomReached(defendandTx, prosecutorRoot);

      // Step7. defendant reveals bottom and wins dispute
      const proof = await challenger.getProofByIndex(disagreementPoint - 1);
      const defendantStateBeforeDisagreementPoint = await challenger.getStateByIndex(disagreementPoint - 1);

      defendandTx = await falsifier.defendantRevealBottom(prosecutorRoot, proof, defendantStateBeforeDisagreementPoint, {from: defender});

    }

    _checkLogsDefendantWon(defendandTx, prosecutorRoot);

    // Check dispute was deleted
    dispute = await falsifier.getDispute(prosecutorRoot);
    _checkDisputeRemoved(dispute);

    // SHOULD BE REMOVED IT'S CLIENT SPECIFIC LOGS
    // Check logs
    assert.equal(defendandTx.receipt.rawLogs.length, 2, 'trigger two event');
    assert.equal(defendandTx.receipt.rawLogs[0].address, client.address, "Make sure that the event is from Client.");
    assert.equal(defendandTx.receipt.rawLogs[0].topics[0], web3.utils.sha3('ClaimDefended(bytes32,bytes32,address)'), 'Should match the signature of the ClaimDefended event.');
    assert.equal(defendandTx.receipt.rawLogs[0].data, initialStateHash + correctCommitmentRoot.replace('0x', '') + '000000000000000000000000' + defender.replace('0x', '').toLowerCase(), 'data should match.');
    // SHOULD BE REMOVED IT'S CLIENT SPECIFIC LOGS

    // Check balances to ensure that defender received prosecutors stake as a reward
    let defenderBalanceAfter = await web3.eth.getBalance(defender);
    assert((BigInt(defenderBalanceAfter) - BigInt(defenderBalanceBefore)) * 10n >= BigInt(stake) * BigInt('9'), "The defender must receive prosecutors stake, to compare was used 90% of the amount because of the gas fees.");

    let falsifierBalanceAfter = await web3.eth.getBalance(falsifier.address);
    assert.equal(falsifierBalanceBefore - falsifierBalanceAfter, stake, 'Falsifier must transfered prosecutor stake to prosecutor according to client implementation.');

    // Step8. defender resolves true claim via ClaimVerifier
    let verifierBalanceBefore = await web3.eth.getBalance(verifier.address);
    defenderBalanceBefore = await web3.eth.getBalance(defender);

    // Wait until timeout is over
    let claim = await verifier.getClaim(correctCommitmentRoot);
    const timeoutPoint = parseInt(claim.timeout) + parseInt(claim.claimTime);
    const blockTimestamp = (await web3.eth.getBlock('latest')).timestamp;

    if (blockTimestamp < timeoutPoint) {
      await increaseTime(timeoutPoint - blockTimestamp);
    }
    defendandTx = await verifier.resolveTrueClaim(correctCommitmentRoot, {from: defender});

    // Check logs
    assert.equal(defendandTx.logs.length, 1, 'trigger one event');
    assert.equal(defendandTx.logs[0].event, 'TrueClaim', 'Should match event name.');
    assert.equal(defendandTx.logs[0].args.claimKey, correctCommitmentRoot, 'defendantRoot should match.');

    let verifierBalanceAfter = await web3.eth.getBalance(verifier.address);
    defenderBalanceAfter = await web3.eth.getBalance(defender);

    assert.equal(verifierBalanceBefore - verifierBalanceAfter, stake, 'Verifier must transfered claimer stake to a client.');
    assert((BigInt(defenderBalanceAfter) - BigInt(defenderBalanceBefore)) * 10n >= BigInt(stake) * BigInt('9'), "The defender must receive claimers stake due to specific client implementation, to compare was used 90% of the amount because of the gas fees.");// -> not client-generic this client specific transfers this stake to defender

    // Check claim was deleted
    claim = await verifier.getClaim(correctCommitmentRoot);
    _checkClaimRemoved(claim);

  });

  it("Falsify incorrect claim - go to Bottom and win dispute by timeout", async () => {

    const image = await challenger.getIncorrectImage(); // probably put seed as a parameter
    const imageHash = await challenger.computeImageHash(image);
    const initialStateHash = await challenger.computeInitialStateHash(seed);
    const correctCommitmentRoot = await challenger.getCommitmentRoot();
    let disagreementPoint = 0;
    let disputeDepth = 0;

    const defendantRoot = await challenger.getCommitmentRoot(false); // the claim initially was incorrect, so the root is incorrect too
    const defender = accounts[1];
    const prosecutor = accounts[2];
    let defendandTx = await client.makeClaim(seed, image, defendantRoot, {from: defender, value: stake});
    // Starting dispute
    let prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    // PS. prosector should listen for NewClaim events and compute and check results to decide to open the dispute
    let actionTimestamp;
    let prosecutorTx = await falsifier.newDispute(defendantRoot, prosecutorNode, {from: prosecutor, value: stake});

    _checkLogsNewDispute(prosecutorTx, defendantRoot, correctCommitmentRoot);

    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(correctCommitmentRoot);
    actionTimestamp = dispute.lastActionTimestamp;
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, defendantRoot, prosecutor, prosecutorNode);

    // Step2. defendant calls reveal with args: prosecutorRoot, defendantNode, proofLeft, proofRight, finalState
    // PS. defendant should listen for NewDispute events and check if there is sense to defend claim
    let defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
    let proofLeft = await challenger.getProofByIndex(0, false);
    const finalStateIndex = (await challenger.finalState(false))[0];
    let proofRight = await challenger.getProofByIndex(finalStateIndex, false);
    const finalState = (await challenger.finalState(false))[1];

    defendandTx = await falsifier.reveal(correctCommitmentRoot, defendantNode, proofLeft, proofRight, finalState, {from: defender});
    // update
    let goRight = _goRight(prosecutorNode, defendantNode);
    disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
    disputeDepth++;
    _checkLogsReveal(defendandTx, correctCommitmentRoot, finalState);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should match.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 2, "Dispute state should be 'ProsecutorTurn'.");
    assert.equal(BigInt(dispute.numberOfSteps), BigInt(proofRight.path), "numberOfSteps should be equal path to the final leave.");
    assert.equal(dispute.goRight, goRight, "prosecutor and defendant nodes matched incorrect.");
    assert.equal(dispute.disagreementPoint, disagreementPoint, "First disagreementPoint update.");
    assert.equal(dispute.depth, disputeDepth, "We should go deeper into the tree to the next level, depth should be 1 now.");

    // Challenge iterations
    for (let i = 0; i < DEFAULT_MAX_TREE_DEPTH - 2; i++) {
      //Step3. prosecutor calls prosecutorRespond with args: prosecutorRoot, prosecutorNode(next level, before calling check the dispute.goRight to define left or right node to use)
      //PS. prosector should listen for Reveal event and also checks the timeout if the event doesn't appear in the
      prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
      prosecutorTx = await falsifier.prosecutorRespond(correctCommitmentRoot, prosecutorNode, {from: prosecutor});
      _checkLogsProsecutorRespond(prosecutorTx, correctCommitmentRoot);

      // Check ClaimFalsifier state changes
      dispute = await falsifier.getDispute(correctCommitmentRoot);
      assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
      //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
      actionTimestamp = dispute.lastActionTimestamp;
      assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

      //Step4. defendant calls defendantRespond with args: prosecutorRoot, defendantNode
      defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
      defendandTx = await falsifier.defendantRespond(correctCommitmentRoot, defendantNode, {from: defender});
      // update
      goRight = _goRight(prosecutorNode, defendantNode);
      disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
      disputeDepth++;
      _checkLogsDefendantRespond(defendandTx, correctCommitmentRoot);

      // Check ClaimFalsifier state changes
      dispute = await falsifier.getDispute(correctCommitmentRoot);
      assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
      //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
      actionTimestamp = dispute.lastActionTimestamp;
      assert.equal(dispute.goRight, goRight, "prosecutor and defendant nodes matched incorrect.");
      assert.equal(dispute.disagreementPoint, disagreementPoint, "disagreementPoint update.");
      assert.equal(dispute.depth, disputeDepth, "We should go deeper into the tree to the next level.");
      assert.equal(dispute.state, 2, "should be 'ProsecutorTurn'.");
    }

    //Step5. prosecutor respond last time
    prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
    prosecutorTx = await falsifier.prosecutorRespond(correctCommitmentRoot, prosecutorNode, {from: prosecutor});
    _checkLogsProsecutorRespond(prosecutorTx, correctCommitmentRoot);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

    //Step6. defendant respond last time
    defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
    defendandTx = await falsifier.defendantRespond(correctCommitmentRoot, defendantNode, {from: defender});
    // update
    goRight = _goRight(prosecutorNode, defendantNode);
    disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
    disputeDepth++;
    _checkLogsBottomReached(defendandTx, correctCommitmentRoot);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.goRight, goRight, "left nodes of the prosecutor and defendant nodes should be equal.");
    assert.equal(dispute.firstDivergentStateHash, goRight ? defendantNode.right : defendantNode.left, "The divergent state hash.");
    assert.equal(dispute.disagreementPoint, disagreementPoint, "Last disagreementPoint update.");
    assert.equal(dispute.depth, DEFAULT_MAX_TREE_DEPTH, "We reached the bottom. The depth should be equal MAX_TREE_DEPTH.");
    assert.equal(dispute.state, 4, "should be 'Bottom'.");

    // Step7. defendant reveals bottom (but as the claim was incorrect he is not able to do it)
    const proof = await challenger.getProofByIndex(disagreementPoint - 1, false);
    const defendantStateBeforeDisagreementPoint = await challenger.getStateByIndex(disagreementPoint - 1, false);
    try {
      defendandTx = await falsifier.defendantRevealBottom(correctCommitmentRoot, proof, defendantStateBeforeDisagreementPoint, {from: defender});
    } catch (e) {
      assert.equal(e.reason, "Next computed state is not the one commited to.");
    }

    // Step8. prosecutor wins by timeout.
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    const timeoutPoint = parseInt(dispute.deadLine);
    const blockTimestamp = (await web3.eth.getBlock('latest')).timestamp;
    if (blockTimestamp < timeoutPoint) {
      await increaseTime(timeoutPoint - blockTimestamp);
    }

    // Balances before falsifying by timeout
    let prosecutorBalanceBefore = await web3.eth.getBalance(prosecutor);
    let falsifierBalanceBefore = await web3.eth.getBalance(falsifier.address);
    let verifierBalanceBefore = await web3.eth.getBalance(verifier.address);

    prosecutorTx = await falsifier.timeout(correctCommitmentRoot, {from: prosecutor});
    // Check logs
    assert.equal(prosecutorTx.receipt.rawLogs.length, 1, 'trigger one event');
    assert.equal(prosecutorTx.receipt.rawLogs[0].address, verifier.address, "Make sure that the event is from ClaimVerifier.");
    assert.equal(prosecutorTx.receipt.rawLogs[0].topics[0], web3.utils.sha3('FalseClaim(bytes32)'), 'Should match the signature of the FalseClaim event.');
    assert.equal(prosecutorTx.receipt.rawLogs[0].data, defendantRoot, 'defendantRoot should match.');

    // Check balances to ensure that prosecutor received his stake and stake as a reward
    let prosecutorBalanceAfter = await web3.eth.getBalance(prosecutor);
    assert((BigInt(prosecutorBalanceAfter) - BigInt(prosecutorBalanceBefore)) * 10n >= BigInt(stake) * BigInt('18'), "The prosecutor must receive 2 stakes, to compare was used 90% of the amount because of the gas fees.");

    let falsifierBalanceAfter = await web3.eth.getBalance(falsifier.address);
    assert.equal(falsifierBalanceBefore - falsifierBalanceAfter, stake, 'Falsifier must transfered prosecutor stake to prosecutor.');

    let verifierBalanceAfter = await web3.eth.getBalance(verifier.address);
    assert.equal(verifierBalanceBefore - verifierBalanceAfter, stake, 'Verifier must transfered claimer stake to prosecutor.');

    // Check dispute was deleted
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    _checkDisputeRemoved(dispute);

    // Check claim was deleted
    claim = await verifier.getClaim(defendantRoot);
    _checkClaimRemoved(claim);

  });

  it("Falsify incorrect claim - Left proof root does not match defendant root", async () => {
    const image = await challenger.getIncorrectImage();
    const imageHash = await challenger.computeImageHash(image);
    const initialStateHash = await challenger.computeInitialStateHash(seed);
    let disagreementPoint = 0;
    let disputeDepth = 0;

    const defendantRoot = await challenger.getCommitmentRoot(false);
    const correctCommitmentRoot = await challenger.getCommitmentRoot();

    let defendandTx = await client.makeClaim(seed, image, defendantRoot, {value: stake});
    // Starting dispute
    const prosecutor = accounts[2];
    const defender = accounts[1];
    let prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    let prosecutorTx = await falsifier.newDispute(defendantRoot, prosecutorNode, {from: prosecutor, value: stake});
    // Check logs
    assert.equal(prosecutorTx.logs.length, 1, 'trigger one event');
    assert.equal(prosecutorTx.logs[0].event, 'NewDispute', 'Should match event name.');
    assert.equal(prosecutorTx.logs[0].args.defendantRoot, defendantRoot, 'defendantRoot should match.');
    assert.equal(prosecutorTx.logs[0].args.prosecutorRoot, correctCommitmentRoot, 'prosecutorRoot should match.');

    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(correctCommitmentRoot);
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, defendantRoot, prosecutor, prosecutorNode);

    // Step2. defendant calls reveal with args: prosecutorRoot, defendantNode, proofLeft, proofRight,
    // NEXT STEP calculate proofs and state values for correct computation result
    let defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
    let proofLeft = await challenger.getProofByIndex(0);
    let finalStateIndex = (await challenger.finalState())[0];
    let proofRight = await challenger.getProofByIndex(finalStateIndex);
    let finalState = (await challenger.finalState())[1];
    try {
      defendandTx = await falsifier.reveal(correctCommitmentRoot, defendantNode, proofLeft, proofRight, finalState, {from: defender});
    } catch (e) {
      assert.equal(e.reason, "Left proof root does not match defendant root.")
    }
  });

  it("Falsify incorrect claim - The revealed final state does not produce the image hash submitted in the claim.", async () => {
    const image = await offchainRunnerInstance.project(challenger.listCorrectStates[Math.floor(challenger.listCorrectStates.length / 2 - 1)]);
    const imageHash = await offchainRunnerInstance.imageHash(image);
    let initialStateHash = await offchainRunnerInstance.stateHash(await offchainRunnerInstance.create(seed));
    const correctCommitmentRoot = await challenger.getCommitmentRoot();

    let tx = await client.makeClaim(seed, image, correctCommitmentRoot, {value: stake});
    // Starting dispute
    let prosecutor = accounts[2];
    let defender = accounts[1];
    let prosecutorNode = await challenger.getDisagreementNode(0, 0);
    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    let prosecutorTx = await falsifier.newDispute(correctCommitmentRoot, prosecutorNode, {from: prosecutor, value: stake});
    // Check logs
    assert.equal(prosecutorTx.logs.length, 1, 'trigger one event');
    assert.equal(prosecutorTx.logs[0].event, 'NewDispute', 'Should match event name.');
    assert.equal(prosecutorTx.logs[0].args.defendantRoot, correctCommitmentRoot, 'defendantRoot should match.');
    assert.equal(prosecutorTx.logs[0].args.prosecutorRoot, correctCommitmentRoot, 'prosecutorRoot should match.');
    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(correctCommitmentRoot);
    actionTimestamp = dispute.lastActionTimestamp;
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, correctCommitmentRoot, prosecutor, prosecutorNode);

    // Step2. defendant calls reveal with args: prosecutorRoot, defendantNode, proofLeft, proofRight, finalState
    // NEXT STEP calculate correct proofs and state values
    const proofLeft = await challenger.getProofByIndex(0);
    const finalStateIndex = (await challenger.finalState())[0];
    const proofRight = await challenger.getProofByIndex(finalStateIndex);
    let finalState = (await challenger.finalState())[1];
    try {
      let defendandTx = await falsifier.reveal(correctCommitmentRoot, prosecutorNode, proofLeft, proofRight, finalState, {from: defender});

    } catch (e) {
      assert.equal(e.reason, "The revealed final state does not produce the image hash submitted in the claim.");
    }

  });

  it("Testing timing logic - stepTimeout is expired", async () => {
    // Check all variables
    const step_timeout = await client.getStepTimeout();
    const min_timeout = await verifier.MIN_TIMEOUT();
    const dispute_timeout = await falsifier.DISPUTE_TIMEOUT();

    assert.equal(step_timeout, DEFAULT_STEP_TIMEOUT, "step timeout doesn't match.");
    assert.equal(min_timeout, (DEFAULT_STEP_TIMEOUT * (DEFAULT_MAX_TREE_DEPTH + 2) * 2 * 3), "min_timeout doesn't match.");
    assert.equal(dispute_timeout, DEFAULT_STEP_TIMEOUT * ((DEFAULT_MAX_TREE_DEPTH + 2) * 2), "dispute_timeout doesn't match.");

    const image = await challenger.computeImage(seed);
    const imageHash = await challenger.computeImageHash(image);
    const initialStateHash = await challenger.computeInitialStateHash(seed);

    const correctCommitmentRoot = await challenger.getCommitmentRoot();
    let disagreementPoint = 0;
    let disputeDepth = 0;

    const prosecutorRoot = await challenger.getCommitmentRoot(false); // incorrect root
    let defender = accounts[1];
    let prosecutor = accounts[2];

    // Make claim
    let defendandTx = await client.makeClaim(seed, image, correctCommitmentRoot, {from: defender, value: stake});

    // Starting dispute
    let prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false); // the start point is always 0, 0 - it's rootNode

    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    let actionTimestamp;
    let prosecutorTx = await falsifier.newDispute(correctCommitmentRoot, prosecutorNode, {from: prosecutor, value: stake});

    _checkLogsNewDispute(prosecutorTx, correctCommitmentRoot, prosecutorRoot);

    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(prosecutorRoot);
    actionTimestamp = dispute.lastActionTimestamp;
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, correctCommitmentRoot, prosecutor, prosecutorNode);

    // Imitating defendant doesn't reveal in a time
    await increaseTime(DEFAULT_STEP_TIMEOUT + 1);

    // Ensure that defendant is not able to act anymore after stepTimeout is expired
    try {
      let defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint); // it's 0, 0 - rootNode
      let proofLeft = await challenger.getProofByIndex(0);
      const finalStateIndex = (await challenger.finalState())[0];
      let proofRight = await challenger.getProofByIndex(finalStateIndex);
      let finalState = (await challenger.finalState())[1];

      defendandTx = await falsifier.reveal(prosecutorRoot, defendantNode, proofLeft, proofRight, finalState, {from: defender});
      console.log("WARNING! Timing logic is broken!");
    } catch (e) {
      assert.equal(e.reason, "Time to make an action is expired. The dispute is won by an opponent.", "Wrong revert reason.");
    }

    // Ensure that timeout can not be called while disputeTimeout is not expired
    try {
      prosecutorTx = await falsifier.timeout(prosecutorRoot, {from: prosecutor});
      console.log("Timing logic is broken");
    } catch (e) {
      assert.equal(e.reason, "This dispute can not be timeout out at this moment", "Wrong reason for timeout");
    }

    // Main action. Defendant is not able to act after he missed step time.
    // Prosecutor has already won the dispute. But! he must to send tx (call timeout) at the same block as disputeTimeout is expired, because he has advantage against cheating, but he can lose it.
    // The advantage is the dispute.deadLine and it can be as close as one block. What can bad defendant do? Bad-defendant can open newDispute against his own claim and win this dispute as a prosecutor (lose it as defendant) and try to call timeout before the good prosecutor did it, but he has the dispute.deadLine bigger than good prosecutor. So, good prosecutor MUST be the first and look close to his dispute.deadLine.
    // Prosecutor waits his disputeTimeout and wins dispute by calling timeout.

    // Balances before falsifying by timeout
    let prosecutorBalanceBefore = await web3.eth.getBalance(prosecutor);
    let falsifierBalanceBefore = await web3.eth.getBalance(falsifier.address);
    let verifierBalanceBefore = await web3.eth.getBalance(verifier.address);

    // Jumping to the right point in time
    const currentBlockTime = parseInt((await web3.eth.getBlock('latest')).timestamp);
    if (currentBlockTime < parseInt(dispute.deadLine)) {
      await increaseTime(parseInt(dispute.deadLine) - currentBlockTime);
    }

    prosecutorTx = await falsifier.timeout(prosecutorRoot, {from: prosecutor});

    // Check logs
    assert.equal(prosecutorTx.receipt.rawLogs.length, 1, 'trigger one event');
    assert.equal(prosecutorTx.receipt.rawLogs[0].address, verifier.address, "Make sure that the event is from ClaimVerifier.");
    assert.equal(prosecutorTx.receipt.rawLogs[0].topics[0], web3.utils.sha3('FalseClaim(bytes32)'), 'Should match the signature of the FalseClaim event.');
    assert.equal(prosecutorTx.receipt.rawLogs[0].data, correctCommitmentRoot, 'defendantRoot should match.');

    // Check balances to ensure that prosecutor received his stake and stake as a reward
    let prosecutorBalanceAfter = await web3.eth.getBalance(prosecutor);
    assert((BigInt(prosecutorBalanceAfter) - BigInt(prosecutorBalanceBefore)) * 10n >= BigInt(stake) * BigInt('18'), "The prosecutor must receive 2 stakes, to compare was used 90% of the amount because of the gas fees.");

    let falsifierBalanceAfter = await web3.eth.getBalance(falsifier.address);
    assert.equal(falsifierBalanceBefore - falsifierBalanceAfter, stake, 'Falsifier must transfered prosecutor stake to prosecutor.');

    let verifierBalanceAfter = await web3.eth.getBalance(verifier.address);
    assert.equal(verifierBalanceBefore - verifierBalanceAfter, stake, 'Verifier must transfered claimer stake to prosecutor.');

    // Check dispute was deleted
    dispute = await falsifier.getDispute(prosecutorRoot);
    _checkDisputeRemoved(dispute);

    // Check claim was deleted
    claim = await verifier.getClaim(correctCommitmentRoot);
    _checkClaimRemoved(claim);

  });

  it("Testing timing logic - not able to start dispute anymore", async () => {
    const image = await challenger.computeImage(seed);
    const imageHash = await challenger.computeImageHash(image);
    const initialStateHash = await challenger.computeInitialStateHash(seed);

    const correctCommitmentRoot = await challenger.getCommitmentRoot();
    let disagreementPoint = 0;
    let disputeDepth = 0;

    const prosecutorRoot = await challenger.getCommitmentRoot(false); // incorrect root
    let defender = accounts[1];
    let prosecutor = accounts[2];

    // Make claim
    let defendandTx = await client.makeClaim(seed, image, correctCommitmentRoot, {from: defender, value: stake});

    // Starting dispute
    let prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false); // the start point is always 0, 0 - it's rootNode

    let claim = await verifier.getClaim(correctCommitmentRoot);

    // Jump in a point of time where there is no ability to start dispute anymore
    await increaseTime(parseInt(claim.timeout / 2) + 1);

    // Prosecutor tries to call newDispute with args: defendantRoot and prosecutorNode
    try {
      let prosecutorTx = await falsifier.newDispute(correctCommitmentRoot, prosecutorNode, {from: prosecutor, value: stake});
      console.log("WARNING! Timing logic is broken");
    } catch (e) {
      assert.equal(e.reason, "There is not enough time left for a dispute.", "Incorrect revert reason.");
    }

    await increaseTime(parseInt(claim.timeout / 2) + 1);
    defendandTx = await verifier.resolveTrueClaim(correctCommitmentRoot);
    // Check logs
    assert.equal(defendandTx.logs.length, 1, 'trigger one event'); // Probably we want to test also the case when callback failed and there is second event CallbackFailed
    assert.equal(defendandTx.logs[0].event, 'TrueClaim', 'Should match event name.');
    assert.equal(defendandTx.logs[0].args.claimKey, correctCommitmentRoot, 'claimKey should match.');

    // Checking only verifier balance. Skipped checking the client balance, because the subgoal is to make unit test generic for any client implementation.
    let balance = await web3.eth.getBalance(verifier.address);
    assert.equal(balance, 0, "Verifier should send stake to Client. Make sure Client contract has receive function.");

    // Checking the claim was deleted
    claim = await verifier.getClaim(correctCommitmentRoot);
    _checkClaimRemoved(claim);

  });

  it("Testing timing logic - Showcase when prosecutor can miss won case (a.k.a. frontrunning)", async () => {

    const image = await challenger.getIncorrectImage(); // probably put seed as a parameter
    const imageHash = await challenger.computeImageHash(image);
    const initialStateHash = await challenger.computeInitialStateHash(seed);
    const correctCommitmentRoot = await challenger.getCommitmentRoot();
    let disagreementPoint = 0;
    let disputeDepth = 0;

    const defendantRoot = await challenger.getCommitmentRoot(false); // the claim initially was incorrect, so the root is incorrect too
    const defender = accounts[1];
    const prosecutor = accounts[2];
    let defendandTx = await client.makeClaim(seed, image, defendantRoot, {from: defender, value: stake});
    // Starting dispute
    let prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
    // Step1. prosecutor calls newDispute with args: defendantRoot and prosecutorNode
    // PS. prosector should listen for NewClaim events and compute and check results to decide to open the dispute
    let actionTimestamp;
    let prosecutorTx = await falsifier.newDispute(defendantRoot, prosecutorNode, {from: prosecutor, value: stake});

    _checkLogsNewDispute(prosecutorTx, defendantRoot, correctCommitmentRoot);

    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(correctCommitmentRoot);

    actionTimestamp = dispute.lastActionTimestamp;
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, defendantRoot, prosecutor, prosecutorNode);

    // Step2. Defendant sees that there is dispute with correct values and he understands that he will lose it.
    // Defendant should call reveal because otherway he will not be able to act and automatic lose by stepTimeout.
    // Before defendant calls reveal, he calls newDispute against his own claim (values doesn't matter).

    // Step 2.1 Defendant is trying to frontrun and calls newDispute with args: defendantRoot and prosecutorNode
    const randomNode = await challenger.getDisagreementNode(4, 5);
    const fakeRoot = web3.utils.keccak256(randomNode.left + randomNode.right.replace('0x',''));

    defendandTx = await falsifier.newDispute(defendantRoot, randomNode, {from: defender, value: stake});
    _checkLogsNewDispute(defendandTx, defendantRoot, fakeRoot);

    // Check ClaimFalsifier state changes
    let fakeDispute = await falsifier.getDispute(fakeRoot);
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(fakeDispute, zeroNode, defendantRoot, defender, randomNode);

    // Step 2.2 Defendant calls reveal

    let defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
    let proofLeft = await challenger.getProofByIndex(0, false);
    const finalStateIndex = (await challenger.finalState(false))[0];
    let proofRight = await challenger.getProofByIndex(finalStateIndex, false);
    const finalState = (await challenger.finalState(false))[1];

    defendandTx = await falsifier.reveal(correctCommitmentRoot, defendantNode, proofLeft, proofRight, finalState, {from: defender});
    // update
    let goRight = _goRight(prosecutorNode, defendantNode);
    disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
    disputeDepth++;
    _checkLogsReveal(defendandTx, correctCommitmentRoot, finalState);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should match.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 2, "Dispute state should be 'ProsecutorTurn'.");
    assert.equal(BigInt(dispute.numberOfSteps), BigInt(proofRight.path), "numberOfSteps should be equal path to the final leave.");
    assert.equal(dispute.goRight, goRight, "prosecutor and defendant nodes matched incorrect.");
    assert.equal(dispute.disagreementPoint, disagreementPoint, "First disagreementPoint update.");
    assert.equal(dispute.depth, disputeDepth, "We should go deeper into the tree to the next level, depth should be 1 now.");

    // Challenge iterations
    for (let i = 0; i < DEFAULT_MAX_TREE_DEPTH - 2; i++) {
      //Step3. prosecutor calls prosecutorRespond with args: prosecutorRoot, prosecutorNode(next level, before calling check the dispute.goRight to define left or right node to use)
      //PS. prosector should listen for Reveal event and also checks the timeout if the event doesn't appear in the
      prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
      prosecutorTx = await falsifier.prosecutorRespond(correctCommitmentRoot, prosecutorNode, {from: prosecutor});
      _checkLogsProsecutorRespond(prosecutorTx, correctCommitmentRoot);

      // Check ClaimFalsifier state changes
      dispute = await falsifier.getDispute(correctCommitmentRoot);
      assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
      //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
      actionTimestamp = dispute.lastActionTimestamp;
      assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

      //Step4. defendant calls defendantRespond with args: prosecutorRoot, defendantNode
      defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
      defendandTx = await falsifier.defendantRespond(correctCommitmentRoot, defendantNode, {from: defender});
      // update
      goRight = _goRight(prosecutorNode, defendantNode);
      disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
      disputeDepth++;
      _checkLogsDefendantRespond(defendandTx, correctCommitmentRoot);

      // Check ClaimFalsifier state changes
      dispute = await falsifier.getDispute(correctCommitmentRoot);
      assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
      //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
      actionTimestamp = dispute.lastActionTimestamp;
      assert.equal(dispute.goRight, goRight, "prosecutor and defendant nodes matched incorrect.");
      assert.equal(dispute.disagreementPoint, disagreementPoint, "disagreementPoint update.");
      assert.equal(dispute.depth, disputeDepth, "We should go deeper into the tree to the next level.");
      assert.equal(dispute.state, 2, "should be 'ProsecutorTurn'.");
    }

    //Step5. prosecutor respond last time
    prosecutorNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint);
    prosecutorTx = await falsifier.prosecutorRespond(correctCommitmentRoot, prosecutorNode, {from: prosecutor});
    _checkLogsProsecutorRespond(prosecutorTx, correctCommitmentRoot);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.state, 3, "should be 'DefendantTurn'.");

    //Step6. defendant respond last time
    defendantNode = await challenger.getDisagreementNode(disputeDepth, disagreementPoint, false);
    defendandTx = await falsifier.defendantRespond(correctCommitmentRoot, defendantNode, {from: defender});
    // update
    goRight = _goRight(prosecutorNode, defendantNode);
    disagreementPoint = _updateDisagreementPoint(disagreementPoint, goRight);
    disputeDepth++;
    _checkLogsBottomReached(defendandTx, correctCommitmentRoot);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    assert.deepEqual(dispute.defendantNode, arraifyAsEthers(defendantNode), "defendantNode should be changed.");
    //assert(dispute.lastActionTimestamp > actionTimestamp, "timestamp should be updated.");
    actionTimestamp = dispute.lastActionTimestamp;
    assert.equal(dispute.goRight, goRight, "left nodes of the prosecutor and defendant nodes should be equal.");
    assert.equal(dispute.firstDivergentStateHash, goRight ? defendantNode.right : defendantNode.left, "The divergent state hash.");
    assert.equal(dispute.disagreementPoint, disagreementPoint, "Last disagreementPoint update.");
    assert.equal(dispute.depth, DEFAULT_MAX_TREE_DEPTH, "We reached the bottom. The depth should be equal MAX_TREE_DEPTH.");
    assert.equal(dispute.state, 4, "should be 'Bottom'.");

    // Step7. defendant reveals bottom (but as the claim was incorrect he is not able to do it)
    const proof = await challenger.getProofByIndex(disagreementPoint - 1, false);
    const defendantStateBeforeDisagreementPoint = await challenger.getStateByIndex(disagreementPoint - 1, false);
    try {
      defendandTx = await falsifier.defendantRevealBottom(correctCommitmentRoot, proof, defendantStateBeforeDisagreementPoint, {from: defender});
    } catch (e) {
      assert.equal(e.reason, "Next computed state is not the one commited to.");
    }

    // Step8. prosecutor should win by timeout when dispute deadLine expires.
    // Jumping to right point in time
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    const timeoutPoint = parseInt(dispute.deadLine);
    const blockTimestamp = (await web3.eth.getBlock('latest')).timestamp;
    if (blockTimestamp < timeoutPoint) {
      await increaseTime(timeoutPoint - blockTimestamp + 1);
    }

    // Balances before frontrunning
    const prosecutorBalanceBefore = await web3.eth.getBalance(prosecutor);
    const defendantBalanceBefore = await web3.eth.getBalance(defender);
    const falsifierBalanceBefore = await web3.eth.getBalance(falsifier.address);
    const verifierBalanceBefore = await web3.eth.getBalance(verifier.address);

    // Step 8.1. Defendant with his fake dispute is trying to be first in a block

    defendandTx = await falsifier.timeout(fakeRoot, {from: defender, gasPrice: 500000000000});

    prosecutorTx = await falsifier.timeout(correctCommitmentRoot, {from: prosecutor, gasPrice: 300000000000});

    // Balances after frontrunning
    const prosecutorBalanceAfter = await web3.eth.getBalance(prosecutor);
    const defendantBalanceAfter = await web3.eth.getBalance(defender);
    const falsifierBalanceAfter = await web3.eth.getBalance(falsifier.address);
    const verifierBalanceAfter = await web3.eth.getBalance(verifier.address);

    // Frontrunning was successfull - checking balances:
    assert.equal(verifierBalanceBefore - verifierBalanceAfter, stake, "Verifier should send stake to winner.");
    assert.equal(falsifierBalanceBefore - falsifierBalanceAfter, stake, "Falsifier should send stake to winner.");
    assert(prosecutorBalanceBefore > prosecutorBalanceAfter, "Prosecutor loses frontrunning.");
    assert(defendantBalanceBefore < defendantBalanceAfter, "Defendant wins frontrunning.");

    // Check logs
    assert.equal(defendandTx.receipt.rawLogs.length, 1, 'trigger one event');
    assert.equal(defendandTx.receipt.rawLogs[0].address, verifier.address, "Make sure that the event is from ClaimVerifier.");
    assert.equal(defendandTx.receipt.rawLogs[0].topics[0], web3.utils.sha3('FalseClaim(bytes32)'), 'Should match the signature of the FalseClaim event.');
    assert.equal(defendandTx.receipt.rawLogs[0].data, defendantRoot, 'defendantRoot should match.');

    // Check fake dispute was deleted
    fakeDispute = await falsifier.getDispute(fakeRoot);
    _checkDisputeRemoved(fakeDispute);

    // Check claim was deleted
    claim = await verifier.getClaim(defendantRoot);
    _checkClaimRemoved(claim);

    // Check initial dispute was deleted
    dispute = await falsifier.getDispute(correctCommitmentRoot);
    _checkDisputeRemoved(dispute);

    prosecutorTx = await falsifier.requestStuckStake({from: prosecutor});

    const prosecutorBalanceAfterRequest = await web3.eth.getBalance(prosecutor);
    assert(prosecutorBalanceAfterRequest - prosecutorBalanceAfter > stake * 0.95, "Prosecutor should receive stuck stake.");

  });

  it("Testing timing logic - fake claim -> stuckDispute with correctRoot for another claim", async () => {

    const initialSeed = structGenerator.genSeed();
    const fakeSeed = structGenerator.genSeed();

    const initialChallenger = new Challenger.default(offchainRunnerInstance, initialSeed);
    const fakeChallenger = new Challenger.default(offchainRunnerInstance, fakeSeed);

    // STEP1. Bad actor makes fakeClaim, for example with correct values

    // values for fake seed
    const fakeImage = await offchainRunnerInstance.run(fakeSeed);
    const fakeImageHash = await fakeChallenger.computeImageHash(fakeImage);
    const fakeCorrectCommitmentRoot = await fakeChallenger.getCommitmentRoot();
    let disagreementPoint = 0;
    let disputeDepth = 0;

    // values for initial seed
    const initialCorrectCommitmentRoot = await initialChallenger.getCommitmentRoot();
    const initialIncorrectCommitmentRoot = await initialChallenger.getCommitmentRoot(false);
    const initialIncorrectImage = await initialChallenger.getIncorrectImage();

    // Actors
    const badActorAcc1 = accounts[1];
    const badActorAcc2 = accounts[2];
    const goodActor = accounts[3];

    let badActor1Tx = await client.makeClaim(fakeSeed, fakeImage, fakeCorrectCommitmentRoot, {from: badActorAcc1, value: stake});

    // STEP2. Bad actor starts dispute against his own fake claim (e.i. correct) using the computation root from the initial seed
    let initialNode = await initialChallenger.getDisagreementNode(disputeDepth, disagreementPoint);

    let badActor2Tx = await falsifier.newDispute(fakeCorrectCommitmentRoot, initialNode, {from: badActorAcc2, value: stake});

    _checkLogsNewDispute(badActor2Tx, fakeCorrectCommitmentRoot, initialCorrectCommitmentRoot);

    // Check ClaimFalsifier state changes
    let dispute = await falsifier.getDispute(initialCorrectCommitmentRoot);

    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, fakeCorrectCommitmentRoot, badActorAcc2, initialNode);

    // STEP3. Fake dispute state is Opened now, so no other actions are needed.
    // badActorAcc1 don't do anything and after STEP_TIMEOUT is expired badActorAcc2 won this dispute.
    // And after dispute timeout is expired badActorAcc2 can timeout, but he wouldn't do it.
    // And badActorAcc1 will just resolve true claim. If anyone tries to dispute, badActorAcc1
    // will win it, because the claim (fake one) is correct.

    // Jumping in a timepoint where badActorAcc1 is able to resolve true claim
    const min_timeout = await verifier.MIN_TIMEOUT();
    await increaseTime(parseInt(min_timeout));

    badActor1Tx = await verifier.resolveTrueClaim(fakeCorrectCommitmentRoot, {from: badActorAcc1});

    // After this badActorAcc1 received his stake, the only locked stake is by badActorAcc2 for the dispute

    // STEP4. Now bad actor is able to make claim with incorrect results
    badActor1Tx = await client.makeClaim(initialSeed, initialIncorrectImage, initialIncorrectCommitmentRoot, {from: badActorAcc1, value: stake});


    // STEP5. Good actor is not able to open dispute with correct result while fake dispute
    // is not removed from ClaimFalsifier.
    try {
      let goodActorTx = await falsifier.newDispute(initialIncorrectCommitmentRoot, initialNode, {from: goodActor, value: stake});
      console.log("WARNING! Something broken");
    } catch (e) {
      assert.equal(e.reason, "Dispute already exists.", "Wrong revert reason.");
    }
    // Previously, before removeStuckDispute function was added at this point we can do
    // almost nothing to falsify the incorrect claim. (It's not 100% True, we can try
    // to build an array of computation steps in a way for example, that the terminal
    // state is incorrect and on top of the state list build a tree and try to dispute
    // with incorrect values but with the goal to reach the bottom and falsify the claim.
    // But now challenger doesn't have such functionality - probably worth TODO, and average user
    // is not able to deal with such cases).
    // The Pros here was that this "stuck dispute" means also "stuck stake" and bad actor
    // loses the stake with no way to receive it. And now bad actor is able to receive stake
    // and in this way he has more possibilities to spam EMO. This is the Cons because we
    // want good actors to be able not to stuck if they were frontrunned, and also to have free storage.

    //STEP6. Try to use removeStuckDispute
    goodActorTx = await falsifier.removeStuckDispute(initialCorrectCommitmentRoot, {from: goodActor});

    dispute = await falsifier.getDispute(initialCorrectCommitmentRoot);
    _checkDisputeRemoved(dispute);

    //STEP7. good actor starts newDispute
    goodActorTx = await falsifier.newDispute(initialIncorrectCommitmentRoot, initialNode, {from: goodActor, value: stake});

    dispute = await falsifier.getDispute(initialCorrectCommitmentRoot);
    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, initialIncorrectCommitmentRoot, goodActor, initialNode);

    // Now we skip the whole challenge game - it's obviously that good actor will successfully
    // win the dispute and falsify claim. We replace it like defendant didn't respond at time.

    // Jump in point of time where we can falsify dispute
    let now = (await web3.eth.getBlock('latest')).timestamp;
    await increaseTime(parseInt(dispute.deadLine) - parseInt(now) + 1);

    goodActorTx = await falsifier.timeout(initialCorrectCommitmentRoot, {from: goodActor});
    dispute = await falsifier.getDispute(initialCorrectCommitmentRoot);
    _checkDisputeRemoved(dispute);

    let claim = await verifier.getClaim(initialIncorrectCommitmentRoot);
    _checkClaimRemoved(claim);

    // After all ClaimFalsifier changes the bad actors wouldn't behave like above.
    // Let's imitate their behaviour now when they have requestStuckStake function.
    // Repeating all the process above, but making initial claim right after fake dispute creation.

    const initialSeed2 = structGenerator.genSeed();
    const fakeSeed2 = structGenerator.genSeed();

    const initialChallenger2 = new Challenger.default(offchainRunnerInstance, initialSeed2);
    const fakeChallenger2 = new Challenger.default(offchainRunnerInstance, fakeSeed2);

    // values for fake seed
    const fakeImage2 = await offchainRunnerInstance.run(fakeSeed2);
    const fakeImageHash2 = await fakeChallenger2.computeImageHash(fakeImage2);
    const fakeCorrectCommitmentRoot2 = await fakeChallenger2.getCommitmentRoot();

    // values for initial seed
    const initialCorrectCommitmentRoot2 = await initialChallenger2.getCommitmentRoot();
    const initialIncorrectCommitmentRoot2 = await initialChallenger2.getCommitmentRoot(false);
    const initialIncorrectImage2 = await initialChallenger2.getIncorrectImage();

    //STEP1. make fake claim
    badActor1Tx = await client.makeClaim(fakeSeed2, fakeImage2, fakeCorrectCommitmentRoot2, {from: badActorAcc1, value: stake});

    // STEP2. Bad actor starts dispute against his own fake claim (e.i. correct) using the computation root from the initial seed
    let initialNode2 = await initialChallenger2.getDisagreementNode(disputeDepth, disagreementPoint);

    badActor2Tx = await falsifier.newDispute(fakeCorrectCommitmentRoot2, initialNode2, {from: badActorAcc2, value: stake});

    _checkLogsNewDispute(badActor2Tx, fakeCorrectCommitmentRoot2, initialCorrectCommitmentRoot2);

    // Check ClaimFalsifier state changes
    dispute = await falsifier.getDispute(initialCorrectCommitmentRoot2);

    _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, fakeCorrectCommitmentRoot2, badActorAcc2, initialNode2);

    // STEP3. The same, but bad actor makes his initial claim immidiately
    badActor1Tx = await client.makeClaim(initialSeed2, initialIncorrectImage2, initialIncorrectCommitmentRoot2, {from: badActorAcc1, value: stake});

    // STEP4. Now there is no way for good actor to removeStuckDispute until its deadLine + (MAX_TREE_DEPTH * STEP_TIMEOUT)
    // But the bad actor is able to wait deadLine and then timeout his fake - this will allow him to receive 2 stakes, but
    // the stake that is for initial claim he will lose if good actor opens dispute. But if he will not timeout
    // after deadLine he will be losing his stake partially for fake dispute each STEP_TIMEOUT and he has no idea, if
    // someone tries to falsify. For good actors it doesn't matter what bad actor will do,
    // good actor should watch for FalseClaim event and check if fakeCorrectCommitmentRoot matches claimKey -> call newDispute,
    // if no event until deadLine + (MAX_TREE_DEPTH * STEP_TIMEOUT) -> removeStuckDispute -> newDispute

    now = (await web3.eth.getBlock('latest')).timestamp;
    await increaseTime((parseInt(dispute.deadLine) + parseInt(DEFAULT_MAX_TREE_DEPTH * DEFAULT_STEP_TIMEOUT)) - parseInt(now) + 1);
    goodActorTx = await falsifier.removeStuckDispute(initialCorrectCommitmentRoot2, {from: goodActor});
    goodActorTx = await falsifier.newDispute(initialIncorrectCommitmentRoot2, initialNode2, {from: goodActor, value: stake});

    // Again we assume that bad actor doesn't try to defendant, he lose dispute anyway
    // Jumping at timeout time
    dispute = await falsifier.getDispute(initialCorrectCommitmentRoot2);
    now = (await web3.eth.getBlock('latest')).timestamp;
    await increaseTime(parseInt(dispute.deadLine) - parseInt(now) + 1);

    // Make sure that bad actor is not able to resolve true claim at this point of time
    try {
      badActor2Tx = await verifier.resolveTrueClaim(initialIncorrectCommitmentRoot2, {from: badActorAcc2});
      console.log("WARNING! Timing logic is broken.");
    } catch (e) {
      assert.equal(e.reason, "Too early to resolve.", "Wrong revert reason.");
    }

    // Falsify claim
    goodActorTx = await falsifier.timeout(initialCorrectCommitmentRoot2, {from: goodActor});

    // Check dispute was deleted
    dispute = await falsifier.getDispute(initialCorrectCommitmentRoot2);
    _checkDisputeRemoved(dispute);

    // Check claim was deleted
    claim = await verifier.getClaim(initialIncorrectCommitmentRoot2);
    _checkClaimRemoved(claim);

    // Bad actor have already lost at this point 2 stakes and he wants just to receive 1 stake
    // So, he resolves true dispute
    claim = await verifier.getClaim(fakeCorrectCommitmentRoot2);
    now = (await web3.eth.getBlock('latest')).timestamp;
    await increaseTime(parseInt(claim.timeout) + parseInt(claim.claimTime) - parseInt(now) + 1);

    badActor1Tx = await verifier.resolveTrueClaim(fakeCorrectCommitmentRoot2, {from: badActorAcc1});

    // Check logs
    assert.equal(badActor1Tx.logs.length, 1, 'trigger one event'); // Probably we want to test also the case when callback failed and there is second event CallbackFailed
    assert.equal(badActor1Tx.logs[0].event, 'TrueClaim', 'Should match event name.');
    assert.equal(badActor1Tx.logs[0].args.claimKey, fakeCorrectCommitmentRoot2, 'claimKey should match.');

    // Check claim was deleted
    claim = await verifier.getClaim(fakeCorrectCommitmentRoot2);
    _checkClaimRemoved(claim);

  });

});

function _checkLogsNewDispute(prosecutorTx, defendantRoot, prosecutorRoot) {
  assert.equal(prosecutorTx.logs.length, 1, 'trigger one event');
  assert.equal(prosecutorTx.logs[0].event, 'NewDispute', 'Should match event name.');
  assert.equal(prosecutorTx.logs[0].args.defendantRoot, defendantRoot, 'defendantRoot should match.');
  assert.equal(prosecutorTx.logs[0].args.prosecutorRoot, prosecutorRoot, 'prosecutorRoot should match.');
}

function _checkLogsReveal(defendandTx, prosecutorRoot, finalState) {
  assert.equal(defendandTx.logs.length, 1, 'trigger one event');
  assert.equal(defendandTx.logs[0].event, 'Reveal', 'Should match event name.');
  assert.equal(defendandTx.logs[0].args.prosecutorRoot, prosecutorRoot, 'prosecutorRoot should match.');
  //assert.deepEqual(defendandTx.logs[0].args.finalState, arraifyAsEthers(finalState), 'finalState should match.'); TODO
}

function _checkLogsProsecutorRespond(prosecutorTx, prosecutorRoot) {
  assert.equal(prosecutorTx.logs.length, 1, 'trigger one event');
  assert.equal(prosecutorTx.logs[0].event, "ProsecutorResponded", "Should match event name.");
  assert.equal(prosecutorTx.logs[0].args.prosecutorRoot, prosecutorRoot, "prosecutorRoot should match.");
}

function _checkLogsDefendantRespond(defendandTx, prosecutorRoot) {
  assert.equal(defendandTx.logs.length, 1, 'trigger one event');
  assert.equal(defendandTx.logs[0].event, "DefendantResponded", "Should match event name.");
  assert.equal(defendandTx.logs[0].args.prosecutorRoot, prosecutorRoot, "prosecutorRoot should match.");
}

function _checkLogsDefendantWon(defendandTx, prosecutorRoot) {
  assert.equal(defendandTx.logs.length, 1, 'trigger one event');
  assert.equal(defendandTx.logs[0].event, "DefendantWon", "Should match event name.");
  assert.equal(defendandTx.logs[0].args.prosecutorRoot, prosecutorRoot, "prosecutorRoot should match.");
}

function _checkLogsBottomReached(defendandTx, prosecutorRoot) {
  assert.equal(defendandTx.logs.length, 1, 'trigger one event');
  assert.equal(defendandTx.logs[0].event, "BottomReached", "Should match event name.");
  assert.equal(defendandTx.logs[0].args.prosecutorRoot, prosecutorRoot, "prosecutorRoot should match.");
}

function _checkClaimFalsifierStateChangesAfterNewDisputeCall(dispute, zeroNode, defendantRoot, prosecutor, prosecutorNode) {
  assert.equal(dispute.defendantRoot, defendantRoot, "defendantRoot should match.");
  assert.equal(dispute.prosecutor, prosecutor, "prosecutor address should match.");
  assert(dispute.lastActionTimestamp > 0, "timestamp should be set.");
  assert.equal(dispute.numberOfSteps, 0, "numberOfSteps should be 0 here.");
  assert.equal(dispute.disagreementPoint, 0, "disagreementPoint should be 0 here.");
  assert.equal(dispute.firstDivergentStateHash, '0x0000000000000000000000000000000000000000000000000000000000000000', "firstDivergentStateHash shouldn't be set here.");
  assert.equal(dispute.depth, 0, "depth should be 0 here.");
  assert.equal(dispute.goRight, false, "goRight should be default value.");
  assert.deepEqual(dispute.defendantNode, arraifyAsEthers(zeroNode), "defendantNode shouldn't be set up yet.");
  assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers(prosecutorNode), "prosecutorNode should match");
  assert.equal(dispute.state, 1, "Dispute state should be 'Opened'.");
}

function _checkClaimRemoved(claim) {
  assert.equal(claim.timeout, 0, "Claim should be deleted. timeout doesn't match.");
  assert.equal(claim.stake, 0, "Claim should be deleted. stake doesn't match.");
  assert.equal(claim.initialStateHash, "0x0000000000000000000000000000000000000000000000000000000000000000", "Claim should be deleted. initialStateHash doesn't match.");
  assert.equal(claim.imageHash, "0x0000000000000000000000000000000000000000000000000000000000000000", "Claim should be deleted. imageHash doesn't match.");
}

function _checkDisputeRemoved(dispute) {
  assert.equal(dispute.defendantRoot, '0x0000000000000000000000000000000000000000000000000000000000000000', "defendantRoot should be 0.");
  assert.equal(dispute.prosecutor, '0x0000000000000000000000000000000000000000', "prosecutor address should be 0.");
  assert.equal(dispute.lastActionTimestamp, '0', "timestamp should be 0.");
  assert.equal(dispute.numberOfSteps, '0', "numberOfSteps should be 0.");
  assert.equal(dispute.disagreementPoint, 0, "disagreementPoint should be 0.");
  assert.equal(dispute.firstDivergentStateHash, '0x0000000000000000000000000000000000000000000000000000000000000000', "firstDivergentStateHash should be 0.");
  assert.equal(dispute.depth, 0, "depth should be 0.");
  assert.equal(dispute.goRight, false, "goRight should be default value.");
  assert.deepEqual(dispute.defendantNode, arraifyAsEthers({left: "0x0000000000000000000000000000000000000000000000000000000000000000", right: "0x0000000000000000000000000000000000000000000000000000000000000000"}), "defendantNode shouldn't be set up.");
  assert.deepEqual(dispute.prosecutorNode, arraifyAsEthers({left: "0x0000000000000000000000000000000000000000000000000000000000000000", right: "0x0000000000000000000000000000000000000000000000000000000000000000"}), "prosecutorNode shouldn't be set up.");
  assert.equal(dispute.state, 0, "Dispute state should be 'DoesNotExist'.");
}

function _goRight(prosecutorNode, defendantNode) {
  return prosecutorNode.left == defendantNode.left;
}

function _updateDisagreementPoint(disagreementPoint, goRight) {
  return disagreementPoint << 1 | (goRight ? 1 : 0);
}

/*
// REQUIRE checks:
// Checking incorrect newDispute inputs
try {
  tx = await falsifier.newDispute('0x0000000000000000000000000000000000000000000000000000000000000000', prosecutorNode, {from: prosecutor, value: stake});
} catch (e) {
  assert.equal(e.reason, "Claim does not exists.");
}
try {
  tx = await falsifier.newDispute(commitmentRoot, prosecutorNode, {from: prosecutor});
} catch (e) {
  assert.equal(e.reason, "Not enough stake sent.");
}
try {
  tx = await falsifier.newDispute(commitmentRoot, prosecutorNode, {from: prosecutor, value: stake});
} catch (e) {
  assert.equal(e.reason, "Dispute already exists.");
}
try {
  await increaseTime(DEFAULT_TIMEOUT);
  tx = await falsifier.newDispute(commitmentRoot, prosecutorNode, {from: prosecutor, value: stake});
} catch (e) {
  assert.equal(e.reason, "There is not enough time left for a dispute.");
}

// Add checks incorrect reveal inputs
*/
