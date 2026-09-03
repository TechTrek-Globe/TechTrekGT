# Start BigWorm Docker Containers and Cloudflare Tunnel
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[BigWorm] Starting Docker containers (guacamole + guacd)..." -ForegroundColor Cyan
docker compose -f "$ScriptDir\bigworm-docker-compose.yml" up -d

Write-Host "[BigWorm] Starting Cloudflare Tunnel (bigworm-home)..." -ForegroundColor Cyan
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run bigworm-home
