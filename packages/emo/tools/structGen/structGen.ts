import {
    parse,
    visit,
    StructDefinition,
    ASTNode,
    VariableDeclaration,
    TypeName,
    ElementaryTypeName,
    UserDefinedTypeName,
    ArrayTypeName
} from '@solidity-parser/parser';
import { utils } from 'ethers';

const getRandomIntInRange = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function findAllStructDefinitions(ast: ASTNode): Array<StructDefinition> {
    let structDefs = [];
    visit(ast, {
        StructDefinition: (node: StructDefinition) => {
            structDefs.push(node);
        }
    });
    return structDefs;
}

function findStructDefinition(name: String, ast: ASTNode): StructDefinition {
    let def;
    visit(ast, {
        StructDefinition: (node: StructDefinition) => {
            if (node.name === name)
                def = node;
        }
    });
    if (!def) throw new Error(`Struct definition for ${name} not found`);
    return def;
}

function generateType(type: TypeName, ast: ASTNode): any {
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
                name: 'bytes24',
            }, ast);
    }
}

function generateStruct(structDefinition: StructDefinition, ast: ASTNode): any {
    return structDefinition.members.reduce((acc: any, cv: VariableDeclaration) => {
        return {
            ...acc,
            [cv.name]: generateType(cv.typeName, ast),
        };
    }, {});
}

function generateUserDefinedType(userDefinedType: UserDefinedTypeName, ast: ASTNode): any {
    // what do do when it is not a struct??
    const structName = userDefinedType.namePath.split(".").slice(-1)[0];
    const structDefinition = findStructDefinition(structName, ast);
    return generateStruct(structDefinition, ast);
}

function generateArrayType(type: ArrayTypeName, ast: ASTNode): any {
    // eval length expression???
    const length = getRandomIntInRange(0, 20);
    return [...Array(length)].map(x => generateType(type.baseTypeName, ast));
}

function generateElementaryType(elementaryType: ElementaryTypeName, ast: ASTNode): any {
    const typeName = elementaryType.name;
    const isInt = (name) => {
        return name.includes('int');
    }
    const isFixedBytes = (name) => {
        return name.includes('byte');
    }
    const getNum = (name, def) => {
        const regx = name.match(/\d/g);
        if (regx)
            return parseInt(regx.join(""));
        else
            return def;
    }
    const getRandomByte = () => {
        const num = getRandomIntInRange(0, 255);
        return utils.hexlify(num);
    }
    const getRandomBytes = (num) => {
        return utils.hexlify(utils.concat([...Array(num)].map(x => getRandomByte())));
    }
    switch (typeName) {
        case 'bool':
            return Math.random() > 0.5;
        case 'addess':
            return getRandomBytes(20);
        default:
            if (isInt(typeName)) {
                const num = getNum(typeName, 256);
                return getRandomBytes(num / 8);
            } else if (isFixedBytes(typeName)) {
                const num = getNum(typeName, 1);
                return getRandomBytes(num);
            } else {
                throw new Error(`Generetor for elementary type ${elementaryType.name} is not implemented yet. Contact your local EMO developer to implement it`);
            }
    }
}

function getStructGeneratorsForCode(code: string): any {
    const ast = parse(code, {});
    return findAllStructDefinitions(ast).reduce((acc: any, cv) => {
        return {
            ...acc,
            [`gen${cv.name}`]: () => generateStruct(cv, ast),
        };
    }, {});
}

export = getStructGeneratorsForCode;
