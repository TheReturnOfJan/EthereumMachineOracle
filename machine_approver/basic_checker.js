const fs = require('fs');
const solc = require('solc');
const machinePath = process.argv[2];

if (!machinePath) {
  console.log("There is no file path.");
  process.exit();
}

function main() {
  let file = getFileContents();
  let compiledOutput = getCompilerArtifacts(file);
  let machine = compiledOutput[machinePath].Machine;

  if (!machine) {
    console.log("Library name must be 'Machine'.");
    process.exit()
  }
  checkInterface(machine);
  console.log("Your file passed basic checker.");
  replaceImportPathInTestSol();
  replaceLibPathInConfig();
}

const getFileContents = () => {
  if (machinePath.slice(-4) !== '.sol') {
    console.log("The file extension must be .sol");
    process.exit();
  }
  if (machinePath.slice(0,5) !== '/src/') {
    console.log("The file path must start with /src/ , because the command must be run from the directory where file is on a host and this directory should be mounted to docker container /src directory by '-v `pwd`:/src'.");
    process.exit();
  }
  let contents;
  try {
    contents = fs.readFileSync(machinePath, "utf8");
  } catch (e) {
    console.log(`You've passed wrong argument. There is no file ${machinePath}, please try to pass the full path to a file.`);
    process.exit();
  }
  return contents;
}

const getCompilerArtifacts = (file) => {
  // TODO: check the pragma solidity version and use solc.version that match
  let input = {
    language: "Solidity",
    sources: {
      [machinePath]: {
        content: file
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['*']
        }
      }
    }
  };

  function findImports(path) {
    //TODO: check if github and handle case
    let file;
    try {
      file = fs.readFileSync(path, 'utf-8')
    } catch(e) {
      return { error: "File not found"}
    }
    return { contents: file}
  }

  let output = JSON.parse(solc.compile(JSON.stringify(input), {import: findImports}));

  if(!output.contracts) {
      console.log("Your contract doesn't compile. Check the errors log below. Handle the errors. Try out after fix again.");
      console.log(output.errors);
      process.exit();
  }
  return output.contracts;
}


//next step check ABI
const checkInterface = (machine) => {
  const methods = [
  'create(Machine.Seed)',
  'imageHash(Machine.Image)',
  'isTerminal(Machine.State)',
  'next(Machine.State)',
  'project(Machine.State)',
  'stateHash(Machine.State)',
  'generate(uint256)'
  ];
  let machineMethods = Object.keys(machine.evm.methodIdentifiers);
  for (let i = 0; i < methods.length; i++) {
    if (!machineMethods.includes(methods[i])) {
      console.log(`Your Machine interface doesn't include method: ${methods[i]}`);
      process.exit();
    }
  }
  //TODO: check abi for outputs correctness

}

const replaceImportPathInTestSol = () => {
  let content = fs.readFileSync("./echidna/Test.sol", "utf-8");
  let newContent = content.replace("./ExampleMachine.sol", machinePath);
  fs.writeFileSync("./echidna/Test.sol", newContent, "utf-8");
}

const replaceLibPathInConfig = () => {
  let content = fs.readFileSync("./echidna/config.yaml", "utf-8");
  let newContent = content.replace("ExampleMachine.sol", machinePath);
  fs.writeFileSync("./echidna/config.yaml", newContent, "utf-8");
}

main();
