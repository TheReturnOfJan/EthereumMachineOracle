const Machine = artifacts.require('Machine');
const Merkle = artifacts.require('Merkle');
const Verifier = artifacts.require('ClaimVerifier');
const Falsifier = artifacts.require('ClaimFalsifier');
const Client = artifacts.require('Client');

const DEFAULT_TIMEOUT = 60;
const DEFAULT_STAKE_SIZE = '0x2c68af0bb140000';
const DEFAULT_MAX_TREE_DEPTH = 3;

module.exports = (deployer, network, accounts) => {
  const default_timeout = process.env.TIMEOUT || DEFAULT_TIMEOUT;
  const stake_size = process.env.STAKE_SIZE || DEFAULT_STAKE_SIZE;
  const max_tree_depth = process.env.MAX_TREE_DEPTH || DEFAULT_MAX_TREE_DEPTH;

  deployer.then(async () => {
    const machine = await deployer.deploy(Machine);
    const merkle = await deployer.deploy(Merkle);
    await deployer.link(Machine, [Verifier, Falsifier, Client]);
    await deployer.link(Merkle, Falsifier);
    const client = await deployer.deploy(Client, default_timeout);
    const falsifier = await deployer.deploy(Falsifier, stake_size, max_tree_depth, client.address);
    const verifierAddress = await falsifier.claimVerifier();
    const verifier = await Verifier.at(verifierAddress);
    console.log('Deployed ClaimVerifier at: ' + verifier.address);
  });

};
