const MerkleLib = require('../helpers/MerkleLib.js');

type MachineInstance = any;
type TreeClass = any;
type Seed = any;
type Tree = any;
type State = any;

class TreeBuilder {

    machineInstance: MachineInstance;
    treeClass: TreeClass;
    treeDepth: number;

    constructor(machineInstance: MachineInstance, treeDepth: number = 16, treeClass: TreeClass = MerkleLib) {
        this.machineInstance = machineInstance;
        this.treeClass = treeClass;
        this.treeDepth = treeDepth;
    }

    async calcStateList(seed: Seed) {
        let stateList = [];
        let state = await this.machineInstance.create(seed);
        stateList.push(state);
        let isTerminal = await this.machineInstance.isTerminal(state);

        while (!isTerminal) {
            state = (await this.machineInstance.next(state))[0];
            stateList.push(state);
            isTerminal = await this.machineInstance.isTerminal(state);
        }
        return stateList;
    }

    async buildTree(seed: Seed) {
        let leaves = {};
        let stateList = await this.calcStateList(seed);
        for (let i = 0; i < stateList.length; i++) {
          leaves[i] = await this.machineInstance.stateHash(stateList[i]);
        }
        let tree = new this.treeClass(this.treeDepth, leaves);
        return tree;
    }

}

export default TreeBuilder;
