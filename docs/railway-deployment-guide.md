# Railway 内测部署指南

Railway 适合当前项目的内测上线，因为它可以在同一个项目里放：

- Web 服务：Next.js 前端和 API
- Worker 服务：BullMQ 后台任务
- Redis 服务：任务队列

当前项目仍然使用 Supabase 作为主数据库，Redis 只保存任务队列。

## 1. Railway 项目结构

建议创建 3 个服务：

```text
waimao-agent-platform
├─ web      -> npm run start
├─ worker   -> npm run worker
└─ redis    -> Railway Redis
```

Railway Redis 官方支持在项目里直接添加 Redis，并会提供 `REDIS_URL` 等变量。

## 2. 连接 GitHub

1. Railway 新建 Project。
2. 选择 Deploy from GitHub Repo。
3. 选择 `waimao-agent-platform` 仓库。
4. 第一个服务命名为 `web`。

Web 服务配置：

```text
Build command: npm run build
Start command: npm run start
```

## 3. 添加 Redis

1. 在 Project Canvas 点击 `+ New`。
2. 选择 Database / Redis。
3. Railway 会创建 Redis 服务。
4. 把 Redis 的 `REDIS_URL` 引用到 `web` 和 `worker` 服务。

如果 Railway 支持变量引用，优先用引用；如果手动复制，注意不要把 Redis 密码提交到 Git。

## 4. 添加 Worker 服务

1. 在同一个 Railway 项目里再添加一个服务。
2. 同样连接这个 GitHub 仓库。
3. 服务名建议叫 `worker`。
4. 设置 Start command：

```text
npm run worker
```

Worker 不需要公开域名。

## 5. 环境变量

Web 和 Worker 都需要配置核心变量：

```env
NODE_ENV=production
DATA_STORE_PROVIDER=supabase
APP_AUTH_ENABLED=true

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET_IMPORTS=imports

REDIS_URL=
QUEUE_ENABLED=true
QUEUE_NAME_LEAD_GENERATION=lead-generation
WORKER_CONCURRENCY=1
ENRICHMENT_COMPANY_CONCURRENCY=5

SECURITY_RATE_LIMIT_ENABLED=true
SECURITY_RATE_LIMIT_BACKEND=redis
SECURITY_AUDIT_LOG_ENABLED=true

MINIMAX_REAL_MODE=true
MINIMAX_API_KEY=
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
MINIMAX_MODEL=MiniMax-M3

EXA_API_KEY=
EXA_BASE_URL=https://api.exa.ai
TAVILY_API_KEY=
TAVILY_BASE_URL=https://api.tavily.com
YOU_API_KEY=
YOU_BASE_URL=https://ydc-index.io

EMAIL_PROVIDER=mock
EMAIL_SEND_REAL_MODE=false

CROSS_SEARCH_ENABLED=false
CROSS_SEARCH_REAL_MODE=false
```

只给 Web 服务配置 `NEXT_PUBLIC_` 变量也可以，但为了减少漏配，内测阶段 Web 和 Worker 可以先放同一套变量。注意：`SUPABASE_SERVICE_ROLE_KEY`、MiniMax、Search、Redis、SMTP、Resend 等密钥只能放 Railway 变量面板，不能进前端代码，不能提交 Git。

## 6. 内测启动顺序

1. 先部署 Redis。
2. 部署 Web。
3. 部署 Worker。
4. 打开 Web 域名。
5. 登录。
6. 进入 `/settings` 测试 Supabase、Redis、Search、MiniMax。
7. 用 5 家客户 Excel 跑一遍完整流程。
8. 没问题再跑 50-100 家。

## 7. 必须保持的安全开关

内测刚开始：

```env
EMAIL_SEND_REAL_MODE=false
EMAIL_PROVIDER=mock
CROSS_SEARCH_ENABLED=false
CROSS_SEARCH_REAL_MODE=false
WORKER_CONCURRENCY=1
ENRICHMENT_COMPANY_CONCURRENCY=5
```

真实邮件发送等你确认发信域名、退信、日志、人工批准流程都正常后再打开。

## 8. 常见问题

### 任务一直 queued

通常是 Worker 没启动，或者 Worker 没拿到同一个 `REDIS_URL`。

检查：

- Worker 服务日志有没有启动成功。
- Web 和 Worker 的 `REDIS_URL` 是否一致。
- `QUEUE_ENABLED=true` 是否两个服务都配置了。

### Web 能打开，但补全不动

看 `/runs/[id]`：

- `queued`：Worker 没消费。
- `running`：Worker 正在跑。
- `failed`：看 Worker 日志和 run 错误。

### Redis 连接失败

确认 Redis 服务存在，并且 `REDIS_URL` 配给了 Web 和 Worker。Railway 文档说明 Redis 服务会提供 `REDIS_URL` 等连接变量。

## 9. 官方参考

- Railway Redis: https://docs.railway.com/databases/redis
- Railway workers and queues: https://docs.railway.com/guides/cron-workers-queues
