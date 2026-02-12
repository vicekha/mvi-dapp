@echo off
REM RPC Health Check and Auto-Deploy Script

echo ========================================
echo Lasna RPC Health Monitor
echo ========================================
echo.
echo Checking RPC status...
echo.

cd ..\frontend
node check_rpc_health.js --once

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo RPC is healthy! Ready to deploy V7.
    echo ========================================
    echo.
    set /p DEPLOY="Deploy V7 now? (y/n): "
    
    if /i "%DEPLOY%"=="y" (
        cd ..\contracts
        echo.
        echo Deploying V7 RSC...
        echo.
        forge script script/DeployReactiveCallbackV7.s.sol:DeployReactiveCallbackV7 --rpc-url https://lasna-rpc.rnk.dev/ --broadcast --legacy --private-key 0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088
        
        if %ERRORLEVEL% EQU 0 (
            echo.
            echo ========================================
            echo V7 DEPLOYED SUCCESSFULLY!
            echo Auto-matching should now work.
            echo ========================================
        ) else (
            echo.
            echo Deployment failed. Check logs above.
        )
    )
) else (
    echo.
    echo ========================================
    echo RPC is currently down.
    echo ========================================
    echo.
    set /p MONITOR="Start continuous monitoring? (y/n): "
    
    if /i "%MONITOR%"=="y" (
        echo.
        echo Starting continuous RPC monitoring...
        echo Press Ctrl+C to stop.
        echo.
        node check_rpc_health.js
    )
)

echo.
pause
