# Alibaba Cloud Deployment Proof Checklist

Use this file as the checklist for the Devpost deployment proof video or screenshot bundle.

## Deployment Target

Recommended options:

- Alibaba Cloud ECS or Simple Application Server running the Next.js app.
- Alibaba Cloud Function Compute Web Function running the standalone Next.js server.
- Node.js 22 or 24 runtime.
- Qwen Cloud / DashScope API key configured through environment variables.
- Optional Redis-compatible service if `QUEUE_ENABLED=true`.
- Optional Supabase or local JSON storage for demo data.

## Required Environment Variables

Use the hosting console secret/environment panel. Do not expose values in the video.

```env
NODE_ENV=production
DATA_STORE_PROVIDER=local
LOCAL_DATA_DIR=/tmp/waimao-data
CONTENT_MODEL_PROVIDER=qwen
QWEN_REAL_MODE=false
QWEN_API_KEY=********
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
PRODUCT_SEARCH_CONTENT_MODEL_TOOL_QUERIES=1
QUEUE_ENABLED=false
EMAIL_PROVIDER=mock
EMAIL_SEND_REAL_MODE=false
```

For a real Qwen Cloud proof, set `QWEN_REAL_MODE=true` after adding `QWEN_API_KEY`. Keep `QWEN_REAL_MODE=false` for a mock-safe public demo when no key is configured.

If Supabase or Redis is enabled, also configure the matching variables from `.env.production.example`. For Function Compute demos without external storage, use `.env.alibaba-fc.example`.

## Build Commands

```bash
npm install
npm run build
npm run start
```

For Function Compute standalone output, build locally and upload the packaged standalone server. Set the web function startup command to:

```bash
PORT=9000 node server.js
```

If the platform uses a bootstrap entrypoint instead, use:

```bash
bash bootstrap
```

For a process manager:

```bash
pm2 start npm --name waimao-agent-platform -- run start
pm2 logs waimao-agent-platform
```

## Proof Video Shot List

1. Show the Alibaba Cloud console with the ECS or Simple Application Server instance name.
2. Show the public IP/domain or application endpoint.
3. Show the environment variable names, with secret values hidden.
4. Show the terminal or cloud logs running `npm run start` or the PM2 process.
5. Open the deployed app URL.
6. Start or open a run for a product such as `diaphragm accumulator`.
7. Show keyword review, with provider/status indicating Qwen-backed reasoning where available.
8. Show saved CRM evidence, buyer-fit score, risk notes, and email draft review.
9. End on the architecture diagram and mention that email sending is disabled until human approval.

## Devpost Evidence Package

Attach or link:

- Public repository URL.
- Public or unlisted 3-minute demo video URL.
- Alibaba Cloud proof video or screenshots.
- `docs/architecture.svg`.
- `docs/devpost-submission.md` text.

## Safety Notes

- Blur or hide all API keys and passwords.
- Do not show real customer data.
- Keep `EMAIL_SEND_REAL_MODE=false` for the hackathon proof unless a safe test inbox and sender domain are configured.
- If using mock search providers for the demo, state that clearly and show where real provider keys can be configured.
