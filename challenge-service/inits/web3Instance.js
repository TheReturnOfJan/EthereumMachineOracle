const Web3 = require('web3');
const config = require('../config/config.json');
const web3Instance = new Web3(config.providerUrl);

module.exports = web3Instance;
