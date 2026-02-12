// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

/**
 * @title CallbackReceiver
 * @notice Simple contract that receives callbacks and emits events
 */
contract CallbackReceiver {
    event PingReceived(address sender, string message, uint256 timestamp);
    
    uint256 public pingCount;
    string public lastMessage;
    address public lastSender;
    
    function ping(string memory message) external {
        pingCount++;
        lastMessage = message;
        lastSender = msg.sender;
        emit PingReceived(msg.sender, message, block.timestamp);
    }
    
    function getState() external view returns (uint256, string memory, address) {
        return (pingCount, lastMessage, lastSender);
    }
}
