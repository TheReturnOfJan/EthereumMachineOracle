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
var ethers_1 = require("ethers");
var utils_1 = require("./utils");
var ethereumjs_util_1 = require("ethereumjs-util");
var ethereumjs_account_1 = require("ethereumjs-account");
var ethereumjs_vm_1 = require("ethereumjs-vm");
var privKey = 'e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109';
var getFuncSigHash = function (name) {
    return ethereumjs_util_1.bufferToHex(ethereumjs_util_1.keccakFromString(name)).slice(0, 10);
};
var selectors = {
    create: getFuncSigHash("create(Machine.Seed)"),
    project: getFuncSigHash("project(Machine.State)"),
    isTerminal: getFuncSigHash("isTerminal(Machine.State)"),
    next: getFuncSigHash("next(Machine.State)"),
    stateHash: getFuncSigHash("stateHash(Machine.State)"),
    imageHash: getFuncSigHash("imageHash(Machine.Image)")
};
var Machine = /** @class */ (function () {
    function Machine(machineArtifact) {
        this.vm = new ethereumjs_vm_1["default"]();
        this.machineArtifact = machineArtifact;
        this.machineContract = ethers_1.ContractFactory.fromSolidity(machineArtifact);
    }
    Machine.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            var accountPk, accountAddress, account, bytecode, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        accountPk = Buffer.from(privKey, 'hex');
                        accountAddress = ethereumjs_util_1.privateToAddress(accountPk);
                        account = new ethereumjs_account_1["default"]({ balance: 1e18 });
                        return [4 /*yield*/, utils_1.putAccount(this.vm, accountAddress, account)];
                    case 1:
                        _b.sent();
                        bytecode = null;
                        if (this.machineArtifact.bytecode) {
                            bytecode = this.machineArtifact.bytecode;
                        }
                        else if (this.machineArtifact.evm && this.machineArtifact.evm.bytecode) {
                            bytecode = this.machineArtifact.evm.bytecode.object;
                        }
                        _a = this;
                        return [4 /*yield*/, utils_1.deployContract(this.vm, accountPk, bytecode.replace('0x', ''))];
                    case 2:
                        _a.machineAddress = _b.sent();
                        this.account = accountAddress;
                        return [2 /*return*/];
                }
            });
        });
    };
    Machine.prototype.callFunc = function (funcName, arg) {
        return __awaiter(this, void 0, void 0, function () {
            var funcFragment, params, encoded, result, decoded;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        funcFragment = this.machineContract.interface.getFunction(funcName);
                        params = this.machineContract.interface._encodeParams(funcFragment.inputs, [arg]);
                        encoded = ethereumjs_util_1.toBuffer(selectors[funcName] + params.replace("0x", ""));
                        return [4 /*yield*/, utils_1.executeContractCall(this.vm, this.machineAddress, this.account, encoded)];
                    case 3:
                        result = _a.sent();
                        decoded = this.machineContract.interface.decodeFunctionResult(funcFragment, result);
                        return [2 /*return*/, decoded.map(utils_1.ethersArrayToObject)];
                }
            });
        });
    };
    Machine.prototype.run = function (seed) {
        return __awaiter(this, void 0, void 0, function () {
            var state, isTerminal, image;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.create(seed)];
                    case 3:
                        state = _a.sent();
                        return [4 /*yield*/, this.isTerminal(state)];
                    case 4:
                        isTerminal = _a.sent();
                        _a.label = 5;
                    case 5:
                        if (!!isTerminal) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.next(state)];
                    case 6:
                        state = (_a.sent())[0];
                        return [4 /*yield*/, this.isTerminal(state)];
                    case 7:
                        isTerminal = _a.sent();
                        return [3 /*break*/, 5];
                    case 8: return [4 /*yield*/, this.project(state)];
                    case 9:
                        image = _a.sent();
                        return [2 /*return*/, image];
                }
            });
        });
    };
    Machine.prototype.computeAnswer = function (seed) {
        return __awaiter(this, void 0, void 0, function () {
            var image, imageHash;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.run(seed)];
                    case 3:
                        image = _a.sent();
                        return [4 /*yield*/, this.imageHash(image)];
                    case 4:
                        imageHash = _a.sent();
                        return [2 /*return*/, [image, imageHash]];
                }
            });
        });
    };
    Machine.prototype.create = function (seed) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.callFunc("create", seed)];
                    case 3: return [2 /*return*/, (_a.sent())[0]];
                }
            });
        });
    };
    Machine.prototype.project = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.callFunc("project", state)];
                    case 3: return [2 /*return*/, (_a.sent())[0]];
                }
            });
        });
    };
    Machine.prototype.isTerminal = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.callFunc("isTerminal", state)];
                    case 3: return [2 /*return*/, (_a.sent())[0]];
                }
            });
        });
    };
    Machine.prototype.next = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.callFunc("next", state)];
                    case 3:
                        result = _a.sent();
                        return [2 /*return*/, [result[0], result[1]]];
                }
            });
        });
    };
    Machine.prototype.stateHash = function (state) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.callFunc("stateHash", state)];
                    case 3: return [2 /*return*/, (_a.sent())[0]];
                }
            });
        });
    };
    Machine.prototype.imageHash = function (image) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.machineAddress) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.callFunc("imageHash", image)];
                    case 3: return [2 /*return*/, (_a.sent())[0]];
                }
            });
        });
    };
    return Machine;
}());
exports["default"] = Machine;
