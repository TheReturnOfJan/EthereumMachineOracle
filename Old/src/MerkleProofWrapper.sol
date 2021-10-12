pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import { Merkle } from "./Merkle.sol";

contract MerkleProofWrapper {
    function verify(Merkle.Proof memory proof) public pure returns (bytes32,bytes32,uint) {
        return Merkle.eval(proof);
    }
}