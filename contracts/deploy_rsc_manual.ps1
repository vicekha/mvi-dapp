$envContent = Get-Content .env
foreach ($line in $envContent) {
    if ($line -match '^PRIVATE_KEY=(.*)') {
        $env:PRIVATE_KEY = $matches[1]
    }
}

$RPC = "https://lasna-rpc.rnk.dev/"

$deployer = cast wallet address --private-key $env:PRIVATE_KEY
Write-Output "Deployer: $deployer"
$bal = cast balance $deployer --rpc-url $RPC
Write-Output "Balance (Lasna): $bal"

$bytecode = Get-Content bytecode.txt -Raw
$bytecode = $bytecode.Trim()
$args = Get-Content args.txt -Raw
$args = $args.Trim()
if ($args.StartsWith("0x")) { $args = $args.Substring(2) }

$payload = $bytecode + $args
if (-not $payload.StartsWith("0x")) { $payload = "0x" + $payload }

Write-Output "Payload length: $($payload.Length)"
$payload | Out-File -Encoding ascii final_payload.txt

Write-Output "Deploying RSC..."
# Use --json for structured output
$cmd = "cast send --create $payload --rpc-url $RPC --private-key $env:PRIVATE_KEY --legacy --json"
# We invoke it differently to avoid shell string limit issues if any, though on Windows 8k limit applies. 
# 24KB payload might exceed cmd length limit!

# FIX: If payload is too large, we cannot pass it as argument in cmd/powershell directly if it exceeds 8191 chars (cmd) or ~32k (ps).
# Contract bytecode is usually large.
# We must use `cast send --create` but maybe pass via stdin? cast doesn't support reading payload from stdin for create.
# But we can use `forge create --constructor-args ...` which worked locally but failed network.

# Alternative: Use `eth_sendRawTransaction`? No, too complex to sign manually.
# Helper: Write a tiny JS/TS script using ethers.js?
# Or Python?
# I have nodejs available.
# I can write `deploy_rsc.js` using `ethers` (if installed) or just `https` requests to RPC?
# ethers is likely installed in `frontend` or `node_modules`?
# I'll check `frontend/package.json`.

if ($payload.Length -gt 8000) {
    Write-Output "WARNING: Payload too long for command line ($($payload.Length))"
    Write-Output "Switching strategy to nodejs script."
    exit 1
}

Invoke-Expression $cmd
