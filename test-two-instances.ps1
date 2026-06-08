# Test script to launch two HongYan instances (PowerShell)
# Each instance gets its own data dir and ports so they don't collide.
#
# Env vars are set INSIDE a child cmd.exe process rather than via
# $env: in this shell, because Start-Process + npx (a .cmd wrapper)
# can lose env vars during process inheritance on some Windows
# configurations.

# Get script directory to use relative paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=========================================" -ForegroundColor DarkCyan
Write-Host "  HongYan Dual Instance Launcher" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor DarkCyan
Write-Host ""

# Build project first if needed
if (-not (Test-Path "$ScriptDir\dist\main\index.js")) {
    Write-Host "Building project first..." -ForegroundColor Yellow
    Push-Location $ScriptDir
    npm run build
    Pop-Location
    if (-not (Test-Path "$ScriptDir\dist\main\index.js")) {
        Write-Host "Build failed! Exiting." -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

# Start Instance 1
Write-Host "Starting HongYan Instance 1..." -ForegroundColor Green
Write-Host "  Data dir: HongYan-Test1" -ForegroundColor Gray
Write-Host "  UDP port: 19876" -ForegroundColor Gray
Write-Host "  TCP port: 19877" -ForegroundColor Gray
$cmd1 = 'set HONGYAN_DATA_DIR=HongYan-Test1&& set HONGYAN_UDP_PORT=19876&& set HONGYAN_TCP_PORT=19877&& npx electron dist/main/index.js'
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd1 -WorkingDirectory $ScriptDir -WindowStyle Normal
Write-Host "  v Instance 1 started!" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 2

# Start Instance 2
Write-Host "Starting HongYan Instance 2..." -ForegroundColor Cyan
Write-Host "  Data dir: HongYan-Test2" -ForegroundColor Gray
Write-Host "  UDP port: 19878" -ForegroundColor Gray
Write-Host "  TCP port: 19879" -ForegroundColor Gray
$cmd2 = 'set HONGYAN_DATA_DIR=HongYan-Test2&& set HONGYAN_UDP_PORT=19878&& set HONGYAN_TCP_PORT=19879&& npx electron dist/main/index.js'
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd2 -WorkingDirectory $ScriptDir -WindowStyle Normal
Write-Host "  v Instance 2 started!" -ForegroundColor Cyan
Write-Host ""

Write-Host "=========================================" -ForegroundColor DarkCyan
Write-Host "  Both instances launched successfully!" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  Instance 1 (Green):" -ForegroundColor Green
Write-Host "    Data: HongYan-Test1"
Write-Host "    UDP:  19876"
Write-Host "    TCP:  19877"
Write-Host ""
Write-Host "  Instance 2 (Cyan):" -ForegroundColor Cyan
Write-Host "    Data: HongYan-Test2"
Write-Host "    UDP:  19878"
Write-Host "    TCP:  19879"
Write-Host ""
Write-Host "  WARNING Note:" -ForegroundColor Yellow
Write-Host "    They may not discover each other automatically"
Write-Host "    due to different UDP broadcast ports."
Write-Host "    Use manual scan by IP address if needed."
Write-Host ""
Write-Host "  Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
