const MerkleLib = require('../helpers/MerkleLib.js');

interface Node {
  left: string,
  right: string
}

interface Proof {
  leaf: Bytes32,
  data: Bytes32[],
  path: number
}

type MachineInstance = any;
type TreeClass = any;
type Seed = any;
type Image = any;
type Tree = any;
type State = any;
type Bytes32 = any;

const treeDepth = 16;

class Challenger {

    machineInstance: MachineInstance;
    treeClass: TreeClass;
    seed: Seed;
    listCorrectStates: State[];
    listIncorrectStates: State[];
    treeCorrect: Tree;
    treeIncorrect: Tree;
    initialStateHash: Bytes32;

    constructor(machineInstance: MachineInstance, seed: Seed, treeClass: TreeClass = MerkleLib) {
        this.seed = seed;
        this.treeClass = treeClass;
        this.machineInstance = machineInstance;
        this.listCorrectStates = [];
        this.listIncorrectStates = [];
    }

    async init() {
        await this.calcStateLists();
        await this.buildTrees();
    }

    async getIncorrectImage(): Promise<Image> {
      if (!this.treeCorrect) await this.init();
      return this.machineInstance.project(this.listIncorrectStates[this.listCorrectStates.length - 1]);
    }

    async computeImage(seed: Seed): Promise<Image> {
      return this.machineInstance.run(seed);
    }

    async computeImageHash(image: Image): Promise<Bytes32> {
      return this.machineInstance.imageHash(image);
    }

    async computeInitialStateHash(seed: Seed): Promise<Bytes32> {
      const initialState = await this.machineInstance.create(seed);
      return this.machineInstance.stateHash(initialState);
    }

    async calcStateLists() {
        let state = await this.machineInstance.create(this.seed);
        this.listCorrectStates.push(state);
        let isTerminal = await this.machineInstance.isTerminal(state);

        while (!isTerminal) {
            state = (await this.machineInstance.next(state))[0];
            this.listCorrectStates.push(state);
            isTerminal = await this.machineInstance.isTerminal(state);
        }
        let index = Math.floor(this.listCorrectStates.length / 2) - 1; // think about different options - lenght = 0, lenght = 1
        let el1 = this.listCorrectStates[index];
        let el2 = this.listCorrectStates[index + 1];
        this.listIncorrectStates = [...this.listCorrectStates];
        this.listIncorrectStates[index] = el2;
        this.listIncorrectStates[index + 1] = el1;
    }

    async buildTrees() {
        let leaves = {};
        for (let i = 0; i < this.listCorrectStates.length; i++) {
          leaves[i] = await this.machineInstance.stateHash(this.listCorrectStates[i]);
        }
        this.treeCorrect = new this.treeClass(treeDepth, leaves);

        let incorrectLeaves = {};
        for (let i = 0; i < this.listIncorrectStates.length; i++) {
          incorrectLeaves[i] = await this.machineInstance.stateHash(this.listIncorrectStates[i]);
        }

        this.treeIncorrect = new this.treeClass(treeDepth, incorrectLeaves);

    }

    async getCommitmentRoot(treeType: boolean): Promise<Bytes32> {
        if (!this.treeCorrect) await this.init();

        const root = treeType ? this.treeCorrect.root : this.treeIncorrect.root;
        return root;
    }

    async getDisagreementNode(treeType: boolean, currentDepth: number, disagreementPoint: number): Promise<Node> {
      if (!this.treeCorrect) await this.init();

      const node = treeType ? this.treeCorrect.getNodeByParent(currentDepth, disagreementPoint) : this.treeIncorrect.getNodeByParent(currentDepth, disagreementPoint);
      return node;
    }

    async getProofByIndex(treeType: boolean, index: number): Promise<Proof> {
      if (!this.treeCorrect) await this.init();
      const leaf = treeType ? await this.machineInstance.stateHash(this.listCorrectStates[index]) : await this.machineInstance.stateHash(this.listCorrectStates[index]);
      const proofElements = treeType ? this.treeCorrect.createMerkleProof(index) : this.treeIncorrect.createMerkleProof(index);
      return {
        leaf: leaf,
        data: proofElements,
        path: index
      }
    }

    async finalState(treeType: boolean): Promise<[number, State]> {
      if (!this.treeCorrect) await this.init();
      const index = treeType ? this.listCorrectStates.length - 1 : this.listIncorrectStates.length - 1;
      const state = treeType ? this.listCorrectStates[index] : this.listIncorrectStates[index];
      return [
        index,
        state
      ]
    }

}

export default Challenger;
