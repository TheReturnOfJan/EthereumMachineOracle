#! /bin/bash

# Compiles with template
solc src/Oracle.sol src/Court.sol 
# Compiles with example implementation
# TODO fix below
# sed 's|Machine.template.sol|src/ExampleMachine.sol|' src/Oracle.sol | solc -
# sed 's|Oracle.sol|src/Oracle.sol|' src/Court.sol | solc -
