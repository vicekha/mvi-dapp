// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "reactive-lib/interfaces/IReactive.sol";
import "reactive-lib/abstract-base/AbstractReactive.sol";

contract MockRSC is IReactive, AbstractReactive {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function react(LogRecord calldata log) external vmOnly {}
}
