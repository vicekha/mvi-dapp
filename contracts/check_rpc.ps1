$ErrorActionPreference = "Stop"
try {
    $content = Get-Content .env
    $rpcLine = $content | Select-String "SEPOLIA_RPC_URL"
    if (-not $rpcLine) { throw "SEPOLIA_RPC_URL not found in .env" }
    $rpc = $rpcLine.ToString().Split('=')[1].Trim()

    Write-Host "Testing RPC URL: $rpc"
    
    $body = @{
        jsonrpc = "2.0"
        method  = "eth_blockNumber"
        params  = @()
        id      = 1
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri $rpc -Method Post -Body $body -ContentType "application/json"
        Write-Host "Success! Current Block: $($response.result)"
    }
    catch {
        Write-Host "RPC Request Failed:"
        Write-Host $_.Exception.Message
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
            Write-Host "Response Body: $($reader.ReadToEnd())"
        }
    }
}
catch {
    Write-Error $_
}
