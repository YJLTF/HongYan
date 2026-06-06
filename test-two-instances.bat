@echo off
REM Test script to launch two HongYan instances (Windows Batch)
REM Instance 1: Ports 19876/19877, data dir HongYan-Test1
REM Instance 2: Ports 19878/19879, data dir HongYan-Test2

title HongYan Test Instance 1
echo Starting HongYan Instance 1...
set HONGYAN_DATA_DIR=HongYan-Test1
set HONGYAN_UDP_PORT=19876
set HONGYAN_TCP_PORT=19877
start "HongYan Test 1" cmd /c "cd /d f:\project\HongYan && npx electron dist/main/index.js"

timeout /t 2 /nobreak >nul

title HongYan Test Instance 2
echo Starting HongYan Instance 2...
set HONGYAN_DATA_DIR=HongYan-Test2
set HONGYAN_UDP_PORT=19878
set HONGYAN_TCP_PORT=19879
start "HongYan Test 2" cmd /c "cd /d f:\project\HongYan && npx electron dist/main/index.js"

title HongYan Test Instances
echo.
echo Both instances launched!
echo Instance 1: UDP 19876, TCP 19877
echo Instance 2: UDP 19878, TCP 19879
echo.
echo Note: They may not discover each other automatically.
echo You may need to manually scan using IP address.
echo.
pause
