$ErrorActionPreference = 'Stop'

Write-Host '== Cloudflare idempotent provision ==' -ForegroundColor Cyan
Write-Host 'This command reuses existing KV/R2 resources and only creates missing ones.'

node "$PSScriptRoot\cloudflare-provision.mjs" @args
