import VM from 'ethereumjs-vm';
import { Transaction, TxData } from 'ethereumjs-tx';
import { privateToAddress } from 'ethereumjs-util';
import Account from 'ethereumjs-account';

async function getAccountNonce(vm: VM, accountPrivateKey: Buffer) {
    return (new Promise(resolve => {
        vm.stateManager.getAccount(privateToAddress(accountPrivateKey), (_, acc) => {
            resolve(acc.nonce);
        });
    }));
}

async function putAccount(vm: VM, accountAddress: Buffer, account: Account) {
    return new Promise(resolve => {
        vm.stateManager.putAccount(accountAddress, account, () => resolve());
    });
}

async function deployContract(
    vm: VM,
    senderPrivateKey: Buffer,
    deploymentBytecode: string,
): Promise<Buffer> {
    const tx = new Transaction({
        value: 0,
        gasLimit: 10000000,
        gasPrice: 1,
        data: '0x' + deploymentBytecode,
        nonce: await getAccountNonce(vm, senderPrivateKey),
    } as TxData)

    tx.sign(senderPrivateKey)

    const deploymentResult = await vm.runTx({ tx })

    if (deploymentResult.execResult.exceptionError) {
        throw deploymentResult.execResult.exceptionError
    }

    return deploymentResult.createdAddress!
}

async function executeContractCall(vm: VM, contractAddress: Buffer, caller: Buffer, data: Buffer) {
    const callResult = await vm.runCall({
        to: contractAddress,
        caller: caller,
        origin: caller,
        data: data,
    })

    if (callResult.execResult.exceptionError) {
        throw callResult.execResult.exceptionError
    }

    return callResult.execResult.returnValue;
}

const ethersArrayToObject = (val) => {
    if (!isEthersArray(val)) return val;
    const normal = {};
    Object.keys(val).forEach(key => {
        const ele = val[key];
        const isNotNumber = parseInt(key) !== parseInt(key);
        const IsEleEthersArray = isEthersArray(ele);
        if (isNotNumber) {
            if (IsEleEthersArray) {
                normal[key] = ethersArrayToObject(ele);
            } else {
                normal[key] = ele;
            }
        }
    });
    return normal;
}

const isEthersArray = (val) => {
    const keys = Object.keys(val);
    const nums = keys.filter(k => parseInt(k) === parseInt(k)).map(k => parseInt(k));
    return (nums.length * 2 === keys.length) && keys.length > 0;
}

const objectToEthersArray = (obj) => {
    const arr = [];
    let i = 0;
    Object.keys(obj).forEach(key => {
        const ret = isEthersArray(obj[key]) ? objectToEthersArray(obj[key]) : obj[key];
        arr[i.toString()] = ret;
        arr[key] = ret;
        i++;
    });
    return arr;
}

export {
    getAccountNonce,
    deployContract,
    putAccount,
    executeContractCall,
    ethersArrayToObject
}
