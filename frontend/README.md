# DiggSpace · Cloudflare Worker

这个独立站点运行于 Cloudflare Workers + D1，并采用原始 Indi 公开页面的布局与交互。当前版本**不再包含 Indi 的 1,609 个博客订阅源**，只管理站长手动添加的 RSS、Atom 和 RSSHub 来源。

## 管理后台

本地：`http://localhost:8787/admin`；生产：`https://digg.space/admin`。由 `worker/admin-panel.js` 负责管理员登录/签名 Cookie，`worker/feedspace-admin.js` 负责订阅源增删改查，`public/admin.js` 和 `admin.css` 负责后台页面。管理员密钥对应环境变量 `ADMIN_TOKEN`（部署工作流从 GitHub `DIGGSPACE_ADMIN_TOKEN` 写入）。

## 本地启动

```sh
npm ci
printf 'ADMIN_TOKEN=ci-local-admin-token-0123456789abcdef0123456789\nCACHE_TTL=0\nEMAIL_DEV_LOG=1\n' > .dev.vars
npm run db:migrate
npm run dev:seed
npm run dev
```

打开 /admin 登录后，可添加新来源、编辑、停用或启用，并通过受保护的抓取操作立即导入少量文章。

## 数据库

迁移 `0012_retire_indi_catalog.sql` 会停用旧 CSV 来源，禁止继续抓取并清除旧的公开快照；保留历史文章、评论与关注的外键关联。新的默认类型为 `feeds`（订阅源），原博客类型 `blogs` 已删除。站点不再附带 CSV，也不会在抓取时重新导入原博客目录。

## 发布

通过仓库的手动 GitHub Actions 工作流将自己的 D1 ID 及 digg.space Custom Domain 写入临时 Wrangler 配置，执行 migrations、发布 Worker、设置 ADMIN_TOKEN 并生成新快照。默认关闭 RSS Cron、邮件发送，避免未配置时的不可预期行为。详见仓库根目录 `README.md` 与 `FEEDSPACE.md`。
