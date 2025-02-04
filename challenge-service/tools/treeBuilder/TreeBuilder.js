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
var MerkleLib = require('../helpers/MerkleLib.js');
var TreeBuilder = /** @class */ (function () {
    function TreeBuilder(machineInstance, treeDepth, treeClass) {
        if (treeDepth === void 0) { treeDepth = 8; }
        if (treeClass === void 0) { treeClass = MerkleLib; }
        this.machineInstance = machineInstance;
        this.treeClass = treeClass;
        this.treeDepth = treeDepth;
    }
    TreeBuilder.prototype.calcStateList = function (seed) {
        return __awaiter(this, void 0, void 0, function () {
            var stateList, state, isTerminal;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        stateList = [];
                        return [4 /*yield*/, this.machineInstance.create(seed)];
                    case 1:
                        state = _a.sent();
                        stateList.push(state);
                        return [4 /*yield*/, this.machineInstance.isTerminal(state)];
                    case 2:
                        isTerminal = _a.sent();
                        _a.label = 3;
                    case 3:
                        if (!!isTerminal) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.machineInstance.next(state)];
                    case 4:
                        state = (_a.sent())[0];
                        stateList.push(state);
                        return [4 /*yield*/, this.machineInstance.isTerminal(state)];
                    case 5:
                        isTerminal = _a.sent();
                        return [3 /*break*/, 3];
                    case 6: return [2 /*return*/, stateList];
                }
            });
        });
    };
    TreeBuilder.prototype.buildTree = function (seed) {
        return __awaiter(this, void 0, void 0, function () {
            var leaves, stateList, i, _a, _b, tree;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        leaves = {};
                        return [4 /*yield*/, this.calcStateList(seed)];
                    case 1:
                        stateList = _c.sent();
                        i = 0;
                        _c.label = 2;
                    case 2:
                        if (!(i < stateList.length)) return [3 /*break*/, 5];
                        _a = leaves;
                        _b = i;
                        return [4 /*yield*/, this.machineInstance.stateHash(stateList[i])];
                    case 3:
                        _a[_b] = _c.sent();
                        _c.label = 4;
                    case 4:
                        i++;
                        return [3 /*break*/, 2];
                    case 5:
                        tree = new this.treeClass(this.treeDepth, leaves);
                        return [2 /*return*/, tree];
                }
            });
        });
    };
    return TreeBuilder;
}());
exports["default"] = TreeBuilder;
