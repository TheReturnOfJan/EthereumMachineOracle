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
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
var MerkleLib = require('../helpers/MerkleLib.js');
var treeDepth = 16;
var Challenger = /** @class */ (function () {
    function Challenger(machineInstance, seed, treeClass) {
        if (treeClass === void 0) { treeClass = MerkleLib; }
        this.seed = seed;
        this.treeClass = treeClass;
        this.machineInstance = machineInstance;
        this.listCorrectStates = [];
        this.listIncorrectStates = [];
    }
    Challenger.prototype.init = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.calcStateLists()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.buildTrees()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Challenger.prototype.getIncorrectImage = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.treeCorrect) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/, this.machineInstance.project(this.listIncorrectStates[this.listCorrectStates.length - 1])];
                }
            });
        });
    };
    Challenger.prototype.computeImage = function (seed) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.machineInstance.run(seed)];
            });
        });
    };
    Challenger.prototype.computeImageHash = function (image) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.machineInstance.imageHash(image)];
            });
        });
    };
    Challenger.prototype.computeInitialStateHash = function (seed) {
        return __awaiter(this, void 0, void 0, function () {
            var initialState;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.machineInstance.create(seed)];
                    case 1:
                        initialState = _a.sent();
                        return [2 /*return*/, this.machineInstance.stateHash(initialState)];
                }
            });
        });
    };
    Challenger.prototype.calcStateLists = function () {
        return __awaiter(this, void 0, void 0, function () {
            var state, isTerminal, index, el1, el2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.machineInstance.create(this.seed)];
                    case 1:
                        state = _a.sent();
                        this.listCorrectStates.push(state);
                        return [4 /*yield*/, this.machineInstance.isTerminal(state)];
                    case 2:
                        isTerminal = _a.sent();
                        _a.label = 3;
                    case 3:
                        if (!!isTerminal) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.machineInstance.next(state)];
                    case 4:
                        state = (_a.sent())[0];
                        this.listCorrectStates.push(state);
                        return [4 /*yield*/, this.machineInstance.isTerminal(state)];
                    case 5:
                        isTerminal = _a.sent();
                        return [3 /*break*/, 3];
                    case 6:
                        index = Math.floor(this.listCorrectStates.length / 2) - 1;
                        el1 = this.listCorrectStates[index];
                        el2 = this.listCorrectStates[index + 1];
                        this.listIncorrectStates = __spreadArrays(this.listCorrectStates);
                        this.listIncorrectStates[index] = el2;
                        this.listIncorrectStates[index + 1] = el1;
                        return [2 /*return*/];
                }
            });
        });
    };
    Challenger.prototype.buildTrees = function () {
        return __awaiter(this, void 0, void 0, function () {
            var leaves, i, _a, _b, incorrectLeaves, i, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        leaves = {};
                        i = 0;
                        _e.label = 1;
                    case 1:
                        if (!(i < this.listCorrectStates.length)) return [3 /*break*/, 4];
                        _a = leaves;
                        _b = i;
                        return [4 /*yield*/, this.machineInstance.stateHash(this.listCorrectStates[i])];
                    case 2:
                        _a[_b] = _e.sent();
                        _e.label = 3;
                    case 3:
                        i++;
                        return [3 /*break*/, 1];
                    case 4:
                        this.treeCorrect = new this.treeClass(treeDepth, leaves);
                        incorrectLeaves = {};
                        i = 0;
                        _e.label = 5;
                    case 5:
                        if (!(i < this.listIncorrectStates.length)) return [3 /*break*/, 8];
                        _c = incorrectLeaves;
                        _d = i;
                        return [4 /*yield*/, this.machineInstance.stateHash(this.listIncorrectStates[i])];
                    case 6:
                        _c[_d] = _e.sent();
                        _e.label = 7;
                    case 7:
                        i++;
                        return [3 /*break*/, 5];
                    case 8:
                        this.treeIncorrect = new this.treeClass(treeDepth, incorrectLeaves);
                        return [2 /*return*/];
                }
            });
        });
    };
    Challenger.prototype.getCommitmentRoot = function (treeType) {
        if (treeType === void 0) { treeType = true; }
        return __awaiter(this, void 0, void 0, function () {
            var root;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.treeCorrect) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        root = treeType ? this.treeCorrect.root : this.treeIncorrect.root;
                        return [2 /*return*/, root];
                }
            });
        });
    };
    Challenger.prototype.getDisagreementNode = function (currentDepth, disagreementPoint, treeType) {
        if (treeType === void 0) { treeType = true; }
        return __awaiter(this, void 0, void 0, function () {
            var node;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.treeCorrect) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        node = treeType ? this.treeCorrect.getNodeByParent(currentDepth, disagreementPoint) : this.treeIncorrect.getNodeByParent(currentDepth, disagreementPoint);
                        return [2 /*return*/, node];
                }
            });
        });
    };
    Challenger.prototype.getProofByIndex = function (index, treeType) {
        if (treeType === void 0) { treeType = true; }
        return __awaiter(this, void 0, void 0, function () {
            var leaf, _a, proofElements;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!!this.treeCorrect) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        if (!treeType) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.machineInstance.stateHash(this.listCorrectStates[index])];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, this.machineInstance.stateHash(this.listCorrectStates[index])];
                    case 5:
                        _a = _b.sent();
                        _b.label = 6;
                    case 6:
                        leaf = _a;
                        proofElements = treeType ? this.treeCorrect.createMerkleProof(index) : this.treeIncorrect.createMerkleProof(index);
                        return [2 /*return*/, {
                                leaf: leaf,
                                data: proofElements,
                                path: index
                            }];
                }
            });
        });
    };
    Challenger.prototype.finalState = function (treeType) {
        if (treeType === void 0) { treeType = true; }
        return __awaiter(this, void 0, void 0, function () {
            var index, state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.treeCorrect) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        index = treeType ? this.listCorrectStates.length - 1 : this.listIncorrectStates.length - 1;
                        state = treeType ? this.listCorrectStates[index] : this.listIncorrectStates[index];
                        return [2 /*return*/, [
                                index,
                                state
                            ]];
                }
            });
        });
    };
    Challenger.prototype.getStateByIndex = function (index, treeType) {
        if (treeType === void 0) { treeType = true; }
        return __awaiter(this, void 0, void 0, function () {
            var state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.treeCorrect) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.init()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        state = treeType ? this.listCorrectStates[index] : this.listIncorrectStates[index];
                        return [2 /*return*/, state];
                }
            });
        });
    };
    return Challenger;
}());
exports["default"] = Challenger;
