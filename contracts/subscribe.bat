@echo off
REM Manual RSC Subscription using Cast
echo === Manual RSC Subscription ===
echo.

set RSC_ADDRESS=0x750b6aB0C38BDb756f5697b022B5493E8A6ea9206
set RPC_URL=https://lasna-rpc.rnk.dev/
set PRIVATE_KEY=0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088

echo Contract: %RSC_ADDRESS%
echo Network: Lasna Testnet
echo.
echo Calling subscribe()...
echo.

C:\Users\Dream\.foundry\bin\cast.exe send %RSC_ADDRESS% "subscribe()" --rpc-url %RPC_URL% --private-key %PRIVATE_KEY% --legacy --gas-limit 3000000 > subscribe_result.log 2>&1

if %ERRORLEVEL% EQU 0 (
    echo.
    echo === Subscription Successful! ===
    type subscribe_result.log
    echo.
    echo Your RSC is now listening for cross-chain events.
    echo Try creating a new swap order to test auto-matching!
) else (
    echo.
    echo === Subscription Failed ===
    echo Error details:
    type subscribe_result.log
)
