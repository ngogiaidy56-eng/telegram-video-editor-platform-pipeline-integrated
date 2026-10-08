# Automated Cloudflare API / Resource Bootstrap

This repository now includes an idempotent provisioning command. It is designed for the current Worker name:

`telegram-video-editor-platform-pipeline-integrated`

It automatically:

1. Finds or creates the `BOT_STATE` KV namespace.
2. Finds or creates the `CONFIG_SOT` KV namespace.
3. Finds or creates the `video-pipeline-logs` R2 bucket.
4. Writes the two resolved KV IDs into `cloudflare/worker/wrangler.jsonc`.
5. Optionally sets Worker secrets from environment variables.
6. Optionally deploys the Worker.
7. Optionally registers the Telegram webhook.

Cloudflare documents Wrangler KV namespace management and R2 bucket creation/listing as supported CLI operations. citeturn325092search11turn325092search1

## Windows PowerShell

```powershell
cd D:\hendy-telegram-video-editor

# Login once if needed
npx wrangler@4.148.0 login

# Idempotent resource provisioning
npm run cf:provision
```

The command is safe to re-run: existing resources are reused by title/name instead of being created again.

### Provision + deploy

```powershell
$env:BOT_TOKEN = "YOUR_NEW_BOT_TOKEN"
$env:BACKEND_ORIGIN = "https://YOUR-KTOR-API.example.com"
$env:EDGE_SHARED_SECRET = "GENERATE_A_LONG_RANDOM_SECRET"

npm run cf:provision:deploy
```

### Provision + deploy + Telegram webhook

```powershell
$env:TELEGRAM_WEBHOOK_URL = "https://YOUR-WORKER.workers.dev/telegram/webhook"
npm run cf:provision:all
```

The Worker declares required secret names in `wrangler.jsonc`, which causes Wrangler to validate their presence on deploy. Keep sensitive values in Worker secrets rather than normal `vars`. citeturn325092search0turn325092search5

## Expected result

```text
BOT_STATE   → existing or newly created KV ID
CONFIG_SOT  → existing or newly created KV ID
R2          → video-pipeline-logs
Worker      → telegram-video-editor-platform-pipeline-integrated
Webhook     → https://.../telegram/webhook
```

The Pages Worker service binding is also aligned to the same Worker name in `webApp/wrangler.jsonc`.

## CI recommendation

Use GitHub Actions / Workers Builds for deployment, and run the resource bootstrap once from an authenticated development/operations machine. Do not place Cloudflare API tokens, Telegram Bot Tokens, or backend secrets in Git.
