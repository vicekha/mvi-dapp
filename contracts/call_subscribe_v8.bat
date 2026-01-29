@echo off
echo Calling subscribe() on V8 RSC...
echo Address: 0x256a19ffa31bfde2e0553443fe96def88481bae14
echo.

C:\Users\Dream\.foundry\bin\cast.exe send 0x256a19ffa31bfde2e0553443fe96def88481bae14 "subscribe()" --rpc-url https://lasna-rpc.rnk.dev/ --private-key 0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088 --legacy --gas-limit 1000000

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo V8 SUBSCRIBE SUCCESSFUL!
    echo Full cross-chain auto-matching is ACTIVE!
    echo ========================================
) else (
    echo.
    echo Subscribe failed. Check error above.
)

pause
