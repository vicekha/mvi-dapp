
import subprocess
import os

rpc_url = "https://lasna-rpc.rnk.dev/"
private_key = "0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088"


def run_command(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, shell=True)
    if result.returncode != 0:
        raise Exception(f"Command failed: {cmd}\nError: {result.stderr}")
    return result.stdout.strip()

def main():
    try:
        print("Getting bytecode...")
        bytecode = run_command("forge inspect src/SwapMatcherRSC.sol:SwapMatcherRSC bytecode")
        
        print("Encoding args...")
        args_cmd = 'cast abi-encode "constructor(address,uint256,uint256,address,address)" 0x0000000000000000000000000000000000fffFfF 11155111 5318007 0x4a267C1b4926056932659577E6c2C7E15d4AFFEd 0x61274f9ccf9708ad588c21aaf07bfc1c214ccc01'
        args = run_command(args_cmd)
        
        if args.startswith("0x"):
            args = args[2:]
            
        payload = bytecode + args
        print(f"Payload length: {len(payload)}")
        
        # Write payload to temp file just in case command line is still an issue, 
        # but try direct first? No, direct caused issues in powershell.
        # But subprocess in Python handles large args better.
        
        cmd = [
            "cast", "send", "--create", payload,
            "--rpc-url", rpc_url,
            "--private-key", private_key,
            "--legacy",
            "--json"
        ]
        
        print("Executing cast send...")
        # shell=False is default, arguments are passed as list, safe from shell limits usually
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print("Error executing cast send:")
            print(result.stderr)
        else:
            print("Deployment successful!")
            print(result.stdout)
            
    except Exception as e:
        print(f"Script failed: {e}")

if __name__ == "__main__":
    main()
