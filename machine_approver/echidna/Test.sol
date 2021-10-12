pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "./ExampleMachine.sol";

contract Test {

  using Machine for uint;

  uint r = 0;

  function setR(uint random) public {
    r = random;
  }

  function rand() public returns (uint) {
    uint fresh = uint(keccak256(abi.encode(r)));
    r = fresh;
    return r;
  }
/*
  function echidna_generateDarkStack() public returns (bool) {
    (DarkStack.Stack memory stack1, DarkStack.Stack memory stack2, ) = DarkStack.generate(rand());

    return DarkStack.hash(stack1) == DarkStack.hash(stack2);
  }
*/
  function echidna_generateState() public returns (bool) {
    (Machine.State memory state1, Machine.State memory state2, ) = rand().generate();

    return Machine.stateHash(state1) == Machine.stateHash(state2);
  }

  function echidna_imageHash_main() public returns (bool) {
    (Machine.State memory state1, Machine.State memory state2, ) = rand().generate();

    return Machine.imageHash(Machine.project(state1)) == Machine.imageHash(Machine.project(state2));
  }

  function echidna_noninterference_main() public returns (bool) {
    (Machine.State memory state1, Machine.State memory state2, ) = rand().generate();

    (Machine.State memory state1next, bool ok1) = Machine.next(state1);
    (Machine.State memory state2next, bool ok2) = Machine.next(state2);

    if (!ok1 || !ok2) {
      return true;
    }

    return Machine.stateHash(state1next) == Machine.stateHash(state2next);
  }

  // The initial terminal property
  function echidna_terminal_main() public returns (bool) {
    ( , , Machine.State memory state3) = rand().generate();
    bool isTerminal = Machine.isTerminal(state3);
    bool isDark;

    while (!isTerminal) {
      (state3, isDark) = Machine.next(state3);
      if (isDark) {
        return false;
      }
      isTerminal = Machine.isTerminal(state3);
    }

    (Machine.State memory next, ) = Machine.next(state3);
    return Machine.stateHash(state3) == Machine.stateHash(next);
  }

  // We need to decide how we will analyze results and give good Errors to user.
  // One way is to separate each main function on several functions that will describe error cases that we can imagine.
  // For example, for terminal property the generate function implementation can be wrong
  // and with only one main function we don't know if the false is returned because of stateHashes doesn't match or isDark
  function echidna_terminal_isDark() public returns (bool) {
    ( , , Machine.State memory state3) = rand().generate();
    bool isTerminal = Machine.isTerminal(state3);
    bool isDark;

    while (!isTerminal) {
      (state3, isDark) = Machine.next(state3);
      if (isDark) {
        return false;
      }
      isTerminal = Machine.isTerminal(state3);
    }
    return true;
  }
}
