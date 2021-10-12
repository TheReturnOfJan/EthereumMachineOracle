"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
var solidity_parser_antlr_1 = require("solidity-parser-antlr");
var ethers_1 = require("ethers");
var getRandomIntInRange = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};
function findAllStructDefinitions(ast) {
    var structDefs = [];
    solidity_parser_antlr_1.visit(ast, {
        StructDefinition: function (node) {
            structDefs.push(node);
        }
    });
    return structDefs;
}
function findStructDefinition(name, ast) {
    var def;
    solidity_parser_antlr_1.visit(ast, {
        StructDefinition: function (node) {
            if (node.name === name)
                def = node;
        }
    });
    if (!def)
        throw new Error("Struct definition for " + name + " not found");
    return def;
}
function generateType(type, ast) {
    switch (type.type) {
        case 'ElementaryTypeName':
            return generateElementaryType(type, ast);
        case 'UserDefinedTypeName':
            return generateUserDefinedType(type, ast);
        case 'Mapping':
            throw new Error('Generator for mapping types is not yet implemented');
        case 'ArrayTypeName':
            return generateArrayType(type, ast);
        case 'FunctionTypeName':
            return generateElementaryType({
                type: 'ElementaryTypeName',
                name: 'bytes24'
            }, ast);
    }
}
function generateStruct(structDefinition, ast) {
    return structDefinition.members.reduce(function (acc, cv) {
        var _a;
        return __assign(__assign({}, acc), (_a = {}, _a[cv.name] = generateType(cv.typeName, ast), _a));
    }, {});
}
function generateUserDefinedType(userDefinedType, ast) {
    // what do do when it is not a struct??
    var structName = userDefinedType.namePath.split(".").slice(-1)[0];
    var structDefinition = findStructDefinition(structName, ast);
    return generateStruct(structDefinition, ast);
}
function generateArrayType(type, ast) {
    // eval length expression???
    var length = getRandomIntInRange(0, 20);
    return __spreadArrays(Array(length)).map(function (x) { return generateType(type.baseTypeName, ast); });
}
function generateElementaryType(elementaryType, ast) {
    var typeName = elementaryType.name;
    var isInt = function (name) {
        return name.includes('int');
    };
    var isFixedBytes = function (name) {
        return name.includes('byte');
    };
    var getNum = function (name, def) {
        var regx = name.match(/\d/g);
        if (regx)
            return parseInt(regx.join(""));
        else
            return def;
    };
    var getRandomByte = function () {
        var num = getRandomIntInRange(0, 63);
        return ethers_1.utils.hexlify(num);
    };
    var getRandomBytes = function (num) {
        return ethers_1.utils.hexlify(ethers_1.utils.concat(__spreadArrays(Array(num)).map(function (x) { return getRandomByte(); })));
    };
    switch (typeName) {
        case 'bool':
            return Math.random() > 0.5;
        case 'address':
            return getRandomBytes(20);
        default:
            if (isInt(typeName)) {
                var num = getNum(typeName, 256);
                return getRandomBytes(num / 8);
            }
            else if (isFixedBytes(typeName)) {
                var num = getNum(typeName, 1);
                return getRandomBytes(num);
            }
            else {
                throw new Error("Generetor for elementary type " + elementaryType.name + " is not implemented yet. Contact your local EMO developer to implement it");
            }
    }
}
function getStructGeneratorsForCode(code) {
    var ast = solidity_parser_antlr_1.parse(code, {});
    return findAllStructDefinitions(ast).reduce(function (acc, cv) {
        var _a;
        return __assign(__assign({}, acc), (_a = {}, _a["gen" + cv.name] = function () { return generateStruct(cv, ast); }, _a));
    }, {});
}
module.exports = getStructGeneratorsForCode;
