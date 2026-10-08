# Cloudflare Workers Builds fix

## Why the previous build failed

1. Workers Builds dashboard Worker name is `telegram-video-editor-platform-pipeline-integrated`, while `wrangler.jsonc` said `video-subtitle-api`.
2. KV IDs were still placeholders (`REPLACE_WITH_KV_NAMESPACE_ID` and `REPLACE_WITH_SOT_KV_NAMESPACE_ID`).

## Fixed config

`cloudflare/worker/wrangler.jsonc` now uses the dashboard Worker name and declares KV bindings without resource IDs. With current Wrangler, bindings without IDs can be automatically provisioned on deploy; when deployed from GitHub, the resulting resource IDs are available in the Cloudflare dashboard and are not written back to the repository.

## Cloudflare dashboard

Worker:
- Root directory: `cloudflare/worker`
- Build command: empty / none
- Deploy command: `npx wrangler deploy`
- Branch: `main`
- Watch path include: `cloudflare/worker/**`

Required runtime secrets:
- `BOT_TOKEN`
- `BACKEND_ORIGIN`
- `EDGE_SHARED_SECRET`

Recommended variables:
- `ADMIN_ID`
- `MINI_APP_URL`
- `WEB_APP_URL`
- `CORS_ALLOWED_ORIGINS`

R2 bucket:
- `video-pipeline-logs`

After the first successful deployment, open Worker -> Bindings and verify `BOT_STATE` and `CONFIG_SOT` were provisioned. If the dashboard shows existing namespaces instead, bind those namespaces to the same binding names.

## Commit

```bash
git add cloudflare/worker/wrangler.jsonc CLOUDFLARE_FIX_2026-10-08.md
git commit -m "fix cloudflare worker build bindings"
git push origin main
```

Then rerun the Worker build.

## Idempotent resource provisioning

Use `npm run cf:provision` instead of `wrangler kv namespace create` and `wrangler r2 bucket create` manually. The bootstrap checks for existing resources first, writes their IDs to `wrangler.jsonc`, and can optionally deploy the Worker and register the Telegram webhook.
