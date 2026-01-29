@echo off
echo Calling subscribe() on V9 RSC...
echo Address: 0x55ed2321aad341929efa1059017c287fd1272b44
echo.

C:\Users\Dream\.foundry\bin\cast.exe send 0x55ed2321aad341929efa1059017c287fd1272b44 "subscribe()" --rpc-url https://lasna-rpc.rnk.dev/ --private-key 0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088 --legacy --gas-limit 1000000

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo V9 SUBSCRIBE SUCCESSFUL!
    echo Cross-chain auto swaps are NOW ACTIVE!
    echo ========================================
) else (
    echo.
    echo Subscribe failed. Check error above.
)

pause
