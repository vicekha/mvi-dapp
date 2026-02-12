@echo off
echo Calling subscribe() on V7 RSC...
echo Address: 0xbea11017ba542bfaa9560d5cdf9825afb1ba9d73
echo.

C:\Users\Dream\.foundry\bin\cast.exe send 0xbea11017ba542bfaa9560d5cdf9825afb1ba9d73 "subscribe()" --rpc-url https://lasna-rpc.rnk.dev/ --private-key 0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088 --legacy --gas-limit 1000000

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUBSCRIBE SUCCESSFUL!
    echo Auto-matching is now ACTIVE!
    echo ========================================
) else (
    echo.
    echo Subscribe failed. Check error above.
)

pause
