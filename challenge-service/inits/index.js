const db = require('./dbInstance');
const web3 = require('./web3Instance');
const getOffchainRunnerInstance = require('./getOffchainRunnerInstance');
const getTreeBuilderInstance = require('./getTreeBuilderInstance');
const config = require('./configInstance.json');

const inits = {
  db,
  web3,
  getOffchainRunnerInstance,
  getTreeBuilderInstance,
  config
};

module.exports = inits;
