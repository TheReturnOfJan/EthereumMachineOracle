import Machine from './Machine';
import { compile } from '@ethereum-waffle/compiler';

async function main() {
    const output = await compile({
        sourceDirectory: '../src'
    });
    const machineArtifact = output.contracts['../src/ExampleMachine.sol'].Machine;
    const machine = new Machine(machineArtifact);
    // await machine.init();
    const result = await machine.computeAnswer({ nums: [1, 2, 3, 12, 55] });
    console.log(result);
}

main();
