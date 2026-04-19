Write-Host "Starting AutoSwap Mainnet Deployment (Sonic Network)..." -ForegroundColor Cyan

# Ensure .env dependencies are loaded into the process directly 
$envFile = ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match "^[^#]*=" } | ForEach-Object {
        $name, $value = $_.Split('=', 2)
        [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim())
    }
    Write-Host "Loaded .env file" -ForegroundColor Green
}

# 1. Run Tests to verify logic before mainnet deploy
Write-Host "Running Forge test suite to ensure no regressions..." -ForegroundColor Cyan
forge test
if ($LASTEXITCODE -ne 0) {
    Write-Host "Tests failed! Aborting mainnet deployment." -ForegroundColor Red
    exit 1
}

# 2. Deploy the scripts using the API keys for verification
Write-Host "Deploying to Sonic Mainnet and verifying..." -ForegroundColor Cyan
forge script script/DeploySonicMainnet.s.sol:DeploySonicMainnet --rpc-url sonicMainnet --broadcast --verify --chain 146 --with-gas-price 150000000000
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed! Check your gas balance and SONICSCAN_KEY." -ForegroundColor Red
    exit 1
}

# 3. Parse addresses.json
Write-Host "Parsing run-latest.json into addresses.json..." -ForegroundColor Cyan
node -e "
const fs = require('fs');
const runLatestPath = './broadcast/DeploySonicMainnet.s.sol/146/run-latest.json';
if (!fs.existsSync(runLatestPath)) {
    console.error('Could not find run-latest.json. Deployment might have failed entirely.');
    process.exit(1);
}
const runLatest = JSON.parse(fs.readFileSync(runLatestPath, 'utf8'));
const addressMapPath = '../frontend/src/contracts/addresses.json';
let addressMap = JSON.parse(fs.readFileSync(addressMapPath, 'utf8'));

if (!addressMap['146']) addressMap['146'] = {};

runLatest.transactions.forEach(tx => {
    if (tx.transactionType === 'CREATE' && tx.contractName) {
        addressMap['146'][tx.contractName] = tx.contractAddress;
    }
});

fs.writeFileSync(addressMapPath, JSON.stringify(addressMap, null, 2));
console.log('Successfully updated frontend addresses.json for Sonic Mainnet (146)');
"

Write-Host "Sonic Mainnet deployment sequence complete! You can now run 'npm run deploy' in the frontend folder." -ForegroundColor Green
