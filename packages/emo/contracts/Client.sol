// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "./ClaimVerifier.sol";
import "./IClient.sol";

contract Client is IClient {
  IClaimVerifier public claimVerifier;

  struct Claim {
    Machine.Seed seed;
    Machine.Image image;
    bytes32 commitmentRoot;
    address initiator;
  }

  address owner;
  bool set;
  uint internal stepTimeout;
  uint public defaultTimeout;
  uint public stake;

  mapping(bytes32 => bytes32) public claimKeyToInitialStateHash;
  mapping(bytes32 => Claim) public currClaims; // claimKey => Claim
  mapping(bytes32 => Claim) public verified;   // initialStateHash => Claim
  mapping(bytes32 => Claim) public falsified;  // initialStateHash => Claim
  mapping(address => uint) internal withdrawalBalances;

  event ClaimDefended (
    bytes32 initialStateHash,
    bytes32 claimKey,
    address defendant
  );
  
  // @param _stepTimeout Should not be less than one block time
  constructor(uint treeDepth, uint _stepTimeout) {
    owner = msg.sender;
    stepTimeout = _stepTimeout;
    defaultTimeout = (stepTimeout * (treeDepth + 2)) * 3;
  }

  modifier onlyClaimVerifier() {
    require(msg.sender == address(claimVerifier), "Only claimVerifier can call this.");
    _;
  }

  function setClaimVerifier(address _claimVerifier) public {
    require(msg.sender == owner, "Only owner is able to set claimVerifier.");
    require(!set, "ClaimVerifier has been already setted.");
    claimVerifier = IClaimVerifier(_claimVerifier);
    set = true;
  }

  function setStake(uint amount) public {
    require(msg.sender == owner, "Only owner is able to set stake value.");
    stake = amount;
  }

  function getStepTimeout () override external view returns (uint) {
    return stepTimeout;
  }

  function makeClaim(Machine.Seed memory seed, Machine.Image memory image, bytes32 commitmentRoot) public payable {
    require(set, "ClaimVerifier is not set yet.");
    require(commitmentRoot != 0x0, "Impossible commitmentRoot.");
    require(msg.value >= stake, "To claim you need stake.");
    _registerClaim(seed, image, commitmentRoot, msg.sender);
    claimVerifier.makeClaim{value: stake}(seed, _imageToImageHash(image), commitmentRoot, defaultTimeout);
  }

  function trueCallback(bytes32 claimKey) external override onlyClaimVerifier {
    Claim storage claim = currClaims[claimKey];
    require(claim.commitmentRoot == claimKey, "The claimKey does not match the commitmentRoot. Impossible.");
    bytes32 initialStateHash = claimKeyToInitialStateHash[claimKey];
    verified[initialStateHash] = claim;
    address initiator = claim.initiator;

    delete currClaims[claimKey];
    delete claimKeyToInitialStateHash[claimKey];
    (bool success, ) = payable(initiator).call{value: stake}("");
    if (!success) {
      withdrawalBalances[initiator] += stake;
    }
  }

  function falseCallback(bytes32 claimKey) external override onlyClaimVerifier {
    Claim storage claim = currClaims[claimKey];
    require(claim.commitmentRoot == claimKey, "The claimKey does not match the commitmentRoot. Impossible.");
    bytes32 initialStateHash = claimKeyToInitialStateHash[claimKey];
    falsified[initialStateHash] = claim;
    delete currClaims[claimKey];
    delete claimKeyToInitialStateHash[claimKey];
  }

  function defensePayoutCallback(bytes32 claimKey) external override payable {
    Claim storage claim = currClaims[claimKey];
    bytes32 initialStateHash = claimKeyToInitialStateHash[claimKey];
    address payable defendant = payable(claim.initiator);
    (bool success, ) = defendant.call{value: msg.value}("");
    if (!success) {
      withdrawalBalances[address(defendant)] += msg.value;
    }
    emit ClaimDefended(initialStateHash, claimKey, defendant);
  }

  function withdraw() public {
    uint amount = withdrawalBalances[msg.sender];
    withdrawalBalances[msg.sender] = 0;
    payable(msg.sender).transfer(amount);
  }

  function _registerClaim(Machine.Seed memory seed, Machine.Image memory image, bytes32 commitmentRoot, address _initiator) internal {
    bytes32 initialStateHash = _seedToInitialStateHash(seed);
    Claim storage claim = verified[initialStateHash];
    require(claim.commitmentRoot == 0x0, "The claim with this seed was already verified.");
    claim = currClaims[commitmentRoot];
    claimKeyToInitialStateHash[commitmentRoot] = initialStateHash;
    claim.seed = seed;
    claim.image = image;
    claim.commitmentRoot = commitmentRoot;
    claim.initiator = _initiator;
  }

  function _seedToInitialStateHash(Machine.Seed memory _seed) public pure returns(bytes32) {
    return Machine.stateHash(Machine.create(_seed));
  }

  function _imageToImageHash(Machine.Image memory _image) internal pure returns(bytes32) {
    return Machine.imageHash(_image);
  }

  receive() external payable {

  }

}
