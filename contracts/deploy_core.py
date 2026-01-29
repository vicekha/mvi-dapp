import subprocess
import os
import json

RPC_URL = "https://lasna-rpc.rnk.dev/"
CAST_PATH = r"C:\Users\Dream\.foundry\bin\cast.exe"
FORGE_PATH = r"C:\Users\Dream\.foundry\bin\forge.exe"
TRUST_WALLET = "0x0dB12aAC15a63303d1363b8C862332C699Cca561"

def get_pk():
    with open('.env') as f:
        for line in f:
            if 'PRIVATE_KEY' in line:
                return line.split('=')[1].strip()
    return None

def get_bytecode(contract_path, contract_name):
    cmd = [FORGE_PATH, "inspect", f"{contract_path}:{contract_name}", "bytecode"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"Error inspecting {contract_name}: {proc.stderr}")
        return None
    return proc.stdout.strip()

def abi_encode(signature, args):
    cmd = [CAST_PATH, "abi-encode", signature] + args
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"Error encoding {signature}: {proc.stderr}")
        return ""
    return proc.stdout.strip()[2:] # Remove 0x

def deploy_contract(bytecode, name, encoded_args=""):
    pk = get_pk()
    full_bytecode = bytecode + encoded_args
    # Some cast versions need the help explicitly or different flag. 
    # But based on previous successful test, positional bytecode works if we don't use --create if it's bugged, 
    # but help said --create is there. Let's try positional bytecode first as it's standard for 'send'.
    # Actually, forge create is usually better if it works. Let's try forge create first with --legacy.
    
    # cmd = [CAST_PATH, "send", "--rpc-url", RPC_URL, "--private-key", pk, "--legacy", "--gas-limit", "5000000", "--create", full_bytecode]
    
    # Using forge create is often more reliable for linking etc.
    # But since we have the bytes, let's use cast send --create.
    cmd = [CAST_PATH, "send", "--create", full_bytecode, "--rpc-url", RPC_URL, "--private-key", pk, "--legacy", "--gas-limit", "5000000"]
    
    print(f"Deploying {name}...")
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"Error deploying {name}: {proc.stderr}")
        return None
    
    stdout = proc.stdout
    for line in stdout.splitlines():
        if "contractAddress" in line:
            return line.split()[-1].strip()
    return None

def main():
    pk = get_pk()
    
    # 1. VirtualLiquidityPool
    bc_lp = get_bytecode("src/VirtualLiquidityPool.sol", "VirtualLiquidityPool")
    addr_lp = deploy_contract(bc_lp, "VirtualLiquidityPool")
    print(f"LP: {addr_lp}")
    if not addr_lp: return

    # 2. AssetVerifier
    bc_av = get_bytecode("src/AssetVerifier.sol", "AssetVerifier")
    addr_av = deploy_contract(bc_av, "AssetVerifier")
    print(f"AV: {addr_av}")
    if not addr_av: return

    # 3. TrustWalletFeeDistributor
    bc_fd = get_bytecode("src/TrustWalletFeeDistributor.sol", "TrustWalletFeeDistributor")
    args_fd = abi_encode("constructor(address)", [TRUST_WALLET])
    addr_fd = deploy_contract(bc_fd, "TrustWalletFeeDistributor", args_fd)
    print(f"FD: {addr_fd}")
    if not addr_fd: return

    # 4. EulerLagrangeOrderProcessor
    bc_op = get_bytecode("src/EulerLagrangeOrderProcessor.sol", "EulerLagrangeOrderProcessor")
    args_op = abi_encode("constructor(address,address,address)", [addr_lp, addr_fd, addr_av])
    addr_op = deploy_contract(bc_op, "EulerLagrangeOrderProcessor", args_op)
    print(f"OP: {addr_op}")
    if not addr_op: return

    # 5. WalletSwapMain
    bc_ws = get_bytecode("src/WalletSwapMain.sol", "WalletSwapMain")
    args_ws = abi_encode("constructor(address,address,address,address)", [addr_lp, addr_op, addr_fd, addr_av])
    addr_ws = deploy_contract(bc_ws, "WalletSwapMain", args_ws)
    print(f"WS: {addr_ws}")
    if not addr_ws: return

    # 6. Configuration
    print("Linking OP to WS...")
    cmd_link = [CAST_PATH, "send", addr_op, "setWalletSwapMain(address)", addr_ws, "--rpc-url", RPC_URL, "--private-key", pk, "--legacy"]
    subprocess.run(cmd_link)

    print("\nFINAL ADDRESSES:")
    print(f"LASNA_LIQUIDITY_POOL={addr_lp}")
    print(f"LASNA_ASSET_VERIFIER={addr_av}")
    print(f"LASNA_FEE_DISTRIBUTOR={addr_fd}")
    print(f"LASNA_ORDER_PROCESSOR={addr_op}")
    print(f"LASNA_WALLET_SWAP_MAIN={addr_ws}")

if __name__ == "__main__":
    main()
