pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

// Import the Oracle contract to be able to call ask function.
import "./Oracle.sol";
// Import the library implementing the machine template here.
import "./Machine.template.sol";

// EMOClient aka Registry
contract EMOClient {
  IOracle oracle;

  uint public defaultTimeout;

  mapping(bytes32 => Machine.Seed) seeds; // initialStateHash => seed

  mapping(bytes32 => bytes32) public cache; // initialStateHash => imageHash
  mapping(bytes32 => Machine.Image) images; // imageHash => image
  mapping(bytes32 => uint8) public timesRetried; // initialStateHash => timesRetried
  mapping(bytes32 => bool) public failed; // initialStateHash => bool

  constructor(address _oracle, uint _defaultTimeout) public {
    oracle = IOracle(_oracle);
    defaultTimeout = _defaultTimeout;
  }

  function setTimeout(uint _newTimeout) public {
    defaultTimeout = _newTimeout;
  }

  function askOracle(Machine.Seed memory _seed) public {
    require(!_isAlreadyImageForSeed(_seed), "There is already image for your seed, please call showImage instead.");
    bytes32 initialStateHash = _seedToInitialStateHash(_seed);
    seeds[initialStateHash] = _seed;
    oracle.ask(_seed, defaultTimeout, this.successCallback, this.failCallback);
  }

  function successCallback(bytes32 _initialStateHash, Machine.Image memory _image) public {
    bytes32 imageHash = Machine.imageHash(_image);
    cache[_initialStateHash] = imageHash;
    images[imageHash] = _image;
  }

  function failCallback(bytes32 _questionKey) external {
    if (timesRetried[_questionKey] >= 2) {
      failed[_questionKey] = true;
    } else {
      _retry(_questionKey);
    }
  }

  function showImageBySeed(Machine.Seed memory _seed) public view returns(Machine.Image memory) {
    require(_isAlreadyImageForSeed(_seed), "There is no image in cache for your seed, please askOracle about your seed.");
    bytes32 initialStateHash = _seedToInitialStateHash(_seed);
    bytes32 imageHash = cache[initialStateHash];
    return images[imageHash];
  }

  function showImageByInitialStateHash(bytes32 _initialStateHash) external view returns(Machine.Image memory) {
    require(cache[_initialStateHash] > 0, "There is no image in cache for your initialStateHash, please askOracle about your seed.");
    bytes32 imageHash = cache[_initialStateHash];
    return images[imageHash];
  }

  function showSeedByInitialStateHash(bytes32 _initialStateHash) external view returns(Machine.Seed memory) {
    return seeds[_initialStateHash];
  }

  function imageHashForExampleMachine(Machine.Image memory _image) public pure returns(bytes32) {
    return keccak256(abi.encodePacked(_image.sum));
  }

  // Maybe set visibility to public, so the user can also compute and use initialStateHash instead of seed
  function _seedToInitialStateHash(Machine.Seed memory _seed) public pure returns(bytes32) {
    return Machine.stateHash(Machine.create(_seed));
  }

  function _isAlreadyImageForSeed(Machine.Seed memory _seed) internal view returns(bool) {
    return cache[_seedToInitialStateHash(_seed)] > 0;
  }

  function _retry(bytes32 _initialStateHash) internal {
    Machine.Seed memory seed = seeds[_initialStateHash];
    oracle.ask(seed, defaultTimeout, this.successCallback, this.failCallback);
    timesRetried[_initialStateHash]++;
  }

}
