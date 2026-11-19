# DiggSpace · 独立来源管理

本项目保留既有网站布局和 RSS 抓取能力，但**独立维护数据与服务**。没有上游 CSV 拉取、上游 API 依赖或定时覆盖，且不会使用其他项目的 Cloudflare 域名、数据库或账号配置。

## 从初始目录到独立数据库

首次调用 `/api/admin/crawl` 或 Cloudflare 定时任务时：

1. 读取仓库自带的 `data/initial-blogs.csv`（静态初始化快照）。
2. 写入新的 D1 `blogs` 表，并默认放到 `独立博客` 顶级类目。
3. 在数据库的 `meta` 表写入 `initial_catalog_imported = 1`。
4. 后续每次定时任务只处理到期的 RSS 抓取和首页快照，不再同步或恢复这份目录。

**特别注意：** 每一个 D1 数据库只执行一次初始化。如果需要修改已有内容，请通过管理员 CLI/API 操作，而不是编辑快照 CSV 期待自动更新。快照保留在仓库中是为了全新数据库能够复现最初的博客集合。

数据库 `source_origin` 字段仅标记记录来源（初始 CSV 或手动），不代表它们依赖外部服务。初始记录也可随时由本站管理员修改；修改后将成为 `manual`。

## 分类与订阅源

- `独立博客`（固定默认类目，ID `blogs`）
- `论坛社区`、`资讯网站`、其他分类：通过后台创建
- RSSHub 返回的是 RSS/Atom 订阅地址，按普通来源添加，自己选择目标类目即可
- 在原版布局中展示全部类目，所有网站文章共同参与最新、热门和关注列表

管理员 CLI 位于仓库根目录的 `scripts/feedspace_admin.py`：

```bash
export FEEDSPACE_URL=http://localhost:8787
export FEEDSPACE_ADMIN_TOKEN=local-dev-token

python3 scripts/feedspace_admin.py groups
python3 scripts/feedspace_admin.py add-group forum '论坛社区'
python3 scripts/feedspace_admin.py add-group news '资讯网站'

python3 scripts/feedspace_admin.py add-source \
  --name 'V2EX' \
  --url 'https://www.v2ex.com/' \
  --feed 'https://www.v2ex.com/index.xml' \
  --group forum

python3 scripts/feedspace_admin.py sources --group forum
python3 scripts/feedspace_admin.py update-source 1234 --group news
python3 scripts/feedspace_admin.py update-source 1234 --feed https://www.v2ex.com/index.xml
python3 scripts/feedspace_admin.py disable-source 1234
python3 scripts/feedspace_admin.py enable-source 1234
```

替换示例编号 `1234` 为 `sources` 返回的真实 `num`；也可直接管理第一次导入的博客。

### 管理 API

全部使用 `Authorization: Bearer $ADMIN_TOKEN`，不能在网页前台公开这个 Token。

| 请求 | 路由 | 功能 |
| --- | --- | --- |
| GET / POST | `/api/admin/feedspace/groups` | 列出 / 添加类别 |
| PATCH / DELETE | `/api/admin/feedspace/groups/:id` | 修改 / 删除空类别 |
| GET / POST | `/api/admin/feedspace/sources` | 列出 / 添加 RSS 来源 |
| PATCH / DELETE | `/api/admin/feedspace/sources/:num` | 编辑 / 禁用 RSS 来源 |

删除来源为软删除，文章、关注历史仍保留。后台添加 RSS 必须有有效的 `http(s)` URL；它不负责通用的网页 RSS 自动发现或托管 RSSHub 服务。

## 运行和部署

### 本地

```bash
cd frontend
npm ci
printf 'ADMIN_TOKEN=local-dev-token\nCACHE_TTL=0\nEMAIL_DEV_LOG=1\nGITHUB_CLIENT_ID=\n' > .dev.vars
npm run db:migrate
npm run dev:seed
npm run dev
```

可用 `npm run crawl` 在另一个终端进行首次抓取；最初约千余博客，建议测试时使用 `/api/admin/crawl?limit=20` 控制批次。

### 生产

1. 使用你自己的 Cloudflare 账号创建 `diggspace` D1，运行 `npx wrangler d1 create diggspace`。
2. 替换 `frontend/wrangler.jsonc` 里全部零的 D1 占位 UUID。
3. 在自己的 Worker 上用 `npx wrangler secret put ADMIN_TOKEN` 设置强随机令牌。
4. 正式域名和 `SITE_URL` 必须是你控制的地址；默认未配置第三方域名。
5. GitHub OAuth、邮件验证码和 Telegram 可根据需求单独接入自己的帐号。默认不使用任何继承凭据。
6. 在 `frontend/` 运行 `npm run deploy`（先检查 D1，再执行远程迁移和 Worker 发布）。

注意，邮件绑定 `EMAIL` 及登录邮件发送需要 Cloudflare Email Sending 正确配置自己的发件域名；未启用时不要依赖邮箱登录作为生产环境的唯一方式。

没有自动部署、原站接口拉取或 GitHub 工作流定时改写。Cloudflare Cron 执行独立 RSS 抓取；GitHub Actions 只在 PR 中检查代码，权限只读。

## 检查

```bash
node scripts/lint.mjs
python3 scripts/test_feedspace_schema.py
node scripts/test_independence.mjs
node frontend/scripts/test-feedspace.mjs
```

最后一项依赖先在 `frontend/` 中执行 `npm ci` 安装 `hono`。

## 限制与安全

- 新来源使用管理员后台添加，不提供公开用户任意提交 URL 的入口。未来如开放，必须对 DNS 和多次重定向路径做 SSRF 防护，限制 IP、端口、超时、内容大小和并发。
- RSSHub 必须由其他服务提供订阅地址。部分资讯站/论坛不能直接用网页链接抓取。
- 新的 Cloudflare 数据库、密钥及域名仍需要自行创建和配置，仓库中不包含可用于生产的真实账号资源。
- 原软件 MIT 许可证和原作者署名保留。这是合法独立维护的衍生版，不代表原创底层源码。
