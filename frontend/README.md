# DiggSpace Worker

Cloudflare Worker + Hono (SSR) + D1 实现的独立 RSS / Atom 聚合站。前端保留原网站结构、样式及基本交互；本站的数据采集、账户、密钥和部署独立运行。

## 目录

- `worker/index.js`：HTTP 路由、最新/热门/我的关注、定时抓取及 API
- `worker/crawl.js`：D1 存储、定时队列、RSS 抓取、首页快照
- `worker/feedspace-admin.js`：仅管理员可访问的来源/分类 API
- `public/`：既有样式、浏览器 JS、favicon（无框架构建）
- `migrations/`：从原数据结构升级到顶级来源类目
- `../data/initial-blogs.csv`：独立保存的首次导入清单（不会再自动同步）
- `../scripts/lib/feed.mjs`：跨 Node/Worker 共享的订阅解析器

## 本地开发

Node.js 22+：

```bash
cd frontend
npm ci
printf 'ADMIN_TOKEN=local-dev-token\nCACHE_TTL=0\nEMAIL_DEV_LOG=1\nGITHUB_CLIENT_ID=\n' > .dev.vars
npm run db:migrate
npm run dev:seed
npm run dev
```

打开 http://localhost:8787。种子脚本写入测试文章（与实际 RSS 源分离），便于检查热门、最新、关注和屏蔽功能。启动 Worker 本身不会触发真实 RSS 抓取；首次调用 `POST /api/admin/crawl` 或 Cloudflare 定时任务时才会把本地初始目录导入 D1。

如果要手动测试抓取：

```bash
curl -X POST -H "Authorization: Bearer local-dev-token" \
  "http://localhost:8787/api/admin/crawl?limit=20&favicons=0"
```

`all=1` 表示忽略下次抓取时间约束；`limit` 控制本轮处理数。大量订阅可能会消耗资源，建议从小批量开始。

## 页面

| 地址 | 含义 |
| --- | --- |
| `/` | 热门文章 |
| `/latest` | 全部来源的最新文章 |
| `/c/sg-blogs` | 独立博客类目 |
| `/c/sg-<类目ID>` | 自定义类目 |
| `/blogs` | 订阅源目录（保留原路由） |
| `/b/<数字ID>` | 订阅源详情（保留原路由） |
| `/following` | 我的关注 |
| `/following.opml` | 导出已关注来源 |
| `/api/admin/feedspace/groups` | 管理来源类目 |
| `/api/admin/feedspace/sources` | 管理 RSS 来源 |
| `/api/admin/crawl` | 管理员手动抓取 |

旧的 `/c/ai` 等博客主题分类 URL 仍可用，但主界面显示的是顶级来源类目。浏览器 CSS/JS 以及原有文章卡片、评论、投票均保留。

## 独立数据维护

第一轮抓取时执行一次 `syncBlogs` 导入 `../data/initial-blogs.csv`，并写入 `meta.initial_catalog_imported = 1`。此后定时任务**不再读取外部目录，也不会重新覆盖已有来源**。初始博客和新加论坛/资讯源都可通过管理员 API 修改。

数据存在你自己的 D1：`blogs`、`posts`、`users`、`follows` 等，原有数据结构保留。数据库迁移 `0011_feedspace_sources.sql` 加入类目表及来源标记。

## 上线部署

`wrangler.jsonc` 里已经删除原服务的域名、D1 UUID、OAuth 和 Telegram 账号值，默认使用占位数据库 ID，阻止误发布：

```bash
cd frontend
npx wrangler login
npx wrangler d1 create diggspace
# 把新数据库的 ID 填到 wrangler.jsonc
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

`npm run deploy` 会先调用 `scripts/check-deployment.mjs`，验证 D1 ID 不为空且未引用旧服务，再执行远程迁移并发布 Worker。未设置自定义域名时，可先使用自己账号下的 workers.dev 地址；设置 `SITE_URL` 或 Cloudflare Route 时只能使用已获授权控制的域名。

需要配置自己的用户登录渠道：

- **GitHub 登录（可选）**：创建自己的 OAuth App，回调 `<SITE_URL>/auth/github/callback`，设置 `GITHUB_CLIENT_ID` 和 Secret `GITHUB_CLIENT_SECRET`。
- **邮箱登录（可选）**：启用自己的发件域，设置 `EMAIL_FROM` 并正确配置 Cloudflare Email Sending。
- **Telegram 通知（可选）**：自己的 Bot Token、群组 ID，以及有效的 `SITE_URL`，否则不会发送。

Cloudflare Worker 定时抓取将按订阅源活跃度安排复查：30 天内更新过的来源约每小时检查一次，一年内更新过的约每 3 小时，较久未更新的约每 12 小时。失败会退避重试。RSS 历史文章在 D1 中保存。生产抓取千余来源通常需要 Workers Paid 计划。

更多类目和来源管理示例见根目录 [FEEDSPACE.md](../FEEDSPACE.md)。

## 测试

```bash
# 在仓库根目录
node scripts/lint.mjs
python3 scripts/test_feedspace_schema.py
node scripts/test_independence.mjs
# 安装完前端依赖后：
node frontend/scripts/test-feedspace.mjs
```

MIT 许可和原软件著作权声明保留在根目录 [LICENSE](../LICENSE)。
