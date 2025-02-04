# Ethereum Machine Oracle

This project is a set of smart contracts for Ethereum, capable of verifying large computations off chain.

It aims to be generic, capable of verifying computations done on any abstract machine implementing a specified [interface](./src/Machine.template.sol), using the [truebit](https://people.cs.uchicago.edu/~teutsch/papers/truebit.pdf) style verification game. 

This is a spiritual successor to [solEVM enforcer](https://github.com/leapdao/solEVM-enforcer).

It should provide developers with an easy way to verify computations done on an abstract machine in their own smart contracts.

## Dependencies

Truffle.

## [Explainer](https://hackmd.io/DXVvXgFKRQae8Sy3ncrJ3g?view)
