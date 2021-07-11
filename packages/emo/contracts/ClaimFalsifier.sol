// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "./ClaimVerifier.sol";
import "./Merkle.sol";
import "./IClient.sol";

interface IClaimFalsifier {

  enum DisputeState {
    DoesNotExist,
    Opened,
    ProsecutorTurn,
    DefendantTurn,
    Bottom
  }

  // disputeKey is prosecutorRoot
  // claimKey is defendantRoot
  struct Dispute {
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
    bytes32 defendantRoot,
    bytes32 prosecutorRoot
  );

  event Reveal (
    bytes32 prosecutorRoot,
    Machine.State finalState
  );

  function claimVerifier()
    external view returns (IClaimVerifier);

  function getDispute(
    bytes32 prosecutorRoot
  ) external view returns (Dispute memory);

  function newDispute (
    bytes32 defendantRoot,
    Merkle.TreeNode calldata prosecutorNode
  ) external payable;

  function reveal (
    bytes32 prosecutorRoot,
    Merkle.TreeNode calldata node,
    Merkle.Proof calldata proofLeft,
    Merkle.Proof calldata proofRight,
    Machine.State calldata finalState
  ) external;

  function prosecutorRespond (
    bytes32 prosecutorRoot,
    Merkle.TreeNode calldata node
  ) external;

  function defendantRespond (
    bytes32 prosecutorRoot,
    Merkle.TreeNode calldata node
  ) external;

  function defendantRevealBottom (
    bytes32 prosecutorRoot,
    Merkle.Proof calldata proof,
    Machine.State calldata state
  ) external;

  function timeout (
    bytes32 prosecutorRoot
  ) external;
}

contract ClaimFalsifier is IClaimFalsifier {

  IClaimVerifier public override claimVerifier;
  mapping (bytes32 => Dispute) public disputes;
  uint public STAKE_SIZE;
  uint public MAX_TREE_DEPTH;
  uint public STEP_TIMEOUT;
  uint public DISPUTE_TIMEOUT;

  constructor(uint stake_size, uint max_tree_depth, address client)
  {
    STAKE_SIZE = stake_size;
    MAX_TREE_DEPTH = max_tree_depth;
    STEP_TIMEOUT = IClient(client).getStepTimeout();
    DISPUTE_TIMEOUT = STEP_TIMEOUT * (MAX_TREE_DEPTH + 2);
    claimVerifier = new ClaimVerifier(address(this), client, DISPUTE_TIMEOUT * 3);
  }

  function getDispute (
    bytes32 prosecutorRoot
  ) external view override returns (Dispute memory)
  {
    return disputes[prosecutorRoot];
  }

  function newDispute (
    bytes32 defendantRoot,
    Merkle.TreeNode calldata prosecutorNode
  ) override external payable
  {
    bytes32 prosecutorRoot = Merkle.hash(prosecutorNode);
    Dispute storage dispute = disputes[prosecutorRoot];

    require(msg.value >= STAKE_SIZE, "Not enough stake sent.");
    require(dispute.state == DisputeState.DoesNotExist, "Dispute already exists.");
    require(_claimExists(defendantRoot), "Claim does not exists.");
    require(_enoughTimeForDispute(defendantRoot), "There is not enough time left for a dispute.");

    dispute.defendantRoot = defendantRoot;
    dispute.state = DisputeState.Opened;
    dispute.prosecutor = msg.sender;
    dispute.lastActionTimestamp = block.timestamp;
    dispute.prosecutorNode = prosecutorNode;

    emit NewDispute(defendantRoot, prosecutorRoot);
  }

  function reveal (
    bytes32 prosecutorRoot,
    Merkle.TreeNode calldata defendantNode,
    Merkle.Proof calldata proofLeft,
    Merkle.Proof calldata proofRight,
    Machine.State calldata finalState
  ) override external
  {
    Dispute storage dispute = disputes[prosecutorRoot];
    IClaimVerifier.Claim memory claim = claimVerifier.getClaim(dispute.defendantRoot);

    (bytes32 leftProofLeaf, bytes32 leftProofRoot, uint leftProofIndex) = Merkle.eval(proofLeft);
    (bytes32 rightProofLeaf, bytes32 rightProofRoot, uint rightProofIndex) = Merkle.eval(proofRight);

    require(Merkle.hash(defendantNode) == dispute.defendantRoot, "Defendant node does not match defendant root.");
    require(dispute.state == DisputeState.Opened, "Dispute state is not correct for this action.");
    require(leftProofIndex == 0, "Left index must be 0.");
    require(leftProofRoot == dispute.defendantRoot, "Left proof root does not match defendant root.");
    require(rightProofRoot == dispute.defendantRoot, "Right proof root does not match defendant root.");
    require(leftProofLeaf == claim.initialStateHash, "Left leaf does not match initial state hash.");
    require(rightProofLeaf == Machine.stateHash(finalState), "Right leaf does not match the final state hash.");
    require(Machine.imageHash(Machine.project(finalState)) == claim.imageHash, "The revealed final state does not produce the image hash submitted in the claim.");
    require(Machine.isTerminal(finalState), "The revealed final state is not terminal");

    dispute.defendantNode = defendantNode;
    dispute.lastActionTimestamp = block.timestamp;
    dispute.state = DisputeState.ProsecutorTurn;
    dispute.numberOfSteps = rightProofIndex;
    dispute.goRight = _goRight(dispute.prosecutorNode, dispute.defendantNode);
    dispute.disagreementPoint = _updateDisagreementPoint(dispute.disagreementPoint, dispute.goRight);
    dispute.depth = 1;

    emit Reveal(prosecutorRoot, finalState);
  }

  function prosecutorRespond (
    bytes32 prosecutorRoot,
    Merkle.TreeNode calldata node
  ) override external
  {
    Dispute storage dispute = disputes[prosecutorRoot];

    require(dispute.state == DisputeState.ProsecutorTurn, "Dispute state is not correct for this action.");
    require(dispute.goRight ? Merkle.hash(node) == dispute.prosecutorNode.right : Merkle.hash(node) == dispute.prosecutorNode.left, "Brought node from the wrong side.");

    dispute.prosecutorNode = node;
    dispute.lastActionTimestamp = block.timestamp;
    dispute.state = DisputeState.DefendantTurn;

    // emit something
  }

  function defendantRespond (
    bytes32 prosecutorRoot,
    Merkle.TreeNode calldata node
  ) override external
  {
    Dispute storage dispute = disputes[prosecutorRoot];

    require(dispute.state == DisputeState.DefendantTurn, "Dispute state is not correct for this action.");
    require(dispute.goRight ? Merkle.hash(node) == dispute.defendantNode.right : Merkle.hash(node) == dispute.defendantNode.left, "Brought node from the wrong side.");

    dispute.defendantNode = node;
    dispute.lastActionTimestamp = block.timestamp;
    dispute.goRight = _goRight(dispute.prosecutorNode, dispute.defendantNode);
    dispute.disagreementPoint = _updateDisagreementPoint(dispute.disagreementPoint, dispute.goRight);
    dispute.depth += 1;

    if (_reachedBottom(dispute.depth)) {
      if (dispute.disagreementPoint > dispute.numberOfSteps || dispute.disagreementPoint == 0) {
        _defendantWins(prosecutorRoot);
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
    bytes32 prosecutorRoot,
    Merkle.Proof calldata proof,
    Machine.State calldata state
  ) override external
  {
    Dispute storage dispute = disputes[prosecutorRoot];

    (bytes32 leaf, bytes32 root, uint index) = Merkle.eval(proof);

    require(dispute.state == DisputeState.Bottom, "Dispute state is not correct for this action.");
    require(leaf == Machine.stateHash(state), "The submitted proof is not of the revealed state");
    require(root == dispute.defendantRoot, "The submitted proof root does not match defendant root");
    require(index == dispute.disagreementPoint - 1, "The revealed state is not the one before the disagreement point.");

    (Machine.State memory nextState, bool canNext) = Machine.next(state);

    require(canNext, "The machine was unable to compute next state for the revealed state.");
    require(Machine.stateHash(nextState) == dispute.firstDivergentStateHash, "Next computed state is not the one commited to.");

    _defendantWins(prosecutorRoot);
    // emit something
  }

  function timeout (
    bytes32 prosecutorRoot
  ) override external
  {
    require(disputes[prosecutorRoot].state != DisputeState.DoesNotExist, "Can not timeout a non existent dispute.");
    require(_canTimeout(prosecutorRoot), "This dispute can not be timeout out at this moment");
    if (_defendantWinsOnTimeout(prosecutorRoot)) {
      _defendantWins(prosecutorRoot);
    } else {
      _prosecutorWins(prosecutorRoot);
    }
  }

  function _claimExists (
    bytes32 defendantRoot
  ) internal view returns (bool)
  {
    IClaimVerifier.Claim memory claim = claimVerifier.getClaim(defendantRoot);
    return claim.claimTime > 0;
  }

  function _enoughTimeForDispute (
    bytes32 defendantRoot
  ) internal view returns (bool)
  {
    IClaimVerifier.Claim memory claim = claimVerifier.getClaim(defendantRoot);
    return block.timestamp < claim.claimTime + (claim.timeout / 2);
  }

  function _goRight (
    Merkle.TreeNode memory prosecutorNode,
    Merkle.TreeNode memory defendantNode
  ) internal pure returns (bool)
  {
    return prosecutorNode.left == defendantNode.left;
  }

  function _updateDisagreementPoint (
    uint disagreementPoint,
    bool goRight
  ) internal pure returns (uint)
  {
    return disagreementPoint << 1 | (goRight ? 1 : 0);
  }

  function _reachedBottom (
    uint depth
  ) internal view returns (bool)
  {
    return depth == MAX_TREE_DEPTH;
  }

  // TODO: use try catch in callback
  function _defendantWins (
    bytes32 prosecutorRoot
  ) internal
  {
    bytes32 defendantRoot = disputes[prosecutorRoot].defendantRoot;
    function(bytes32) external payable callback = claimVerifier.getClient().defensePayoutCallback;

    delete disputes[prosecutorRoot];

    callback{value: STAKE_SIZE}(defendantRoot);
  }

  function _prosecutorWins (
    bytes32 prosecutorRoot
  ) internal
  {
    Dispute storage dispute = disputes[prosecutorRoot];
    claimVerifier.falsifyClaim(dispute.defendantRoot, dispute.prosecutor);
    address payable prosecutor = payable(dispute.prosecutor);
    delete disputes[prosecutorRoot];
    prosecutor.call{value: STAKE_SIZE}("");
  }

  function _canTimeout (
    bytes32 prosecutorRoot
  ) internal view returns (bool)
  {
    Dispute storage dispute = disputes[prosecutorRoot];
    return dispute.lastActionTimestamp + STEP_TIMEOUT > block.timestamp;
  }

  function _defendantWinsOnTimeout (
    bytes32 prosecutorRoot
  ) internal view returns (bool)
  {
    DisputeState state = disputes[prosecutorRoot].state;
    return state == DisputeState.ProsecutorTurn;
  }

}
