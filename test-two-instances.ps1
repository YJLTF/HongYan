# Test script to launch two HongYan instances (PowerShell)
# Instance 1: UDP 19876, TCP 19877, data dir HongYan-Test1
# Instance 2: UDP 19878, TCP 19879, data dir HongYan-Test2

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
$env:HONGYAN_DATA_DIR = "HongYan-Test1"
$env:HONGYAN_UDP_PORT = "19876"
$env:HONGYAN_TCP_PORT = "19877"
Start-Process -FilePath "npx" -ArgumentList "electron", "dist/main/index.js" -WorkingDirectory $ScriptDir -WindowStyle Normal
Write-Host "  ✓ Instance 1 started!" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 2

# Start Instance 2
Write-Host "Starting HongYan Instance 2..." -ForegroundColor Cyan
Write-Host "  Data dir: HongYan-Test2" -ForegroundColor Gray
Write-Host "  UDP port: 19878" -ForegroundColor Gray
Write-Host "  TCP port: 19879" -ForegroundColor Gray
$env:HONGYAN_DATA_DIR = "HongYan-Test2"
$env:HONGYAN_UDP_PORT = "19878"
$env:HONGYAN_TCP_PORT = "19879"
Start-Process -FilePath "npx" -ArgumentList "electron", "dist/main/index.js" -WorkingDirectory $ScriptDir -WindowStyle Normal
Write-Host "  ✓ Instance 2 started!" -ForegroundColor Cyan
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
Write-Host "  ⚠️ Note:" -ForegroundColor Yellow
Write-Host "    They may not discover each other automatically"
Write-Host "    due to different UDP broadcast ports."
Write-Host "    Use manual scan by IP address if needed."
Write-Host ""
Write-Host "  Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
