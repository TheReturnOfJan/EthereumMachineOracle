const web3 = require('./inits/web3Instance');
const config = require('./config/config.json');
const fs = require('fs');
//const { Chain } = require('@ethereumjs/common');

module.exports = async () => {
  // compile new configInstance
  const configInstance = {...config};
  const chainId = await web3.eth.getChainId();
  if (chainId !== configInstance.chainId) {
    // check if includes in Chain from ethereumjs -> if not process.exit
    console.log("ChainId from the config is not the same as the provider chain id");
    process.exit(0);
  }
  const stake = await web3.eth.call({
    to: config.claimFalsifierAddress,
    data: web3.eth.abi.encodeFunctionSignature("STAKE_SIZE()")
  });
  configInstance.STAKE_SIZE = '0x' + BigInt(stake).toString(16);
  const machineCallOutput = await web3.eth.call({
    to: config.claimVerifierAddress,
    data: web3.eth.abi.encodeFunctionSignature("getMachineBytecode()")
  });

  const machineBytecode = web3.eth.abi.decodeParameter('bytes', machineCallOutput);
  configInstance.machineBytecode = machineBytecode;

  const depth = await web3.eth.call({
    to: config.claimFalsifierAddress,
    data: web3.eth.abi.encodeFunctionSignature("MAX_TREE_DEPTH()")
  });
  configInstance.MAX_TREE_DEPTH = Number(BigInt(depth));

  const stepTimeout = await web3.eth.call({
    to: config.claimFalsifierAddress,
    data: web3.eth.abi.encodeFunctionSignature("STEP_TIMEOUT()")
  });
  configInstance.STEP_TIMEOUT = Number(BigInt(stepTimeout));

  const createFunc = config.machineABI.find((el) => {
    return el.name === 'create';
  });

  // for event encoding/decoding
  configInstance.seedParam = createFunc.inputs[0];
  configInstance.seedParam.name = "seed";
  configInstance.seedParam.indexed = false;
  configInstance.stateParam = createFunc.outputs[0];
  configInstance.stateParam.name = "state";
  configInstance.stateParam.indexed = false;

  // estimate gas and add configJS.gasLimits ??

  // write address
  const keystore = JSON.parse(fs.readFileSync("./keystore/keystore.json", "utf-8"));
  configInstance.address = '0x' + keystore.address;

  fs.writeFileSync("./inits/configInstance.json", JSON.stringify(configInstance), "utf-8");
}
