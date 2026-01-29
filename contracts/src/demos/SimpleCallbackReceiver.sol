// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleCallbackReceiver {
    event CallbackReceived(address sender, string message);

    function ping(string memory message) external {
        emit CallbackReceived(msg.sender, message);
    }
}
