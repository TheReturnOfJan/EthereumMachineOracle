// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;

interface IClient {

  function trueCallback (
    bytes32 claimKey
  ) external;

  function falseCallback (
    bytes32 claimKey
  ) external;

  function defensePayoutCallback (
    bytes32 claimKey
  ) external payable;

  // Should not be less than one block time
  function getStepTimeout () external view returns (uint);
}
