# DiggSpace

[DiggSpace](https://digg.space) 是一个**无需登录的 RSS 新闻阅读站**。页面延续原 Indi 的简洁双栏风格，但只保留新闻阅读和来源分类。

## 导航

**最新｜热搜｜资讯｜软件｜技术｜奇趣｜财富｜英文**

「最新」整合所有有效订阅源，按文章发布时间倒序；其他七栏按代码内的来源类别筛选。所有新闻栏目不再重复显示分类标题和「分类资讯」提示，直接呈现文章列表。右侧提供 [AI新闻资讯](https://aihot.news/) 外链，仅跳转原站、不抓取或转载 AIHOT 内容。不设讨论、我的关注、账号注册、管理员后台、上传、投票或站内修改来源接口。

## 订阅来源

目前筛选 **78 个 RSS/Atom 来源**，参考了 [top-rss-list](https://github.com/weekend-project-space/top-rss-list)。源码位于 [frontend/worker/catalog.js](./frontend/worker/catalog.js)，每条来源含固定 ID、分类、名称及订阅 URL；新来源必须通过代码提交、评审与部署，**不从外部 GitHub 清单动态同步**，防止第三方更改在生产环境自动执行。

七大栏目：热搜（7）、资讯（16）、软件（11）、技术（11）、奇趣（10）、财富（13）、英文（10）。英文栏目包含英语技术文章与英文播客，不保证所有来源实时可用。**没有 AI资讯 栏目，也没有任何 AIHOT 源。**

站点将定时检查订阅源；只有实际返回合法 RSS/Atom、包含日期与原文 URL 的条目才会显示。标题跳转至原站，不复制图片或全文。聚合页面只使用简短摘要、来源及发布时间。

## 更新机制

- Cloudflare Worker：`frontend/worker/index.js`
- 分类目录：`frontend/worker/catalog.js`
- RSS 同步、抓取、去重和保留期限：`frontend/worker/news.js`
- 通用 RSS/Atom 解析：`scripts/lib/feed.mjs`
- Cloudflare D1：迁移 `frontend/migrations/0015_readonly_news.sql`
- 定时抓取：Cloudflare Cron 每小时第 7 分钟执行，每次处理最多 24 个到期订阅，网络故障自动退避
- 浏览器不需要 JavaScript、用户凭证或管理员令牌

## 部署

沿用用户自己 Cloudflare 账户下的 Worker、D1 和域名 digg.space。GitHub Actions 工作流 [Deploy DiggSpace to digg.space](https://github.com/tenglei87/diggspace/actions/workflows/deploy_diggspace.yml) 需要从 `master` 手动输入 `BIND_DIGG_SPACE` 才会发布。仅使用两个 Secrets：`CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。部署自动应用 D1 新迁移；无需管理员密钥。

先前的 Indi 博客、用户账号、讨论和关注数据仍留在旧 D1 表，**新 Worker 不再读取**。历史迁移必须保留才能支持既有生产数据库，未来可在备份后独立处理物理删除。

## 开发

```bash
cd frontend
npm ci
npm run db:migrate
npx wrangler d1 execute diggspace --local --file=./scripts/seed-dev.sql
npm run dev
```

## 致谢与许可

保留原始项目 [Indi](https://indi.blog/) 的 MIT 版权署名（见 [LICENSE](./LICENSE)）。RSS 来源名称和 URL 参考上游的公开清单，经本站人工挑选归类，各文章权利归作者或原媒体所有。
