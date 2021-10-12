const { keccakFromString, bufferToHex } = require("ethereumjs-util");
const ethers = require('ethers');
const { expect } = require("chai");
const { deployContract, link, MockProvider } = require("ethereum-waffle");

const { MerkleTree } = require("./helpers/merkleTree");
const MerkleProofWrapper = require("../build/MerkleProofWrapper.json");
const Merkle = require("../build/Merkle.json");

describe("Merkle", function () {
  const [wallet] = new MockProvider().getWallets();
  let merkleProof;

  beforeEach(async function () {
    const merkle = await deployContract(
      wallet,
      Merkle,
      [],
    );

    link(MerkleProofWrapper, 'src/Merkle.sol:Merkle', merkle.address);
    merkleProof = await deployContract(wallet, MerkleProofWrapper, []);
  });

  describe("eval", function () {
    it("happy case", async function () {
      const elements = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const merkleTree = new MerkleTree(elements);

      const root = merkleTree.getRoot();

      const index = 3;
      const leaf = bufferToHex(keccakFromString(elements[index]));
      
      const proof = {
        leaf,
        data: merkleTree.getProof(elements[index]),
        index,
      };

      expect(await merkleProof.verify(proof)).to.deep.equal([
        leaf,
        root,
        ethers.BigNumber.from(index)
      ]);
    });
  });
});
