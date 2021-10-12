// Ported from 
// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/test/helpers/merkleTree.js

const { keccak256, keccakFromString, bufferToHex } = require('ethereumjs-util');

class MerkleTree {
  constructor (elements) {
    
    this.elements = elements.filter(el => el).map(el => keccakFromString(el));
    this.layers = this.getLayers(this.elements);
  }

  getLayers (elements) {
    if (elements.length === 0) {
      return [['']];
    }

    const layers = [];
    layers.push(elements);

    // Get next layer until we reach the root
    while (layers[layers.length - 1].length > 1) {
      layers.push(this.getNextLayer(layers[layers.length - 1]));
    }

    return layers;
  }

  getNextLayer (elements) {
    return elements.reduce((layer, el, idx, arr) => {
      if (idx % 2 === 0) {
        // Hash the current element with its pair element
        layer.push(this.combinedHash(el, arr[idx + 1]));
      }

      return layer;
    }, []);
  }

  combinedHash (first, second) {
    if (!first) { return second; }
    if (!second) { return first; }

    return keccak256(Buffer.concat([first, second]));
  }

  getRoot () {
    return bufferToHex(this.layers[this.layers.length - 1][0]);
  }

  getProof (el) {
    let idx = this.bufIndexOf(el, this.elements);

    if (idx === -1) {
      throw new Error('Element does not exist in Merkle tree');
    }

    return this.layers.reduce((proof, layer) => {
      const pairElement = this.getPairElement(idx, layer);

      if (!pairElement) return proof;

      idx = Math.floor(idx / 2);

      return [...proof, bufferToHex(pairElement)];
    }, []);
  }

  getPairElement (idx, layer) {
    const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (pairIdx < layer.length) {
      return layer[pairIdx];
    } else {
      return null;
    }
  }

  bufIndexOf (el, arr) {
    let hash;

    // Convert element to 32 byte hash if it is not one already
    if (el.length !== 32 || !Buffer.isBuffer(el)) {
      hash = keccakFromString(el);
    } else {
      hash = el;
    }

    for (let i = 0; i < arr.length; i++) {
      if (hash.equals(arr[i])) {
        return i;
      }
    }

    return -1;
  }

}

module.exports = {
  MerkleTree,
};