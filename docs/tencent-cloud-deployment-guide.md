# 腾讯云内测部署指南

腾讯云适合你想把系统部署在自己可控的云服务器上。推荐第一版使用：

- CVM 云服务器或轻量应用服务器：运行 Web 和 Worker
- Redis：本机 Redis 或腾讯云 Redis 兼容版
- Supabase：继续作为主数据库
- PM2：守护 Web 和 Worker 两个 Node 进程
- Nginx：反向代理域名到 Next.js

## 1. 推荐架构

```text
用户浏览器
  ↓
Nginx / HTTPS
  ↓
Next.js Web/API: npm run start
  ↓
Supabase 数据库 / Storage

BullMQ Worker: npm run worker
  ↓
Redis 队列
  ↓
Supabase / MiniMax / SearchProviderRouter
```

Web 和 Worker 可以在同一台服务器上跑。Redis 内测阶段也可以先放同一台服务器；更正式时建议用腾讯云 Redis 兼容版。

## 2. 腾讯云有两种做法

### 方式 A：轻量应用服务器

适合：

- 个人内测。
- 操作简单。
- 成本较低。
- 不想配置太复杂的 VPC。

建议规格：

- 2 核 4GB 起步。
- Ubuntu 22.04 / 24.04。
- 系统盘 40GB 以上。

注意：

- 如果你使用腾讯云数据库 Redis，轻量应用服务器默认不一定能直接私网访问 Redis，需要配置网络互通。
- 如果只内测，可以先在轻量服务器本机跑 Redis。

### 方式 B：CVM 云服务器

适合：

- 更正式的内测或准备长期使用。
- 需要和腾讯云 Redis 走同 VPC 私网。
- 后续要做安全组、监控、备份。

建议规格：

- 2 核 4GB 起步。
- Ubuntu 22.04 / 24.04。
- CVM 和 Redis 放同地域、同 VPC、同子网或可互通网络。

腾讯云 Redis 文档说明，CVM 连接 Redis 通常使用同账号、同 VPC、同地域下的私网地址，延迟更低。

## 3. 服务器初始化

登录服务器后：

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git nginx
```

安装 Node.js LTS，推荐用 NodeSource 或 nvm。示例：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

安装 PM2：

```bash
sudo npm install -g pm2
```

## 4. Redis 选择

### 内测简单版：本机 Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping
```

`.env`：

```env
REDIS_URL=redis://127.0.0.1:6379
```

### 更正式版：腾讯云 Redis 兼容版

腾讯云 Redis 是兼容 Redis 协议的高可用缓存服务，支持标准和集群架构。创建后，建议让 CVM 通过私网地址访问。

`.env` 示例：

```env
REDIS_URL=redis://:你的Redis密码@腾讯云Redis私网IP:6379
```

如果使用自定义账号，按腾讯云 Redis 连接规则配置用户名/密码。

## 5. 部署项目

```bash
cd /opt
sudo git clone https://github.com/你的用户名/waimao-agent-platform.git
sudo chown -R $USER:$USER /opt/waimao-agent-platform
cd /opt/waimao-agent-platform
npm ci
```

创建生产环境变量：

```bash
cp .env.production.example .env
nano .env
```

核心配置：

```env
NODE_ENV=production
DATA_STORE_PROVIDER=supabase
APP_AUTH_ENABLED=true

REDIS_URL=redis://127.0.0.1:6379
QUEUE_ENABLED=true
WORKER_CONCURRENCY=1
ENRICHMENT_COMPANY_CONCURRENCY=5

EMAIL_PROVIDER=mock
EMAIL_SEND_REAL_MODE=false

CROSS_SEARCH_ENABLED=false
CROSS_SEARCH_REAL_MODE=false
```

构建：

```bash
npm run build
```

## 6. 用 PM2 启动 Web 和 Worker

```bash
pm2 start npm --name waimao-web -- run start
pm2 start npm --name waimao-worker -- run worker
pm2 save
pm2 startup
```

查看日志：

```bash
pm2 logs waimao-web
pm2 logs waimao-worker
```

查看状态：

```bash
pm2 status
```

## 7. Nginx 反向代理

创建配置：

```bash
sudo nano /etc/nginx/sites-available/waimao
```

内容示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/waimao /etc/nginx/sites-enabled/waimao
sudo nginx -t
sudo systemctl reload nginx
```

## 8. HTTPS

如果域名已经解析到服务器，可以用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 9. 腾讯云安全组

至少开放：

- 22：SSH，只建议限制你的 IP。
- 80：HTTP。
- 443：HTTPS。

不要公开 Redis 端口 6379。Redis 只允许本机或私网访问。

## 10. 内测验收

1. 打开域名。
2. 登录。
3. `/settings` 测试 Supabase、Redis、Search、MiniMax。
4. 上传 5 家 Excel。
5. 运行官网和联系方式补全。
6. 运行 Buyer Fit。
7. 生成开发信草稿。
8. 去 `/reviews` 人工审核。
9. 邮件发送保持 mock。

## 11. 常见问题

### 页面能打开，任务不跑

检查 Worker：

```bash
pm2 logs waimao-worker
```

检查 Redis：

```bash
redis-cli ping
```

### 上传 Excel 失败

检查 Nginx：

```nginx
client_max_body_size 50m;
```

### Worker 报 Supabase 权限错误

确认服务器 `.env` 中有服务端密钥：

```env
SUPABASE_SERVICE_ROLE_KEY=
```

不要把 service role key 放到 `NEXT_PUBLIC_`。

## 12. 什么时候选腾讯云

选腾讯云，如果你更看重：

- 国内访问速度。
- 服务器完全可控。
- 成本长期可控。
- 后面可能接企业微信、备案域名、国内短信或更多国内云资源。

选 Railway，如果你更看重：

- 快速内测。
- 少运维。
- Web、Worker、Redis 一起可视化管理。

## 13. 官方参考

- 腾讯云 Redis 产品文档: https://www.tencentcloud.com/document/product/239
- 腾讯云 Redis 连接文档: https://www.tencentcloud.com/document/product/239/9897
- PM2 部署文档: https://pm2.keymetrics.io/docs/usage/deployment/
