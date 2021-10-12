
pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

library DarkStack {
  struct Stack {
    uint[] topValues;
    bytes32 hashOfRest;
    uint size;
  }

  function pop(Stack memory self)
    internal
    pure
    returns (uint value, bool, bool)
  { 
    if (self.size < 1) {
       return (0, true, false);
    }
    if (self.size > 0 && self.topValues.length == 0) {
       return (0, false, true);
    }
    value = self.topValues[self.topValues.length-1];
    uint[] memory arr = self.topValues;
    assembly {
      mstore(arr, sub(mload(arr), 1))
    }
    self.size -= 1;
  }

  function hash(Stack memory self)
    internal
    pure
    returns (bytes32 stackHash)
  {
    stackHash = self.hashOfRest;
    uint[] memory topValues = self.topValues;
    for (uint i = 0; i<self.topValues.length; i++) {
      assembly {
        mstore(0, stackHash)
        mstore(0x20, mload(add(add(topValues, 0x20), mul(i, 0x20))))
        stackHash := keccak256(0, 0x40)
      }
    }
  }
}

// Sums all elements of stack
library Machine {

  using DarkStack for DarkStack.Stack;

  struct State {
    DarkStack.Stack stack;
    uint sum;
  }

  struct Seed {
    uint[] nums;
  }

  struct Image {
    uint sum;
  }

  function create(Seed memory _seed)
    public
    pure
    returns (State memory)
  {
    return State({
      stack: DarkStack.Stack({
        topValues: _seed.nums,
        hashOfRest: 0,
        size: _seed.nums.length
      }),
      sum: 0
    });
  }

  function project(State memory _state)
    public
    pure
    returns (Image memory)
  {
    return Image({
      sum: _state.sum
    });
  }

  function isTerminal(State memory _state)
    public
    pure
    returns (bool)
  {
    return _state.stack.size == 0; 
  }

  // next can fail if _state is "dark" where next needs to operate
  function next(State memory _state)
    public
    pure
    returns (State memory, bool)
  {
    (uint top,, bool isDark) = _state.stack.pop();
    if (isDark) return (_state, true);
    _state.sum += top;
    return (_state, false);
  }

  function stateHash(State memory _state)
    public
    pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(_state.stack.hash(), _state.sum));
  }

  function imageHash(Image memory _image)
    public
    pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(_image.sum));
  }
}
