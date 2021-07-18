// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

import "./Machine.sol";
import "./IClient.sol";

interface IClaimVerifier {

  // claimKey is root of computation commitment
  struct Claim {
    uint claimTime;
    uint timeout;
    uint stake;
    bytes32 initialStateHash;
    bytes32 imageHash;
  }

  event NewClaim (
    Machine.Seed seed,
    bytes32 imageHash,
    bytes32 claimKey
  );

  event TrueClaim (
    bytes32 claimKey
  );

  event FalseClaim (
    bytes32 claimKey
  );

  event CallbackFailed (
    bytes32 claimKey
  );

  function getClient () external view returns (IClient);

  function getMachineBytecode () external view returns (bytes memory);

  function getClaim (
    bytes32 claimKey
  ) external view returns (Claim memory);

  // only Client
  function makeClaim (
    Machine.Seed calldata seed,
    bytes32 imageHash,
    bytes32 claimKey,
    uint timeout
  ) external payable;

  // only ClaimFalsifier
  function falsifyClaim (
    bytes32 claimKey,
    address falsifier
  ) external;

  function resolveTrueClaim (
    bytes32 claimKey
  ) external;
}

contract ClaimVerifier is IClaimVerifier {
  mapping (bytes32 => Claim) public claims;

  address public immutable CLAIM_FALSIFIER;
  IClient public immutable CLIENT;
  uint public immutable MIN_TIMEOUT;

  constructor(address claimFalsifier, address client, uint min_timeout)
  {
    CLAIM_FALSIFIER = claimFalsifier;
    CLIENT = IClient(client);
    MIN_TIMEOUT = min_timeout;
  }

  function getClient () override external view returns (IClient)
  {
    return CLIENT;
  }

  function getMachineBytecode () override external pure returns (bytes memory)
  {
    return type(Machine).creationCode;
  }

  function getClaim (
    bytes32 claimKey
  ) override external view returns (Claim memory)
  {
    return claims[claimKey];
  }

  function makeClaim (
    Machine.Seed calldata seed,
    bytes32 imageHash,
    bytes32 claimKey,
    uint timeout
  ) override external payable
  {
    Claim storage claim = claims[claimKey];

    require(!_claimExists(claimKey), "Claim already exists.");
    require(msg.value > 0, "Stake must be greater than 0.");
    require(msg.sender == address(CLIENT), "Only client can make claims.");
    require(timeout > 0 && timeout + block.timestamp > timeout && timeout >= MIN_TIMEOUT, "Timeout must be greater then zero and be in overflow bounds.");

    bytes32 initialStateHash = Machine.stateHash(Machine.create(seed));

    claim.claimTime = block.timestamp;
    claim.timeout = timeout;
    claim.stake = msg.value;
    claim.initialStateHash = initialStateHash;
    claim.imageHash = imageHash;

    emit NewClaim(seed, imageHash, claimKey);
  }

  function falsifyClaim (
    bytes32 claimKey,
    address falsifier
  ) override external
  {
    Claim storage claim = claims[claimKey];

    require(_claimExists(claimKey), "Claim does not exist.");
    require(msg.sender == CLAIM_FALSIFIER, "Only claim falsifier can falsify claim.");

    uint stake = claim.stake;
    function(bytes32) external callback = CLIENT.falseCallback;

    delete claims[claimKey];

    payable(falsifier).call{value: stake}("");

    emit FalseClaim(claimKey);

    try callback(claimKey) {
    } catch {
      emit CallbackFailed(claimKey);
    }
  }

  function resolveTrueClaim (
    bytes32 claimKey
  ) override external
  {
    Claim storage claim = claims[claimKey];

    require(_claimExists(claimKey), "Claim must exist.");
    require(block.timestamp >= claim.claimTime + claim.timeout, "Too early to resolve.");

    uint stake = claim.stake;
    function(bytes32) external callback = CLIENT.trueCallback;

    delete claims[claimKey];

    payable(address(CLIENT)).call{value: stake}("");

    emit TrueClaim(claimKey);

    try callback(claimKey) {
    } catch {
      emit CallbackFailed(claimKey);
    }
  }

  function _claimExists (
    bytes32 claimKey
  ) internal view returns (bool)
  {
    return claims[claimKey].claimTime > 0;
  }

}
