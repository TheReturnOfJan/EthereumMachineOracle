"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.ethersArrayToObject = exports.executeContractCall = exports.putAccount = exports.deployContract = exports.getAccountNonce = void 0;
var ethereumjs_tx_1 = require("ethereumjs-tx");
var ethereumjs_util_1 = require("ethereumjs-util");
function getAccountNonce(vm, accountPrivateKey) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, (new Promise(function (resolve) {
                    vm.stateManager.getAccount(ethereumjs_util_1.privateToAddress(accountPrivateKey), function (_, acc) {
                        resolve(acc.nonce);
                    });
                }))];
        });
    });
}
exports.getAccountNonce = getAccountNonce;
function putAccount(vm, accountAddress, account) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    vm.stateManager.putAccount(accountAddress, account, function () { return resolve(); });
                })];
        });
    });
}
exports.putAccount = putAccount;
function deployContract(vm, senderPrivateKey, deploymentBytecode) {
    return __awaiter(this, void 0, void 0, function () {
        var tx, _a, deploymentResult;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = ethereumjs_tx_1.Transaction.bind;
                    _b = {
                        value: 0,
                        gasLimit: 10000000,
                        gasPrice: 1,
                        data: '0x' + deploymentBytecode
                    };
                    return [4 /*yield*/, getAccountNonce(vm, senderPrivateKey)];
                case 1:
                    tx = new (_a.apply(ethereumjs_tx_1.Transaction, [void 0, (_b.nonce = _c.sent(),
                            _b)]))();
                    tx.sign(senderPrivateKey);
                    return [4 /*yield*/, vm.runTx({ tx: tx })];
                case 2:
                    deploymentResult = _c.sent();
                    if (deploymentResult.execResult.exceptionError) {
                        throw deploymentResult.execResult.exceptionError;
                    }
                    return [2 /*return*/, deploymentResult.createdAddress];
            }
        });
    });
}
exports.deployContract = deployContract;
function executeContractCall(vm, contractAddress, caller, data) {
    return __awaiter(this, void 0, void 0, function () {
        var callResult;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, vm.runCall({
                        to: contractAddress,
                        caller: caller,
                        origin: caller,
                        data: data
                    })];
                case 1:
                    callResult = _a.sent();
                    if (callResult.execResult.exceptionError) {
                        throw callResult.execResult.exceptionError;
                    }
                    return [2 /*return*/, callResult.execResult.returnValue];
            }
        });
    });
}
exports.executeContractCall = executeContractCall;
var ethersArrayToObject = function (val) {
    if (!isEthersArray(val))
        return val;
    var normal = {};
    Object.keys(val).forEach(function (key) {
        var ele = val[key];
        var isNotNumber = parseInt(key) !== parseInt(key);
        var IsEleEthersArray = isEthersArray(ele);
        if (isNotNumber) {
            if (IsEleEthersArray) {
                normal[key] = ethersArrayToObject(ele);
            }
            else {
                normal[key] = ele;
            }
        }
    });
    return normal;
};
exports.ethersArrayToObject = ethersArrayToObject;
var isEthersArray = function (val) {
    var keys = Object.keys(val);
    var nums = keys.filter(function (k) { return parseInt(k) === parseInt(k); }).map(function (k) { return parseInt(k); });
    return (nums.length * 2 === keys.length) && keys.length > 0;
};
var objectToEthersArray = function (obj) {
    var arr = [];
    var i = 0;
    Object.keys(obj).forEach(function (key) {
        var ret = isEthersArray(obj[key]) ? objectToEthersArray(obj[key]) : obj[key];
        arr[i.toString()] = ret;
        arr[key] = ret;
        i++;
    });
    return arr;
};
