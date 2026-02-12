$ErrorActionPreference = "Stop"

$sourceDir = "c:\Users\Dream\Downloads\mvi-dapp-complete"
$stagingDir = "c:\Users\Dream\Downloads\mvi-package-staging"
$zipPath = "c:\Users\Dream\Downloads\mvi-dapp-handover.zip"
$brainDir = "C:\Users\Dream\.gemini\antigravity\brain\b99def35-c09f-40a9-b295-b54231c96591"

Write-Host "Starting Packaging Process..."

# 1. Cleanup previous runs
if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

# 2. Create Staging Directory
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

# 3. Copy README
Copy-Item "$sourceDir\README_HANDOFF.md" "$stagingDir\README.md"

# 4. Copy Documentation Artifacts
Write-Host "Copying Documentation..."
if (Test-Path $brainDir) {
    Copy-Item "$brainDir\*.md" $stagingDir
}

# 5. Copy Contracts (Filtering)
Write-Host "Copying Contracts..."
$contractsDest = "$stagingDir\contracts"
Copy-Item "$sourceDir\contracts" $contractsDest -Recurse

# Clean Contracts (Remove Build Artifacts & Secrets)
Get-ChildItem "$contractsDest" -Include "out", "cache", "broadcast", "node_modules", ".env", "lib" -Recurse | Remove-Item -Recurse -Force
# Note: Removed 'lib' to reduce size; user must run `forge install`

# Create .env.example for Contracts
Set-Content "$contractsDest\.env.example" "PRIVATE_KEY=your_private_key_here`nSEPOLIA_RPC_URL=https://sepolia.example.com`nETHERSCAN_API_KEY=your_key`nTRUST_WALLET=your_trust_wallet_address"

# 6. Copy Frontend (Filtering)
Write-Host "Copying Frontend..."
$frontendDest = "$stagingDir\frontend"
Copy-Item "$sourceDir\frontend" $frontendDest -Recurse

# Clean Frontend
Get-ChildItem "$frontendDest" -Include "node_modules", "dist", "build", ".next", ".env" -Recurse | Remove-Item -Recurse -Force

# Create .env.example for Frontend
Set-Content "$frontendDest\.env.example" "VITE_WALLET_CONNECT_PROJECT_ID=your_project_id`nVITE_ALCHEMY_KEY=your_alchemy_key"

# 7. Zip It Up
Write-Host "Zipping Package..."
Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath

# 8. Cleanup Staging
Remove-Item -Recurse -Force $stagingDir

Write-Host "✅ Package Created Successfully at: $zipPath"
