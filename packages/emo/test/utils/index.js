// Temporary solution until Truffle enable new web3.js version
const pimpVerifier = (verifier) => {
  verifier.contract._decodeMethodReturn = function (outputs, returnValues) {
      for (let i = 0; i < outputs.length; i++) {
        if (outputs[i].type === 'function') {
          outputs[i].type = 'bytes24';
        }
      }
      if (outputs[0].internalType === 'struct IClaimVerifier.Claim') {
        for (let i = 0; i < outputs[0].components.length; i++) {
          if (outputs[0].components[i].type === 'function') {
            outputs[0].components[i].type = 'bytes24';
          }
        }
      }
      return this.__proto__._decodeMethodReturn(outputs, returnValues);
  };
}
// Block of helper functions for formatting structs
const isEthersArray = (val) => {
  const keys = Object.keys(val);
  const nums = keys.filter(k => parseInt(k) === parseInt(k)).map(k => parseInt(k));
  return nums.length * 2 === keys.length && keys.length > 0;
}

const arraifyAsEthers = (obj, flag = true) => {
  const arr = [];
  let i = 0;
  Object.keys(obj).forEach(key => {
      const ret = isEthersArray(obj[key]) ? arraifyAsEthers(obj[key]) : obj[key];
      arr[i.toString()] = ret;
      arr[key] = ret;
      i++;
  });
  turnAllToString(arr, flag);
  return arr;
}


const turnAllToString = (obj, flag) => {
  Object.keys(obj).forEach(key => {
    const ele = obj[key];
    if (typeof ele === 'object') {
      turnAllToString(ele);
    } else if (parseInt(ele) === parseInt(ele)) {
      if (flag) {
        if (ele.toString().length === 42 || ele.toString().length === 66) {
          obj[key] = ele.toString();
        } else {
          obj[key] = BigInt(ele).toString();
        }
      } else {
        obj[key] = BigInt(ele).toString();
      }
    }
  });
}

const increaseTime = (addSeconds) => {
  const id = Date.now();

  return new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [addSeconds],
      id,
    }, (err1) => {
      if (err1) return reject(err1);

      web3.currentProvider.send({
        jsonrpc: '2.0',
        method: 'evm_mine',
        id: id + 1,
      }, (err2, res) => (err2 ? reject(err2) : resolve(res)));
    });
  });
}

module.exports = {
  pimpVerifier,
  arraifyAsEthers,
  increaseTime
}
