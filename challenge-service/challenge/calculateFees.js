const web3 = require('../inits/web3Instance');

async function calculateFees(blockNumber) {
  // calculate new baseFee and maxPriorityFees
  const feeHistory = await web3.eth.getFeeHistory(1, blockNumber, [0.1, 0.25, 0.50, 0.75, 1.00, 2.00]);
  const baseFeePerGas = feeHistory.baseFeePerGas[1];
  const maxPriorityFeePerGas = JSON.stringify(feeHistory.reward[0]); //array

  return { baseFeePerGas, maxPriorityFeePerGas };
}

module.exports = calculateFees;
