# FeedSpace — 多网站 RSS 聚合扩展

本分支以 [Indi / 中文独立博客](https://github.com/timqian/chinese-independent-blogs) 为基础，将所有现有博客保留在顶级类目 **独立博客**，之后可以通过管理员接口增加论坛、资讯网站、RSSHub 等订阅源。

## 保持原界面

- 不修改 `frontend/public/style.css`、`frontend/public/app.js`、原有页面布局及文章卡片样式。
- 原来的分类位置显示顶级**来源类目**，并复用原来的 CSS / JS 筛选功能。
- 所有来源仍然进入原有首页热门、最新、关注、评论和文章详情页面。
- 原来的 AI、编程等主题标签保留在数据表中，旧的 `/c/ai` 等分类链接仍可以访问。
- 不新增管理员可视化页面，后台通过受保护的 API 或命令行操作。

## 数据和同步

运行 `frontend/migrations/0011_feedspace_sources.sql` 后，原有 `blogs` 记录自动获得：

- `source_group = 'blogs'`（独立博客）；
- `source_origin = 'csv'`（来自原仓库的博客目录）。

手动添加的来源使用 `source_origin = 'manual'`。CSV 同步仅更新 CSV 来源，绝不会把手动来源标记为移除。手动来源与原博客共享抓取、去重、重试和文章存储逻辑。

## 本地运行

按照原项目 `frontend/README.md` 安装 Node.js >= 20，并创建 `frontend/.dev.vars`（`ADMIN_TOKEN`、`CACHE_TTL=0`、`BLOGS_CSV_URL=`、`EMAIL_DEV_LOG=1`、`GITHUB_CLIENT_ID=`）。

```bash
cd frontend
npm ci
npm run db:migrate
npm run dev:seed
npm run dev
```

首次全量抓取可使用原有 `POST /api/admin/crawl?all=1&favicons=all`，测试环境也能先仅抓取少量来源。

## 增加类目和来源（无需修改代码）

使用 Python 3 标准库即可：

```bash
export FEEDSPACE_URL=http://localhost:8787
export FEEDSPACE_ADMIN_TOKEN=local-dev-token

python3 scripts/feedspace_admin.py groups
python3 scripts/feedspace_admin.py add-group forum '论坛社区'
python3 scripts/feedspace_admin.py add-group news '资讯网站'

python3 scripts/feedspace_admin.py add-source \
  --name 'V2EX' --url 'https://www.v2ex.com/' \
  --feed 'https://www.v2ex.com/index.xml' --group forum

python3 scripts/feedspace_admin.py sources --group forum
python3 scripts/feedspace_admin.py update-source 1234 --group news
python3 scripts/feedspace_admin.py disable-source 1234
python3 scripts/feedspace_admin.py enable-source 1234
```

`1234` 请换成 `sources` 命令返回的真实 `num`。RSSHub 的 feed 地址与普通 RSS/Atom URL 一样添加（`--feed` 指向实际可访问的订阅 XML 地址）。

后台 API ：

| 方法 | 路由 | 作用 |
| --- | --- | --- |
| GET / POST | `/api/admin/feedspace/groups` | 查看、新增类目 |
| PATCH / DELETE | `/api/admin/feedspace/groups/:id` | 重命名、删除空类目 |
| GET / POST | `/api/admin/feedspace/sources` | 查询、新增来源 |
| PATCH / DELETE | `/api/admin/feedspace/sources/:num` | 编辑、软删除手动来源 |

全部接口都要求 `Authorization: Bearer $ADMIN_TOKEN`。用户不能通过前台添加任意网址。

## 正式部署前必须修改 Cloudflare 配置

**Fork 会保留原作者的部署配置。不要直接运行 `wrangler deploy`。**

1. 在你自己的 Cloudflare 账号中创建**新的 D1 数据库**，在 `frontend/wrangler.jsonc` 修改 `d1_databases[0].database_id` 为新 ID（对应的 database_name 要与脚本配置一致）。
2. 把 `SITE_URL` 和 `routes` 改成你控制的域名，**不得继续使用 `indi.blog`**。
3. 把原作者的 `GITHUB_CLIENT_ID`、`EMAIL_FROM`、`TELEGRAM_CHAT_ID` 改为自己的设置，或者先禁用相应服务；邮箱、OAuth、Telegram 都需要独立配置才能正常运行。
4. 单独设置自己的 `ADMIN_TOKEN`，不要提交到 GitHub。
5. 本地迁移与抓取测试通过以后，再对新的远程 D1 执行迁移并部署。
6. 公共博客目录继续通过 `BLOGS_CSV_URL` 自动同步上游；如果将来需要完全独立维护，再修改为自己的 CSV 地址。

## 已知限制

- 添加来源时必须填写有效的 RSS/Atom 订阅地址；**没有**任意网站自动寻找 RSS、任意网页提取或 RSSHub 实例托管功能。
- 后台仅供可信管理员使用；如将来允许用户自行提交 RSS，必须在抓取端额外实施 DNS 与重定向链的 SSRF 防护、审核、限流。
- 编辑手动来源地址会保留原记录的稳定 ID；修改 feed 地址会重置抓取状态，以接纳新来源的文章。
- 新增来源后，定时抓取或手动触发抓取才能出现文章；匿名页面缓存最长可能延迟 `CACHE_TTL` 秒。
- 首次升级前请备份已有 D1 数据库，避免误部署或误迁移。

原作者 MIT License 和版权信息继续保留。
