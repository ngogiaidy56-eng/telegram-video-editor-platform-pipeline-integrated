# Telegram Video Subtitle Platform

Kotlin/Ktor + Kotlin Multiplatform + Compose Multiplatform platform with Telegram Bot + Telegram Mini App (TMA), deployed as:

```text
Telegram Bot / TMA
        │
        ▼
Cloudflare Pages
  ├─ Kotlin/JS TMA static bundle
  └─ Pages Functions: /api/* + /telegram/webhook
        │ Service Binding
        ▼
Cloudflare Worker: video-subtitle-api
        │ HTTPS proxy
        ▼
Ktor :server
  ├─ Telegram Bot webhook
  ├─ Admin / Maintenance / Feature Flags
  ├─ Whisper
  ├─ Gemini
  └─ FFmpeg
```

## Modules

- `server`: Ktor/Netty backend, Telegram webhook, admin, maintenance, AI, FFmpeg, WebSocket.
- `core`: KMP models, repositories, Ktor clients, SRT formatter, Telegram auth validation contract.
- `composeApp`: shared Compose Multiplatform UI and ViewModels.
- `androidApp`: Android entry point + Media3 seam.
- `iosApp`: iOS entry point + AVPlayer seam.
- `desktopApp`: Desktop entry point + VLCj seam.
- `webApp`: Kotlin/JS Telegram Mini App + Cloudflare Pages Functions.
- `cloudflare/worker`: Cloudflare Worker edge gateway that forwards requests to Ktor.

## Backend endpoints

- `GET /health`
- `GET /api/status`
- `POST /api/auth/telegram`
- `POST /api/transcribe`
- `POST /api/translate`
- `POST /api/render`
- `POST /api/admin/maintenance`
- `POST /api/admin/features`
- `WS /ws/events?token=<session>`
- `POST /telegram/webhook`

## Local Ktor

Copy `.env.example` to `.env` and configure:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_IDS=123456789
TELEGRAM_WEBHOOK_URL=https://api.example.com/telegram/webhook
OPENAI_API_KEY=
GEMINI_API_KEY=
PUBLIC_BASE_URL=http://localhost:8080
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

Run:

```bash
gradle :server:run
```

or:

```bash
docker compose up -d --build
```

The Docker image installs FFmpeg.

## Cloudflare deployment

The deployment now uses Cloudflare's current Wrangler configuration format (`wrangler.jsonc`). Cloudflare recommends JSON/JSONC for new Worker configurations; Pages projects use `pages_build_output_dir` when configuration is managed in source control.

### 1. Configure the Worker secrets

The edge Worker declares three required secrets in `cloudflare/worker/wrangler.jsonc`:

- `BACKEND_ORIGIN`: public HTTPS origin of the Ktor backend.
- `BOT_TOKEN`: Telegram Bot API token used by the Worker webhook.
- `EDGE_SHARED_SECRET`: random shared secret used for Worker → Ktor HMAC authentication.

Cloudflare validates every name in `secrets.required` during deploy, so the Worker cannot be deployed until all three exist. citeturn170264search0turn170264search3

Manual setup:

```bash
cd cloudflare/worker
npm install

npx wrangler@4.148.0 secret put BACKEND_ORIGIN
npx wrangler@4.148.0 secret put BOT_TOKEN
npx wrangler@4.148.0 secret put EDGE_SHARED_SECRET
```

Generate the HMAC secret locally instead of committing it:

```bash
openssl rand -hex 32
```

For automated deployment, `scripts/deploy-cloudflare.sh` and `scripts/deploy-cloudflare.ps1` now upload all three required secrets through Wrangler's `--secrets-file` flow. Cloudflare supports JSON or dotenv secret files for this purpose. citeturn170264search2turn170264search3

### 2. Build the TMA

```bash
gradle :webApp:jsBrowserDistribution
```

The deploy directory is:

```text
webApp/build/dist/js/productionExecutable/
```

### 3. Deploy Worker

```bash
npx wrangler@4.148.0 deploy --config cloudflare/worker/wrangler.jsonc
```

### 4. Deploy Pages

The Pages project contains service bindings that point `/api/*` and `/telegram/webhook` to `video-subtitle-api`. Cloudflare Pages supports service bindings from Pages Functions to Workers.

```bash
cd webApp
npm install
npx wrangler@4.148.0 pages deploy --project-name video-subtitle-tma
```

### One-command deployment

Linux/macOS:

```bash
export CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=...
export KTOR_BACKEND_ORIGIN=https://api.example.com
./scripts/deploy-cloudflare.sh
```

Windows PowerShell:

```powershell
$env:CLOUDFLARE_API_TOKEN = "..."
$env:CLOUDFLARE_ACCOUNT_ID = "..."
$env:KTOR_BACKEND_ORIGIN = "https://api.example.com"
.\scripts\deploy-cloudflare.ps1
```

### GitHub Actions

The included `.github/workflows/cloudflare.yml` builds the Kotlin/JS TMA, deploys the Worker first, then deploys Pages.

Add these repository secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
KTOR_BACKEND_ORIGIN
```

The workflow follows Cloudflare's documented Wrangler-based Pages CI approach and uses the current `cloudflare/wrangler-action` deployment action.

## Telegram setup

Set the Telegram webhook to the Pages URL:

```text
https://<your-pages-domain>/telegram/webhook
```

Because Pages Functions forward the request to the Worker through a service binding, the Telegram Bot API does not need to reach the Ktor server directly.

## Production notes

The Ktor starter still uses in-memory session/config repositories. Replace them with Redis/DB and an object-storage/job queue for multi-instance production workloads. Video upload/render endpoints should also get explicit size quotas, MIME validation, cleanup, rate limiting and job isolation before public high-volume use.

Workers Sites are deprecated for new projects; this scaffold deliberately uses modern Workers/Pages configuration instead.

## Pipeline bổ sung

Xem `PIPELINE.md` và `CLOUDFLARE_PIPELINE.md` để triển khai Sandbox & Auto-Link Translation Pipeline. React UI được build vào `/pipeline/`, local agent dùng WebSocket `127.0.0.1:8799`, còn Ktor là nơi thực thi các tác vụ nặng.

### OTP / Edge Auth

Telegram `/token` phát OTP 6 ký tự với TTL 60 giây. React Pipeline có ô OTP. Pages Worker xác thực OTP trong KV rồi ký request HMAC tới Ktor `/api/auth/edge-otp`; OTP được xóa sau khi consume.

### Worker Telegram Webhook

Không bật đồng thời webhook cho Worker và Ktor. Với kiến trúc mới, đăng webhook vào Worker bằng `scripts/register-telegram-worker-webhook.sh` và để Ktor chỉ xử lý backend API/compute.

### Legacy bot migration

Logic menu/shop/account từ source bot được giữ riêng trong `cloudflare/worker/src/legacyHendyBot.ts`; Worker mới dùng env secrets thay cho token hard-code. State nghiệp vụ vẫn là in-memory của Worker isolate và được đánh dấu trong `SECURITY.md` để tránh nhầm là durable storage.
