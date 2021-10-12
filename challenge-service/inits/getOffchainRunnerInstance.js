const web3 = require('./web3Instance');
const config = require('./configInstance.json');
const OffchainRunner = require('../tools/vm/Machine.js');

function getOffchainRunnerInstance() {
  const compilerOutput = {
    abi: config.machineABI,
    bytecode: config.machineBytecode
  };

  return new OffchainRunner.default(compilerOutput);

}

module.exports = getOffchainRunnerInstance;
