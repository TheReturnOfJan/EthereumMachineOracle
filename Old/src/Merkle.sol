pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;


library Merkle {
  
  struct TreeNode {
    bytes32 left;
    bytes32 right;
  }

  struct Proof {
    bytes32 leaf;
    bytes32[] data;
    uint index;
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
    returns (bytes32 leaf, bytes32 root, uint index)
  {
    leaf = self.leaf;
    index = self.index;
    root = leaf;

    for (uint256 i = 0; i < self.data.length; i++) {
        bytes32 proofElement = self.data[i];
        uint leftOrRight = ~(index >> i) & 1;

        if (leftOrRight > 0) {
            root = keccak256(abi.encodePacked(root, proofElement));
        } else {
            root = keccak256(abi.encodePacked(proofElement, root));
        }
    }
  }
  
}
