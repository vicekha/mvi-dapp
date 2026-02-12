import requests
import hashlib

def rlp_encode_addr(addr):
    # addr is 20 bytes
    return b'\x94' + addr

def rlp_encode_nonce(n):
    if n == 0:
        return b'\x80'
    if n < 0x80:
        return bytes([n])
    # For n < 2**16
    if n < 0x100:
        return b'\x81' + bytes([n])
    if n < 0x10000:
        return b'\x82' + bytes([n >> 8, n & 0xff])
    return b'' # Not implemented for larger

def compute_address(deployer_hex, nonce):
    deployer = bytes.fromhex(deployer_hex[2:])
    encoded_addr = rlp_encode_addr(deployer)
    encoded_nonce = rlp_encode_nonce(nonce)
    payload = encoded_addr + encoded_nonce
    # List encoding (0xc0 + len)
    full = bytes([0xc0 + len(payload)]) + payload
    
    # Hash it
    import hashlib
    # We need keccak256. If not available, we use a simple check or warn.
    # Trying to use eth_utils if available, else manual or skip.
    try:
        from eth_utils import keccak, to_checksum_address
        return to_checksum_address(keccak(full)[12:])
    except ImportError:
        # Manual keccak256 fallback if possible, but usually not in stdlib
        return "Manual Dev Needed"

def main():
    deployer = '0xB133a194893434107925682789F16662FB9DB062'
    url = 'https://lasna-rpc.rnk.dev/'
    
    for n in range(320, 340):
        # We'll use cast compute-address via subprocess to be 100% sure of the logic
        import subprocess
        cmd = f'C:\\Users\\Dream\\.foundry\\bin\\cast.exe compute-address {deployer} --nonce {n}'
        try:
            res = subprocess.check_output(cmd, shell=True).decode().strip()
            addr = res.split(': ')[1]
            # Check code
            r = requests.post(url, json={'jsonrpc':'2.0', 'method':'eth_getCode', 'params':[addr, 'latest'], 'id':1})
            code = r.json().get('result', '0x')
            if code != '0x':
                print(f"FOUND Nonce {n}: {addr} (len {len(code)})")
        except Exception as e:
            pass

if __name__ == "__main__":
    main()
