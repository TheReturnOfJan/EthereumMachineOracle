pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

import "./Oracle.sol";
import "./Merkle.sol";

interface ICourt {
  
  enum DisputeState {
    DoesNotExist,
    Opened,
    ProsecutorTurn,
    DefendantTurn,
    Bottom
  }

  // disputeKey is prosecutorRoot
  struct Dispute {
    bytes32 answerKey;
    bytes32 defendantRoot;
    address prosecutor;
    uint lastActionTimestamp;
    uint numberOfSteps;
    uint disagreementPoint;
    bytes32 firstDivergentStateHash;
    uint depth;
    bool goRight;
    Merkle.TreeNode defendantNode;
    Merkle.TreeNode prosecutorNode;
    DisputeState state;
  }

  event NewDispute (
    bytes32 answerKey,
    bytes32 prosecutorRoot
  );

  event Reveal (
    bytes32 disputeKey,
    bytes32 defendantRoot,
    Machine.State finalState
  );

  function oracle()
    external view returns (IOracle);

  function getDispute(
    bytes32 disputeKey
  ) external view returns (Dispute memory);

  function newDispute (
    bytes32 answerKey,
    Merkle.TreeNode calldata prosecutorNode
  ) external payable;

  function reveal (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node,
    Merkle.Proof calldata proofLeft,
    Merkle.Proof calldata proofRight,
    Machine.State calldata finalState
  ) external;

  function prosecutorRespond (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node
  ) external;

  function defendantRespond (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node
  ) external;

  function defendantRevealBottom (
    bytes32 disputeKey,
    Merkle.Proof calldata proof,
    Machine.State calldata state
  ) external;

  function timeout (
    bytes32 disputeKey
  ) external;
}

contract Court is ICourt {

  IOracle public override oracle;
  mapping (bytes32 => Dispute) public disputes;
  uint public STAKE_SIZE;
  uint public MAX_TREE_DEPTH;

  function getDispute (
    bytes32 disputeKey
  ) external view override returns (Dispute memory)
  {
    return disputes[disputeKey];
  }
    
  function newDispute (
    bytes32 answerKey,
    Merkle.TreeNode calldata prosecutorNode
  ) override external payable
  {
    bytes32 prosecutorRoot = Merkle.hash(prosecutorNode);
    Dispute storage dispute = disputes[prosecutorRoot];

    require(msg.value >= STAKE_SIZE, "Not enough stake sent.");
    require(dispute.state == DisputeState.DoesNotExist, "Dispute already exists.");
    require(_answerExists(answerKey), "Answer does not exists.");
    require(_enoughTimeForDispute(answerKey), "There is not enough time left for a dispute.");

    // Workaround
    Merkle.TreeNode memory _node = prosecutorNode;

    dispute.answerKey = answerKey;
    dispute.state = DisputeState.Opened;
    dispute.prosecutor = msg.sender;
    dispute.lastActionTimestamp = now;
    dispute.prosecutorNode = _node;

    emit NewDispute(answerKey, prosecutorRoot);
  }

  // rename to defendanNode
  function reveal (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node,
    Merkle.Proof calldata proofLeft,
    Merkle.Proof calldata proofRight,
    Machine.State calldata finalState
  ) override external
  {
    Dispute storage dispute = disputes[disputeKey];
    IOracle.Answer memory answer = oracle.getAnswer(dispute.answerKey);

    bytes32 defendantRoot = Merkle.hash(node);
    (bytes32 leftLeaf, bytes32 leftRoot, uint leftIndex) = Merkle.eval(proofLeft);
    (bytes32 rightLeaf, bytes32 rightRoot, uint rightIndex) = Merkle.eval(proofRight);

    require(msg.sender == answer.answerer, "Only whoever submitted the answer can do thereveal");
    require(dispute.state == DisputeState.Opened, "Dispute state is not correct for this action.");
    require(leftIndex == 0, "Left index must be 0.");
    require(leftRoot == defendantRoot, "Left proof root does not match claimed root.");
    require(rightRoot == defendantRoot, "Right proof root does not match claimed root.");
    require(leftLeaf == answer.questionKey, "Left leaf does not match initial state hash.");
    require(rightLeaf == Machine.stateHash(finalState), "Right leaf does not match the final state hash.");
    require(Machine.imageHash(Machine.project(finalState)) == dispute.answerKey, "The revealed final state does not produce the image hash submitted in answer.");
    require(Machine.isTerminal(finalState), "The revealed final state is not terminal");

    // Workaround
    Merkle.TreeNode memory _node = node;

    dispute.defendantRoot = defendantRoot;
    dispute.defendantNode = _node;
    dispute.lastActionTimestamp = now;
    dispute.state = DisputeState.ProsecutorTurn;
    dispute.numberOfSteps = rightIndex;
    dispute.goRight = _goRight(dispute.prosecutorNode, dispute.defendantNode);
    dispute.disagreementPoint = _updateDisagreementPoint(dispute.disagreementPoint, dispute.goRight);
    dispute.depth = 1;

    emit Reveal(disputeKey, defendantRoot, finalState);
  }

  function prosecutorRespond (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node
  ) override external
  {
    Dispute storage dispute = disputes[disputeKey];
    
    require(dispute.state == DisputeState.ProsecutorTurn, "Dispute state is not correct for this action.");
    require(dispute.goRight ? Merkle.hash(node) == dispute.prosecutorNode.right : Merkle.hash(node) == dispute.prosecutorNode.left, "Brought node from the wrong side.");

    // Workaround
    Merkle.TreeNode memory _node = node;

    dispute.prosecutorNode = _node;
    dispute.lastActionTimestamp = now;
    dispute.state = DisputeState.DefendantTurn;

    // emit something
  }

  function defendantRespond (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node
  ) override external
  {
    Dispute storage dispute = disputes[disputeKey];

    require(dispute.state == DisputeState.DefendantTurn, "Dispute state is not correct for this action.");
    require(dispute.goRight ? Merkle.hash(node) == dispute.defendantNode.right : Merkle.hash(node) == dispute.prosecutorNode.left, "Brought node from the wrong side.");

    // Workaround
    Merkle.TreeNode memory _node = node;

    dispute.defendantNode = _node;
    dispute.lastActionTimestamp = now;
    dispute.goRight = _goRight(dispute.prosecutorNode, dispute.defendantNode);
    dispute.disagreementPoint = _updateDisagreementPoint(dispute.disagreementPoint, dispute.goRight);
    dispute.depth += 1;

    if (_reachedBottom(dispute.depth)) {
      if (dispute.disagreementPoint > dispute.numberOfSteps) {
        _defendantWins(disputeKey);
        // emit something
      } else {
        dispute.state = DisputeState.Bottom;
        dispute.firstDivergentStateHash = dispute.goRight ? node.right : node.left;
        //emit something
      }
    } else {
      dispute.state = DisputeState.ProsecutorTurn;
      // emit something
    }
  }

  function defendantRevealBottom (
    bytes32 disputeKey,
    Merkle.Proof calldata proof,
    Machine.State calldata state
  ) override external
  {
    Dispute storage dispute = disputes[disputeKey];

    (bytes32 leaf, bytes32 root, uint index) = Merkle.eval(proof);
    
    require(dispute.state == DisputeState.Bottom, "Dispute state is not correct for this action.");
    require(leaf == Machine.stateHash(state), "The submitted proof is not of the revealed state");
    require(root == dispute.defendantRoot, "The submitted proof root does not match defendant root");
    require(index == dispute.disagreementPoint - 1, "The revealed state is not the one before the disagreement point.");

    (Machine.State memory nextState, bool canNext) = Machine.next(state);

    require(canNext, "The machine was unable to compute next state for the revealed state.");
    require(Machine.stateHash(nextState) == dispute.firstDivergentStateHash, "Next computed state is not the one commited to.");

    _defendantWins(disputeKey);
    // emit something
  }

  function timeout (
    bytes32 disputeKey
  ) override external
  {
    require(disputes[disputeKey].state != DisputeState.DoesNotExist, "Can not timeout a non existent dispute.");
    require(_canTimeout(disputeKey), "This dispute can not be timeout out at this moment");
    if (_defendantWinsOnTimeout(disputeKey)) {
      _defendantWins(disputeKey);
    } else {
      _prosecutorWins(disputeKey);
    }
  }
    
  function _answerExists (
    bytes32 answerKey
  ) internal view returns (bool)
  {
    IOracle.Answer memory answer = oracle.getAnswer(answerKey);
    return answer.questionKey > 0;
  }

  function _enoughTimeForDispute (
    bytes32 answerKey
  ) internal view returns (bool)
  {
    IOracle.Answer memory answer = oracle.getAnswer(answerKey);
    IOracle.Question memory question = oracle.getQuestion(answer.questionKey);
    return now < question.askTime + (2 * question.timeout / 3);
  }

  function _goRight (
    Merkle.TreeNode memory prosecutorNode,
    Merkle.TreeNode memory defendantNode
  ) internal pure returns (bool)
  {
    return prosecutorNode.left == defendantNode.left;
  }

  // TODO
  function _updateDisagreementPoint (
    uint disagreementPoint,
    bool goRight
  ) internal pure returns (uint)
  {
    return 0;
  }

  function _reachedBottom (
    uint depth
  ) internal view returns (bool)
  {
    return depth == MAX_TREE_DEPTH;
  }

  function _defendantWins (
    bytes32 disputeKey
  ) internal
  {
    address payable answerer = payable(oracle.getAnswer(disputes[disputeKey].answerKey).answerer);
    delete disputes[disputeKey];
    answerer.call.value(STAKE_SIZE)("");
  }

  function _prosecutorWins (
    bytes32 disputeKey
  ) internal
  {
    Dispute storage dispute = disputes[disputeKey];
    oracle.falsify(dispute.answerKey, dispute.prosecutor);
    address payable prosecutor = payable(dispute.prosecutor);
    delete disputes[disputeKey];
    prosecutor.call.value(STAKE_SIZE)("");
  }

  // TODO
  function _canTimeout (
    bytes32 disputeKey
  ) internal view returns (bool)
  {
    return false;
  }

  function _defendantWinsOnTimeout (
    bytes32 disputeKey
  ) internal view returns (bool)
  {
    DisputeState state = disputes[disputeKey].state;
    return state == DisputeState.ProsecutorTurn;
  }
    
}
