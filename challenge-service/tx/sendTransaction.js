const web3 = require('../inits/web3Instance.js');
const getRawTransaction = require('./getRawTransaction.js');

/*
txData:
{ data: '0x',
  gasLimit: "0x5208",
  maxPriorityFeePerGas: '0x3b9aca00',
  maxFeePerGas: '0x4e3b29200',
  nonce: "0x1a",
  to: '0x69262F3256181cf0A62c5f5E9f8cd8fcC7B8F8e7',
  value: '0x16345785d8a0000',
  type: '0x02' }
*/

function sendTransaction(txData) {
  const { txHash, rawTransaction } = getRawTransaction(txData);
  web3.eth.sendSignedTransaction(rawTransaction);
  return txHash;
}


module.exports = sendTransaction;
