#!/usr/bin/env node
/**
 * Idempotent Cloudflare bootstrap for the Telegram Video Editor monorepo.
 *
 * Creates/reuses:
 *   - KV: BOT_STATE
 *   - KV: CONFIG_SOT
 *   - R2: video-pipeline-logs
 *
 * Then writes the resolved KV IDs into cloudflare/worker/wrangler.jsonc.
 * Optionally deploys the Worker and registers the Telegram webhook.
 *
 * Usage:
 *   node scripts/cloudflare-provision.mjs
 *   node scripts/cloudflare-provision.mjs --deploy
 *   node scripts/cloudflare-provision.mjs --deploy --register-webhook
 *
 * Required for deploy/webhook:
 *   BACKEND_ORIGIN
 *   BOT_TOKEN
 *   EDGE_SHARED_SECRET
 *   TELEGRAM_WEBHOOK_URL (only with --register-webhook)
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = resolve(ROOT, "cloudflare", "worker", "wrangler.jsonc");
const WORKER_CONFIG = ["--config", WRANGLER];
const WRANGLER_VERSION = "4.148.0";
const WORKER_NAME = "telegram-video-editor-platform-pipeline-integrated";
const BOT_STATE_TITLE = `${WORKER_NAME}-bot-state`;
const CONFIG_SOT_TITLE = `${WORKER_NAME}-config-sot`;
const R2_BUCKET = "video-pipeline-logs";

const args = new Set(process.argv.slice(2));
const deploy = args.has("--deploy");
const registerWebhook = args.has("--register-webhook");

function runWrangler(wranglerArgs, opts = {}) {
  const result = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler@" + WRANGLER_VERSION, ...wranglerArgs],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "inherit"],
      ...opts,
    },
  );
  return result.trim();
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON.\n${output}\n${error.message}`);
  }
}

function getKvNamespaces() {
  const output = runWrangler(["kv", "namespace", "list", "--json"]);
  const data = parseJson(output, "KV namespace list");
  return Array.isArray(data) ? data : data.result ?? [];
}

function createKv(title) {
  const output = runWrangler(["kv", "namespace", "create", title, "--json"]);
  const data = parseJson(output, `KV namespace create ${title}`);
  const id = data.id ?? data.result?.id;
  if (!id) throw new Error(`Could not determine KV ID for ${title}`);
  return id;
}

function ensureKv(title) {
  const existing = getKvNamespaces().find((item) => item.title === title);
  if (existing?.id) {
    console.log(`✓ KV exists: ${title} (${existing.id})`);
    return existing.id;
  }
  const id = createKv(title);
  console.log(`+ KV created: ${title} (${id})`);
  return id;
}

function getR2Buckets() {
  const output = runWrangler(["r2", "bucket", "list", "--json"]);
  const data = parseJson(output, "R2 bucket list");
  return Array.isArray(data) ? data : data.result ?? [];
}

function ensureR2Bucket(name) {
  const existing = getR2Buckets().find((item) => item.name === name);
  if (existing) {
    console.log(`✓ R2 exists: ${name}`);
    return;
  }
  runWrangler(["r2", "bucket", "create", name]);
  console.log(`+ R2 created: ${name}`);
}

function updateWorkerConfig(botStateId, configSotId) {
  if (!existsSync(WRANGLER)) throw new Error(`Missing ${WRANGLER}`);
  const config = JSON.parse(readFileSync(WRANGLER, "utf8"));
  config.name = WORKER_NAME;
  config.kv_namespaces = [
    { binding: "BOT_STATE", id: botStateId },
    { binding: "CONFIG_SOT", id: configSotId },
  ];
  config.r2_buckets = [{ binding: "PIPELINE_LOGS", bucket_name: R2_BUCKET }];
  writeFileSync(WRANGLER, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`✓ Updated ${WRANGLER}`);
}

function ensureRequiredDeploySecrets() {
  const required = ["BOT_TOKEN", "BACKEND_ORIGIN", "EDGE_SHARED_SECRET"];
  if (!deploy) return;
  const missingEnv = required.filter((key) => !process.env[key]);
  if (missingEnv.length) {
    throw new Error(`Missing environment variables for deploy: ${missingEnv.join(", ")}`);
  }
  console.log(`✓ Deployment secret inputs present: ${required.join(", ")}`);
}

function putSecret(key, value) {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler@" + WRANGLER_VERSION, "secret", "put", key, ...WORKER_CONFIG],
    {
      cwd: ROOT,
      input: `${value}\n`,
      encoding: "utf8",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  console.log(`✓ Secret configured: ${key}`);
}

function syncSecrets() {
  if (!deploy) return;
  for (const key of ["BOT_TOKEN", "BACKEND_ORIGIN", "EDGE_SHARED_SECRET"]) {
    putSecret(key, process.env[key]);
  }
}

async function registerTelegramWebhook() {
  if (!registerWebhook) return;
  const token = process.env.BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (!token || !webhookUrl) {
    throw new Error("--register-webhook requires BOT_TOKEN and TELEGRAM_WEBHOOK_URL");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram setWebhook failed: ${response.status} ${JSON.stringify(data)}`);
  }
  console.log(`✓ Telegram webhook registered: ${webhookUrl}`);
}

async function main() {
  console.log(`Cloudflare bootstrap → ${WORKER_NAME}`);
  console.log(`Root: ${ROOT}`);

  const botStateId = ensureKv(BOT_STATE_TITLE);
  const configSotId = ensureKv(CONFIG_SOT_TITLE);
  ensureR2Bucket(R2_BUCKET);
  updateWorkerConfig(botStateId, configSotId);

  ensureRequiredDeploySecrets();

  if (deploy) {
    syncSecrets();
    runWrangler(["deploy", ...WORKER_CONFIG]);
    console.log(`✓ Worker deployed: ${WORKER_NAME}`);
  }

  await registerTelegramWebhook();

  console.log("\nProvisioning complete.");
  console.log(`BOT_STATE=${botStateId}`);
  console.log(`CONFIG_SOT=${configSotId}`);
  console.log(`R2=${R2_BUCKET}`);
  console.log(`Worker=${WORKER_NAME}`);
}

main().catch((error) => {
  console.error(`\n✗ Provisioning failed: ${error.message}`);
  process.exit(1);
});
