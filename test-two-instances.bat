@echo off
REM Test script to launch two HongYan instances (Windows Batch)
REM Each instance gets its own data dir and ports so they don't collide.
REM
REM Env vars are set INSIDE the child cmd command rather than in the
REM parent shell, because `start` + `npx` (a .cmd wrapper) can lose env
REM vars during process inheritance on some Windows configurations.

title HongYan Test Instances

REM cd to the project dir so the script works regardless of where it is invoked from
cd /d %~dp0

echo Starting HongYan Instance 1...
start "HongYan Test 1" cmd /c "set HONGYAN_DATA_DIR=HongYan-Test1&& set HONGYAN_UDP_PORT=19876&& set HONGYAN_TCP_PORT=19877&& npx electron dist/main/index.js"

timeout /t 2 /nobreak >nul

echo Starting HongYan Instance 2...
start "HongYan Test 2" cmd /c "set HONGYAN_DATA_DIR=HongYan-Test2&& set HONGYAN_UDP_PORT=19878&& set HONGYAN_TCP_PORT=19879&& npx electron dist/main/index.js"

echo.
echo Both instances launched!
echo Instance 1: UDP 19876, TCP 19877, data dir HongYan-Test1
echo Instance 2: UDP 19878, TCP 19879, data dir HongYan-Test2
echo.
echo Note: They may not discover each other automatically.
echo You may need to manually scan using IP address.
echo.
pause
