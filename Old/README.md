# Ethereum Machine Oracle

This project is a set of smart contracts for Ethereum, capable of verifying large computations off chain.

It aims to be generic, capable of verifying computations done on any abstract machine implementing a specified [interface](./src/Machine.template.sol), using the [truebit](https://people.cs.uchicago.edu/~teutsch/papers/truebit.pdf) style verification game. 

This is a spiritual successor to [solEVM enforcer](https://github.com/leapdao/solEVM-enforcer).

## Developer guide

### Requirements

You have to have the [solidity command line compiler](https://solidity.readthedocs.io/en/v0.6.2/installing-solidity.html#binary-packages) (version >= 0.6.0) installed on your machine.

### Commands

To typecheck run:

```./typecheck.sh```

Setup:
```npm install```

Build:
```MACHINE=ExampleMachine.sol node build.js```

Test:
```MACHINE=ExampleMachine.sol npm run test```

## [Explainer](https://hackmd.io/DXVvXgFKRQae8Sy3ncrJ3g?view)
