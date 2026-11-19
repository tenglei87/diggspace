# DiggSpace

**DiggSpace** 是一个独立运营的 RSS / Atom 内容聚合站：把独立博客、论坛、资讯网站和 RSSHub 订阅源统一收录，在现有的热门、最新、关注和分类界面集中阅读。

代码沿用 MIT 许可的 Indi 原有布局和基础功能，但**不依赖原作者的在线服务、域名、数据库、OAuth 应用、Telegram 群或自动同步任务**。

## 核心特性

- 现有页面样式、布局和基本交互延续原项目；顶级分类改为动态来源类目。
- 保留完整的初始独立博客目录（`data/initial-blogs.csv`），**只在首次初始化数据库时导入一次**；以后不再下载或覆盖原作者的名单。
- 后续所有网站都可以通过管理 API / CLI 新增、编辑、禁用、重新归类，包括最初导入的博客。
- 接受可访问的 RSS / Atom 和 RSSHub 生成的订阅地址。
- Cloudflare Worker + D1 + Hono，复用定时抓取、去重、关注、评论和账号系统。
- 不调用原作者 `indi.blog` 或原仓库的 API，不运行上游 README / OPML 自动改写脚本。

## 仓库结构

| 位置 | 作用 |
| --- | --- |
| `data/initial-blogs.csv` | 只用于首次导入的独立博客目录快照 |
| `frontend/worker/` | RSS 抓取、页面渲染、身份验证、后台 API |
| `frontend/migrations/` | 独立 D1 数据库结构及升级迁移 |
| `frontend/public/` | 保留原版的 CSS、原生 JS 与图标 |
| `scripts/feedspace_admin.py` | 类目与来源管理 CLI（无需第三方 Python 包） |
| `FEEDSPACE.md` | 完整操作说明和 API |

## 本地启动

需要 Node.js 22+ 和 Python 3（后者仅供管理员 CLI 与数据库测试使用）。

```bash
cd frontend
npm ci
printf 'ADMIN_TOKEN=local-dev-token\nCACHE_TTL=0\nEMAIL_DEV_LOG=1\nGITHUB_CLIENT_ID=\n' > .dev.vars
npm run db:migrate
npm run dev:seed
npm run dev
```

访问 `http://localhost:8787`。首次调用定时抓取或管理抓取接口时，站点会从仓库内置的初始目录导入独立博客；之后不会自动重导入。

```bash
# 在项目根目录
export FEEDSPACE_URL=http://localhost:8787
export FEEDSPACE_ADMIN_TOKEN=local-dev-token
python3 scripts/feedspace_admin.py add-group forum '论坛社区'
python3 scripts/feedspace_admin.py add-group news '资讯网站'
python3 scripts/feedspace_admin.py add-source --name V2EX --url https://www.v2ex.com/ --feed https://www.v2ex.com/index.xml --group forum
```

## 部署到自己的 Cloudflare

**当前配置刻意使用无效的 D1 占位 ID，无法直接部署到任何已存在的数据库。**

1. 在自己的 Cloudflare 账号中创建一个新的 D1：`npx wrangler d1 create diggspace`。
2. 将返回的 `database_id` 写入 `frontend/wrangler.jsonc`，不要复用他人的数据库 ID。
3. 创建自己的管理员密钥：`npx wrangler secret put ADMIN_TOKEN`。
4. 根据需要配置自己的 `SITE_URL`、邮件发信、GitHub OAuth、Telegram；这些功能默认不绑定他人的账号。
5. 在 `frontend` 中运行 `npm run deploy`，脚本会先检查数据库 ID 和是否存在上游配置。
6. 部署后通过管理接口添加来源并执行首次抓取；自动抓取由 Cloudflare Cron 负责，不依赖 GitHub Actions。

需要 Worker 付费套餐来支持大量外部抓取请求。上线前建议先在少量订阅源上验证抓取和数据库费用。

详细操作见 [FEEDSPACE.md](./FEEDSPACE.md) 和 [frontend/README.md](./frontend/README.md)。


## 一键部署到自己的 Cloudflare（预览版）

现在提供一个**只支持手动触发**的 GitHub Actions 工作流，可自动创建或复用你账号里的独立 D1，执行全部迁移，然后部署到自己的 workers.dev。首次部署为了控制资源消耗，**不启用定时抓取，也不会启用邮箱登录**；不接触旧站域名。

在 GitHub 仓库 **Settings → Secrets and variables → Actions → Repository secrets** 新增以下三个值，**不要发送到聊天或提交到仓库文件中**：

| Secret 名称 | 从哪里获得 |
| --- | --- |
| CLOUDFLARE_ACCOUNT_ID | Cloudflare Dashboard 的 Account ID |
| CLOUDFLARE_API_TOKEN | 自建 API Token，仅授权目标账号需要的 Workers 部署与 D1 创建/查询/迁移权限 |
| DIGGSPACE_ADMIN_TOKEN | 自己生成至少 32 位的随机管理员令牌，例如使用本地 Node.js 的 crypto.randomBytes(32).toString('hex') |

然后打开仓库 [Actions](https://github.com/tenglei87/diggspace/actions) → **Deploy DiggSpace preview (manual)** → **Run workflow**，选择 `master`，在确认框填写 `DEPLOY_DIGGSPACE`。

工作流会先核验 Secrets，随后创建/复用 `diggspace` D1、生成只针对本次运行的安全配置、迁移并部署 Worker，最后用真实 workers.dev URL 检查首页和管理员 API。GitHub Actions 的运行摘要会提供预览 URL。

**重要安全限制：** 仓库内的 D1 ID 仍然是无效占位符，不会写入真实账号 ID。每次手动部署都会在 runner 内临时获得正确 ID。该工作流不会在 `push` 或 PR 时自动上线；预览版不自动抓取 1609 个 RSS，也不发送登录验证码。可在验证 Worker/D1 成功之后单独开启抓取，避免超出免费计划限制。

详细配置参见 [FEEDSPACE.md](./FEEDSPACE.md)。

## 开源许可与版权

这是一个独立维护的衍生项目，不是从零重写。原始软件采用 MIT License（© 2019 Tim Qian）。按许可要求，保留根目录的 [LICENSE](./LICENSE) 和相应版权声明；代码与运行服务已经分离，版权归属不会被抹除。
