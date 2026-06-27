# Waimao Agent Platform

企业级 B2B 外贸获客 Agent 平台 MVP。

当前版本以 mock-first 为主：先跑通 LangGraph.js 工作流、人工审核、CRM 结果沉淀和邮件草稿闭环；真实外部服务都封装在 provider 里，默认不消耗 API、不真实发信、不真实采集。

## 技术栈

- Next.js + React + TypeScript
- Tailwind CSS + shadcn-style UI
- LangGraph.js
- 本地 JSON 数据存储
- Playwright 登录态校准
- Provider 预留：MiniMax、EXA、Tavily、YOU、Resend、SMTP、跨境搜、外贸邮

## 本地启动

```bash
npm install
npx playwright install chromium
copy .env.example .env
npm run dev
```

打开：

```txt
http://127.0.0.1:3000
```

macOS / Linux 创建 `.env` 可以用：

```bash
cp .env.example .env
```

## 常用命令

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

可选：生成演示数据。

```bash
npm run seed
```

## 环境变量

`.env.example` 是模板，可以提交到 GitHub；`.env` 是本地私密配置，不要提交。

默认保持 mock mode：

```env
CROSS_SEARCH_REAL_MODE=false
EXA_API_KEY=
TAVILY_API_KEY=
YOU_API_KEY=
MINIMAX_API_KEY=
RESEND_API_KEY=
```

跨境搜登录态校准需要显式开启：

```env
CROSS_SEARCH_REAL_MODE=true
CROSS_SEARCH_HEADLESS=false
CROSS_SEARCH_PROFILE_DIR=.playwright/cross-search-profile
CROSS_SEARCH_BASE_URL=https://vip.dqxx.com.cn/Home/Desktop
CROSS_SEARCH_ONE_SEARCH_URL=https://vip.dqxx.com.cn/OneSearch/Home
CROSS_SEARCH_USERNAME=
CROSS_SEARCH_PASSWORD=
```

账号密码可以为空。为空时系统不会报错，会提示在本地 Playwright Chromium 窗口人工登录。项目不会破解验证码、二维码、短信或人机验证。

## GitHub 同步

第一次上传：

```bash
git init
git add .
git commit -m "init waimao agent platform"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/waimao-agent-platform.git
git push -u origin main
```

另一台电脑下载：

```bash
git clone https://github.com/YOUR_NAME/waimao-agent-platform.git
cd waimao-agent-platform
npm install
npx playwright install chromium
copy .env.example .env
npm run dev
```

每天同步：

```bash
git pull
```

改完后提交：

```bash
git add .
git commit -m "update waimao agent"
git push
```

## 不要上传的内容

这些由 `.gitignore` 保护：

- `node_modules/`：依赖目录，可通过 `npm install` 重新生成
- `.next/`：Next.js 构建缓存，可通过 `npm run dev` 或 `npm run build` 重新生成
- `.env`：API Key、账号密码等本地私密配置
- `.playwright/`：Playwright 浏览器 profile，可能包含跨境搜登录 cookie
- `data/*.json`：本地 CRM、客户、邮件草稿、运行记录数据

如果确实要迁移本地演示数据，可以私下复制 `data/*.json`，不要推到 GitHub。

## 当前能力

- 创建获客任务
- LangGraph mock 工作流
- 关键词人工审核
- 邮件草稿人工审核
- CRM 客户列表和详情
- Evidence 保存和展示
- EXA / Tavily / YOU provider mock / real mode
- MiniMax provider mock / real mode
- 跨境搜 Playwright 登录态检查和人工登录辅助

## 当前安全边界

- 不真实发送邮件
- 不真实调用外贸邮查邮箱
- 不真实执行跨境搜客户采集
- 不导出跨境搜数据
- 不绕过验证码、二维码、短信、人机验证
- 不在前端泄露 API Key 或账号密码

## 推荐开发顺序

1. 继续完善跨境搜页面 selector 校准，只做低频只读检查
2. 接入外贸邮 / VEmail 真实查邮箱
3. 把本地 JSON 存储迁移到 PostgreSQL / Supabase
4. 增加队列 worker 和任务重试
5. 接入 Resend / SMTP，但保持人工批准后再发送
