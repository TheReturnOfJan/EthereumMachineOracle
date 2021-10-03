const { keccak256 } = require("ethereumjs-util");

const merkelize = (hash1, hash2) => {
  const buffer = Buffer.alloc(64, 0);
  if (typeof hash1 === "string" || hash1 instanceof String) {
    buffer.write(hash1.replace("0x", ""), "hex");
  } else {
    hash1.copy(buffer);
  }
  if (typeof hash2 === "string" || hash2 instanceof String) {
    buffer.write(hash2.replace("0x", ""), 32, "hex");
  } else {
    hash2.copy(buffer, 32);
  }
  return `0x${keccak256(buffer).toString("hex")}`;
};

function setDefaultNodes(depth) {
  const defaultNodes = new Array(depth + 1);
  defaultNodes[0] = `0x${keccak256(Buffer.alloc(32, 0)).toString("hex")}`;
  for (let i = 1; i < depth + 1; i += 1) {
    defaultNodes[i] = merkelize(defaultNodes[i-1], defaultNodes[i-1]);
  }
  return defaultNodes;
}

function createTree(orderedLeaves, depth, defaultNodes) {
  const tree = [orderedLeaves];
  let treeLevel = orderedLeaves;

  let nextLevel = {};
  let halfIndex;
  let value;

  for (let level = 0; level < depth; level += 1) {
    nextLevel = {};

    for (const index in treeLevel) {
      if (treeLevel.hasOwnProperty(index)) {
        halfIndex = (BigInt(index) / BigInt(2)).toString();
        value = treeLevel[index];
        if (BigInt(index) % BigInt(2) === BigInt(0)) {
          const coIndex = (BigInt(index) + BigInt(1)).toString();

          nextLevel[halfIndex] = merkelize(
            value,
            treeLevel[coIndex] || defaultNodes[level]
          );
        } else {
          const coIndex = (BigInt(index) - BigInt(1)).toString();
          if (treeLevel[coIndex] === undefined) {
            nextLevel[halfIndex] = merkelize(defaultNodes[level], value);
          }
        }
      }
    }
    treeLevel = nextLevel;
    tree.push(treeLevel);
  }
  return tree;
}

module.exports = class MerkleLib {
  constructor(depth, leaves) {
    this.depth = depth;
    // Initialize defaults
    this.defaultNodes = setDefaultNodes(depth);
    // Leaves must be a dictionary with key as the leaf's slot and value the leaf's hash
    this.leaves = leaves;

    if (leaves && Object.keys(leaves).length !== 0) {
      this.tree = createTree(this.leaves, this.depth, this.defaultNodes);
      this.root = this.tree[this.depth]["0"];
    } else {
      this.tree = [];
      this.root = this.defaultNodes[this.depth];
    }
  }

  getNodeByParent(parentLevel, parentIndex) {
    if (2 ** parentLevel < parentIndex) {
      throw Error("parentIndex couldn't be in this level of the tree.");
    } else if (parentLevel >= this.depth) {
      throw Error(`parentLevel should be in range 0 and ${this.depth - 1}.`);
    }
    const leftChild = this.tree[this.depth - parentLevel - 1][parentIndex << 1] || this.defaultNodes[this.depth - parentLevel - 1];
    const rightChild = this.tree[this.depth - parentLevel - 1][(parentIndex << 1) + 1] || this.defaultNodes[this.depth - parentLevel - 1];

    return {
      left: leftChild,
      right: rightChild
    };

  }

  createMerkleProof(uid) {
    let index = BigInt(uid);
    let proof = [];
    let siblingIndex;
    let siblingHash;
    for (let level = 0; level < this.depth; level += 1) {
      siblingIndex =
        BigInt(index) % BigInt(2) === BigInt(0)
          ? BigInt(index) + BigInt(1)
          : BigInt(index) - BigInt(1);
      index = BigInt(index) / BigInt(2);
      if (level < this.tree.length) {
        siblingHash = this.tree[level][siblingIndex.toString()];
        if (siblingHash) {
          proof.push(siblingHash);
        } else {
          proof.push(this.defaultNodes[level]);
        }
      }
    }
    return proof;
  }
};
