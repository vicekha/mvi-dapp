import requests
import subprocess

RPC_URL = "https://lasna-rpc.rnk.dev/"
DEPLOYER = "0xB133a194893434107925682789F16662FB9DB062"
CAST_PATH = r"C:\Users\Dream\.foundry\bin\cast.exe"

def get_addr(nonce):
    cmd = [CAST_PATH, "compute-address", DEPLOYER, "--nonce", str(nonce)]
    res = subprocess.check_output(cmd, text=True)
    return res.split(": ")[1].strip()

def check_code(addr):
    r = requests.post(RPC_URL, json={"jsonrpc":"2.0", "method":"eth_getCode", "params":[addr, "latest"], "id":1})
    return r.json().get("result", "0x")

for n in range(337, 345):
    addr = get_addr(n)
    code = check_code(addr)
    print(f"Nonce {n}: {addr} (Code len: {len(code)})")
