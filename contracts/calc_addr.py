import rlp
from eth_utils import to_bytes, keccak, to_checksum_address

def compute_address(deployer_hex, nonce):
    deployer = to_bytes(hexstr=deployer_hex)
    rlp_encoded = rlp.encode([deployer, nonce])
    return to_checksum_address(keccak(rlp_encoded)[12:])

deployer = '0xB133a194893434107925682789F16662FB9DB062'
for n in range(320, 351):
    print(f"{n}: {compute_address(deployer, n)}")
