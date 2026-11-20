# DiggSpace Worker

这是一个 **read-only RSS reader**，没有账号、管理员、评论、关注、投票或外部 RSS 增删改 API。

- `worker/catalog.js`：代码中维护 78 个来源及七大分类；
- `worker/news.js`：首次访问同步来源目录；每小时由 Cron 执行 RSS 抓取，一次最多 24 个到期源；
- `worker/index.js`：Hono SSR，`/` 汇总全部、`/c/{category}` 分类、`/sources` 来源列表；
- `migrations/0015_readonly_news.sql`：独立的 news_sources / news_items / news_meta 三张新闻表；`0016_drop_retired_legacy.sql`：删除 15 张废弃旧表。

本地启动：
```bash
npm ci
npm run db:migrate
npx wrangler d1 execute diggspace --local --file=./scripts/seed-dev.sql
npm run dev
```

生产通过 GitHub Actions 手动部署，无需任何管理员密钥。每小时 Cloudflare Cron 自动处理不超过 24 个订阅源。修改来源请直接编辑 `worker/catalog.js`，经 CI 验证后合并、部署。

生产 D1 在经过 Time Travel 恢复点检查并手动部署后执行旧表清理；仅保留新闻业务表及迁移记录。新代码只查询新闻表，不再公开账户和历史社区接口。
