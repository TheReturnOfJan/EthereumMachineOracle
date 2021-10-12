import { ContractFactory } from 'ethers';
import { deployContract, putAccount, executeContractCall, ethersArrayToObject } from './utils';
import { privateToAddress, bufferToHex, keccakFromString, toBuffer } from 'ethereumjs-util';
import Account from 'ethereumjs-account';
import VM from 'ethereumjs-vm';

type State = any;
type Seed = any;
type Image = any;
type Bytes32 = any;
type MachineArtifact = any;

const privKey = 'e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109';

const getFuncSigHash = (name) => {
    return bufferToHex(keccakFromString(name)).slice(0, 10);
}

const selectors = {
    create: getFuncSigHash("create(Machine.Seed)"),
    project: getFuncSigHash("project(Machine.State)"),
    isTerminal: getFuncSigHash("isTerminal(Machine.State)"),
    next: getFuncSigHash("next(Machine.State)"),
    stateHash: getFuncSigHash("stateHash(Machine.State)"),
    imageHash: getFuncSigHash("imageHash(Machine.Image)"),
}

class Machine {

    vm: VM;
    machineAddress: Buffer;
    machineArtifact: MachineArtifact;
    machineContract: ContractFactory;
    account: Buffer;

    constructor(machineArtifact: MachineArtifact) {
        this.vm = new VM();
        this.machineArtifact = machineArtifact;
        this.machineContract = ContractFactory.fromSolidity(machineArtifact);
    }

    async init() {
        const accountPk = Buffer.from(
            privKey,
            'hex',
        );
        const accountAddress = privateToAddress(accountPk);
        const account = new Account({ balance: 1e18 });
        await putAccount(this.vm, accountAddress, account);

        let bytecode: any = null;
        if (this.machineArtifact.bytecode) {
            bytecode = this.machineArtifact.bytecode;
        } else if (this.machineArtifact.evm && this.machineArtifact.evm.bytecode) {
            bytecode = this.machineArtifact.evm.bytecode.object;
        }

        this.machineAddress = await deployContract(this.vm, accountPk, bytecode.replace('0x', ''));
        this.account = accountAddress;
    }

    async callFunc(funcName: string, arg: any) {
        if (!this.machineAddress) await this.init();
        const funcFragment = this.machineContract.interface.getFunction(funcName);
        const params = this.machineContract.interface._encodeParams(funcFragment.inputs, [arg]);
        const encoded = toBuffer(selectors[funcName] + params.replace("0x", ""));
        const result = await executeContractCall(this.vm, this.machineAddress, this.account, encoded);
        const decoded = this.machineContract.interface.decodeFunctionResult(funcFragment, result);
        return decoded.map(ethersArrayToObject);
    }

    async run(seed: Seed): Promise<Image> {
        if (!this.machineAddress) await this.init();
        let state = await this.create(seed);
        let isTerminal = await this.isTerminal(state);

        while (!isTerminal) {
            state = (await this.next(state))[0];
            isTerminal = await this.isTerminal(state);
        }
        const image = await this.project(state);
        return image;
    }

    async computeAnswer(seed: Seed): Promise<[Image, Bytes32]> {
        if (!this.machineAddress) await this.init();
        const image = await this.run(seed);
        const imageHash = await this.imageHash(image);
        return [image, imageHash];
    }

    async create(seed: Seed): Promise<State> {
        if (!this.machineAddress) await this.init();
        return (await this.callFunc("create", seed))[0];
    }

    async project(state: State): Promise<Image> {
        if (!this.machineAddress) await this.init();
        return (await this.callFunc("project", state))[0];
    }

    async isTerminal(state: State): Promise<boolean> {
        if (!this.machineAddress) await this.init();
        return (await this.callFunc("isTerminal", state))[0];
    }

    async next(state: State): Promise<[State, boolean]> {
        if (!this.machineAddress) await this.init();
        const result = await this.callFunc("next", state);
        return [result[0], result[1]];
    }

    async stateHash(state: State): Promise<Bytes32> {
        if (!this.machineAddress) await this.init();
        return (await this.callFunc("stateHash", state))[0];
    }

    async imageHash(image: Image): Promise<Bytes32> {
        if (!this.machineAddress) await this.init();
        return (await this.callFunc("imageHash", image))[0];
    }
}

export default Machine;
