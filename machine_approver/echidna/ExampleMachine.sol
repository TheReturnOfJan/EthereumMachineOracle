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
    returns (uint value, bool, bool) // value, bool, bool (isDark)
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

  function generate(uint seed)
    internal
    pure
    returns (Stack memory d1, Stack memory d2, Stack memory d3)
  {
    uint length1 = (seed % 50) + 1; // l1: (1, 50)
    seed = uint(keccak256(abi.encode(seed)));

    uint length2 = seed % length1; // l2: (0, l1) max: (0, 49) l1 > l2
    seed = uint(keccak256(abi.encode(seed)));

    uint[] memory top1 = new uint[](length1);
    uint[] memory top2 = new uint[](length2);
    uint[] memory mid  = new uint[](length1 - length2);
    for (uint i = 0; i < length1; i++) {
      top1[i] = seed;
      if (i < length1 - length2) {
        mid[i] = seed;
      }
      if (i >= length1 - length2) {
        top2[i - (length1 - length2)] = seed;
      }
      seed = uint(keccak256(abi.encode(seed)));
    }

    uint size = (seed % 50) + length1; // (length1, length1 + 49)
    seed = uint(keccak256(abi.encode(seed)));

    bytes32 rest;
    if (size == length1) {
      rest = 0x0;
    } else {
      rest = bytes32(seed);
      seed = uint(keccak256(abi.encode(seed)));
    }

    d1 = Stack({
      size: size,
      topValues: top1,
      hashOfRest: rest
    });

    Stack memory temp = Stack({
      size: size - length2,
      topValues: mid,
      hashOfRest: rest
    });

    bytes32 rest2 = hash(temp);

    d2 = Stack({
      size: size,
      topValues: top2,
      hashOfRest: rest2
    });

    // Generate stack for terminal state
    d3 = Stack({
      size: top1.length,
      topValues: top1,
      hashOfRest: 0x0
    });
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

  function generate(uint seed)
    public
    pure
    returns (State memory, State memory, State memory)
  {
    State memory state1;
    State memory state2;
    State memory state3;

    uint sum = seed;
    seed = uint(keccak256(abi.encode(seed)));

    (DarkStack.Stack memory stack1, DarkStack.Stack memory stack2, DarkStack.Stack memory stack3) = DarkStack.generate(seed);
    // Two states for non-interference
    state1.sum = sum;
    state1.stack = stack1;

    state2.sum = sum;
    state2.stack = stack2;
    // Terminal state
    state3.sum = sum;
    state3.stack = stack3;

    return (state1, state2, state3);
  }
}
