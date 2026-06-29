# 内测上线部署指南

这份文档用于把当前项目上线给少量内部用户测试。目标是稳定跑通获客、补全、评分、草稿审核和单封邮件发送，不做自动群发。

## 结论先说

当前项目最适合先用 Railway 或 Render 内测，因为它们都能同时跑 Web 服务和常驻 Worker。你的系统不是只有一个网页，它还需要 BullMQ Worker 长时间消费 Redis 队列。

VPS 也可以，但需要你自己维护服务器、Node、Redis、PM2、日志、系统更新和安全组。Vercel 适合跑 Web/API，但不适合作为唯一平台承载当前 BullMQ Worker，通常要把 Worker 放到 Railway、Render、VPS 或其他支持常驻进程的平台。

## 平台区别

### 云服务器 / VPS

适合：

- 你想完全掌控服务器。
- 你愿意自己维护 Redis、进程守护、日志、备份和防火墙。
- 后面可能要部署更多私有服务。

优点：

- 灵活，Web、Worker、Redis 可以全放一台机器。
- 成本可控。
- 不受 Serverless 执行时长限制。

缺点：

- 运维工作最多。
- 服务器安全、更新、备份都要自己管。
- 出问题时需要自己看日志和重启服务。

推荐启动方式：

```bash
npm ci
npm run build
pm2 start npm --name waimao-web -- run start
pm2 start npm --name waimao-worker -- run worker
pm2 save
```

### Railway

适合：

- 你想尽快内测上线。
- 你希望 Web、Worker、Redis 放在同一个项目里管理。
- 你不想自己维护服务器。

优点：

- 支持常驻 Worker、Redis、环境变量、GitHub 自动部署。
- 对当前架构最顺手：一个 Web service，一个 Worker service，一个 Redis service。
- 以后扩容也比较直接。

缺点：

- 成本随服务数量、运行时间和资源上涨。
- 平台细节要按 Railway 的项目模型配置。

建议：

- Web service start command: `npm run start`
- Worker service start command: `npm run worker`
- Redis 用 Railway Redis，并把 `REDIS_URL` 配给 Web 和 Worker。

### Render

适合：

- 你想要 Web Service + Background Worker 的清晰模型。
- 你希望控制部署服务类型。

优点：

- 明确支持 Background Worker。
- Web 和 Worker 分开管理，结构清楚。
- 有日志面板。

缺点：

- 免费实例不适合生产。
- 某些部署能力在付费服务上更完整。

建议：

- Web Service: `npm run start`
- Background Worker: `npm run worker`
- Redis 使用 Render Key Value 或其他 TCP Redis。

### Vercel

适合：

- 只部署 Next.js 前端和轻量 API。
- 你愿意把 Worker 放到其他平台。

优点：

- Next.js 部署体验很好。
- 适合前端、普通 API、预览环境。

缺点：

- 当前项目的长任务依赖 BullMQ Worker，不建议只用 Vercel。
- Serverless Function 有执行时长和生命周期限制，不适合直接跑 94 家公司这种长任务。

如果选 Vercel：

- Vercel 跑 Web/API。
- Railway/Render/VPS 另起 Worker。
- Redis 用托管 Redis。

## Codex 能帮你做什么

Codex 可以做：

- 检查代码、修 bug、优化页面加载。
- 补齐部署文档和环境变量模板。
- 配置 `package.json` 脚本。
- 本地验证 `npm run build`、`npm run lint`、`npm run worker`。
- 帮你分析 Redis、Worker、Supabase、Search、MiniMax 的日志。
- 帮你迁移本地数据到 Supabase。
- 帮你写 Railway/Render/VPS 部署说明。

Codex 不能替你直接完成：

- 购买服务器或平台套餐。
- 在第三方平台网页里替你绑定银行卡。
- 替你生成并保管真实 API Key。
- 替你完成域名实名认证、DNS 所有权确认。
- 替你决定是否承担真实邮件发送风险。

## 你现在要做什么

1. 先决定平台。

   推荐内测优先级：

   - 最省心：Railway
   - 也合适：Render
   - 最灵活但需要运维：VPS
   - 只适合作为 Web 层：Vercel

2. 轮换密钥。

   你之前把 Supabase、MiniMax、EXA、Tavily、YOU 等 key 发到聊天里。内测上线前必须去各平台重新生成 key，并删除旧 key。

3. 准备环境变量。

   以 `.env.production.example` 为模板，填到部署平台的 Environment Variables/Secrets 页面。不要上传 `.env` 文件。

4. 保持安全开关。

```env
CROSS_SEARCH_ENABLED=false
CROSS_SEARCH_REAL_MODE=false
EMAIL_SEND_REAL_MODE=false
EMAIL_PROVIDER=mock
QUEUE_ENABLED=true
WORKER_CONCURRENCY=1
ENRICHMENT_COMPANY_CONCURRENCY=5
```

5. 部署两个服务。

   Web:

```bash
npm run build
npm run start
```

   Worker:

```bash
npm run worker
```

6. 内测验收。

   用 5 家公司先跑一遍：

   - 登录
   - Excel 上传解析
   - 官网和联系方式补全
   - Buyer Fit 评分
   - 生成开发信草稿
   - 人工审核
   - mock 发送

   全部正常后，再跑 50-100 家。

## 内测环境变量建议

```env
NODE_ENV=production
DATA_STORE_PROVIDER=supabase
APP_AUTH_ENABLED=true

QUEUE_ENABLED=true
WORKER_CONCURRENCY=1
ENRICHMENT_COMPANY_CONCURRENCY=5

SECURITY_RATE_LIMIT_ENABLED=true
SECURITY_RATE_LIMIT_BACKEND=redis
SECURITY_AUDIT_LOG_ENABLED=true

EMAIL_PROVIDER=mock
EMAIL_SEND_REAL_MODE=false

CROSS_SEARCH_ENABLED=false
CROSS_SEARCH_REAL_MODE=false
```

## 上线前必须确认

- Supabase schema 已执行。
- `audit_logs` migration 已执行。
- Supabase Storage bucket `imports` 存在且不是 public。
- Redis 是 TCP Redis URL，不是只支持 HTTP REST 的 Redis。
- Web 和 Worker 都配置了同一套 Supabase、Redis、MiniMax、Search Provider 环境变量。
- Worker 日志能看到 job started/completed/failed。
- `/settings` 里 Supabase、Redis、Search、MiniMax 状态正常。
- 邮件真实发送仍然关闭。

## 参考官方文档

- Vercel Functions: https://vercel.com/docs/functions
- Railway workers and queues: https://docs.railway.com/guides/cron-workers-queues
- Render background workers: https://render.com/docs/background-workers
- Render service types: https://render.com/docs/service-types
