from eth_utils import keccak
import sys

sig = "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)"
hash_val = keccak(text=sig).hex()
print(f"Signature: {sig}")
print(f"Hash: 0x{hash_val}")
