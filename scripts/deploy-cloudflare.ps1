$ErrorActionPreference = 'Stop'

if (-not $env:CLOUDFLARE_API_TOKEN) { throw 'Set CLOUDFLARE_API_TOKEN' }
if (-not $env:CLOUDFLARE_ACCOUNT_ID) { throw 'Set CLOUDFLARE_ACCOUNT_ID' }
if (-not $env:KTOR_BACKEND_ORIGIN) { throw 'Set KTOR_BACKEND_ORIGIN' }
if (-not $env:EDGE_SHARED_SECRET) { throw 'Set EDGE_SHARED_SECRET' }

$botToken = if ($env:BOT_TOKEN) { $env:BOT_TOKEN } elseif ($env:TELEGRAM_BOT_TOKEN) { $env:TELEGRAM_BOT_TOKEN } else { $null }
if (-not $botToken) { throw 'Set BOT_TOKEN (or TELEGRAM_BOT_TOKEN)' }

$workerName = if ($env:CF_WORKER_NAME) { $env:CF_WORKER_NAME } else { 'video-subtitle-api' }
$pagesProject = if ($env:CF_PAGES_PROJECT) { $env:CF_PAGES_PROJECT } else { 'video-subtitle-tma' }

Write-Host '==> Build TMA'
gradle :webApp:jsBrowserDistribution

$tmpSecrets = Join-Path $env:TEMP 'video-subtitle-worker-secrets.json'
[ordered]@{
    BACKEND_ORIGIN = $env:KTOR_BACKEND_ORIGIN
    BOT_TOKEN = $botToken
    EDGE_SHARED_SECRET = $env:EDGE_SHARED_SECRET
} | ConvertTo-Json | Set-Content -Encoding UTF8 $tmpSecrets

try {
    Write-Host "==> Deploy Worker: $workerName"
    npx wrangler@4.148.0 deploy --config cloudflare/worker/wrangler.jsonc --name $workerName --secrets-file $tmpSecrets

    Write-Host "==> Deploy Pages: $pagesProject"
    Push-Location webApp
    try {
        npx wrangler@4.148.0 pages deploy --project-name $pagesProject
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item $tmpSecrets -Force -ErrorAction SilentlyContinue
}

Write-Host 'Deployment complete.'
