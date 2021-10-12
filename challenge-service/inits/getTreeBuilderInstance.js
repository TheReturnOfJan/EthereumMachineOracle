const getOffchainRunnerInstance = require('./getOffchainRunnerInstance');
const TreeBuilder = require('../tools/treeBuilder/TreeBuilder');
const config = require('./configInstance.json');
const depth = config.MAX_TREE_DEPTH;

function getTreeBuilderInstance() {
  const offchainRunnerInstance = getOffchainRunnerInstance();
  return new TreeBuilder.default(offchainRunnerInstance, depth);
}

module.exports = getTreeBuilderInstance;
