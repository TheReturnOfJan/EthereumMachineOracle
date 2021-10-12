// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.4;


library Merkle {

  struct TreeNode {
    bytes32 left;
    bytes32 right;
  }

  struct Proof {
    bytes32 leaf;
    bytes32[] data;
    uint path;
  }

  function hash (TreeNode memory self)
    public
    pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(self.left, self.right));
  }

  function eval (Proof memory self)
    public
    pure
    returns (bytes32 leaf, bytes32 root, uint path)
  {
    leaf = self.leaf;
    path = self.path;
    root = leaf;

    for (uint256 i = 0; i < self.data.length; i++) {
        bytes32 proofElement = self.data[i];
        uint leftOrRight = ~(path >> i) & 1;

        if (leftOrRight > 0) {
            root = keccak256(abi.encodePacked(root, proofElement));
        } else {
            root = keccak256(abi.encodePacked(proofElement, root));
        }
    }
  }

}
