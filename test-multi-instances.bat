@echo off
REM Test script to launch three Message instances (Windows Batch)
REM Each instance gets its own data dir and ports so they don't collide.
REM
REM V1.4.0: Upgraded from 2 to 3 instances for group chat testing.
REM
REM Env vars are set INSIDE the child cmd command rather than in the
REM parent shell, because `start` + `npx` (a .cmd wrapper) can lose env
REM vars during process inheritance on some Windows configurations.

title Message Test Instances

REM cd to the project dir so the script works regardless of where it is invoked from
cd /d %~dp0

echo Starting Message Instance 1...
start "Message Test 1" cmd /c "set MESSAGE_DATA_DIR=Message-Test1&& set MESSAGE_UDP_PORT=19876&& set MESSAGE_TCP_PORT=19877&& npx electron dist/main/index.js"

timeout /t 2 /nobreak >nul

echo Starting Message Instance 2...
start "Message Test 2" cmd /c "set MESSAGE_DATA_DIR=Message-Test2&& set MESSAGE_UDP_PORT=19878&& set MESSAGE_TCP_PORT=19879&& npx electron dist/main/index.js"

timeout /t 2 /nobreak >nul

echo Starting Message Instance 3...
start "Message Test 3" cmd /c "set MESSAGE_DATA_DIR=Message-Test3&& set MESSAGE_UDP_PORT=19880&& set MESSAGE_TCP_PORT=19881&& npx electron dist/main/index.js"

echo.
echo All instances launched!
echo Instance 1: UDP 19876, TCP 19877, data dir Message-Test1
echo Instance 2: UDP 19878, TCP 19879, data dir Message-Test2
echo Instance 3: UDP 19880, TCP 19881, data dir Message-Test3
echo.
echo Note: They may not discover each other automatically.
echo You may need to manually scan using IP address.
echo.
pause