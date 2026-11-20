# DiggSpace

**DiggSpace** 是独立运营的 RSS / Atom 内容聚合站，位于 [digg.space](https://digg.space)。保持 Indi 原版的简洁版式与「最新 / 讨论 / 我的关注」三个导航，但**不收录或自动同步 Indi 的博客目录**。

原始 1,609 个博客订阅已退役，历史记录因关注、评论等关联而保留在数据库中，**不再抓取、展示或计入来源总数**；博客相关内容可前往原站：[Indi · 中文独立博客](https://indi.blog/)。

## AIHOT 内容入口

站内新增 [AI 热点](https://digg.space/ai-hot)、[AI 日报](https://digg.space/ai-daily)、[AI 周报](https://digg.space/ai-weekly) 三个原生阅读栏目，对应 AIHOT 官方 `/api/v1` 接口（无 API Key）。保留 DiggSpace 原有 RSS 最新、讨论和关注功能。

**注意授权：** [AIHOT 公开使用规则](https://aihot.news/terms) 要求，对公众的持续数据再分发、公开镜像及商业接入须取得书面许可。未取得授权前，三个栏目仅展示跳转至 AIHOT 原站的入口，不会抓取或公开复制其热点榜及日报、周报正文。取得授权后，可经单独 GitHub Secret 开启站内数据视图。详细技术文档见 [AIHOT.md](./AIHOT.md)。

## 管理员后台

**管理地址：[https://digg.space/admin](https://digg.space/admin)**。

管理员在 `/admin/login` 输入已配置在 Cloudflare Worker 中的 `ADMIN_TOKEN`（对应 GitHub Repository Secret：`DIGGSPACE_ADMIN_TOKEN`），登录后可直接：

- 添加 RSS、Atom、RSSHub 订阅源（名称、网站地址、RSS 地址、可选内容类型）。
- 查看状态、编辑、停用、重新启用或软删除来源。
- 手动抓取最多 5 个到期订阅源，验证文章是否出现在「最新」页面。
- 不需编辑 GitHub 仓库或 D1 数据库，即可管理日常订阅。

管理员会话使用 HttpOnly + SameSite=Strict 的签名 Cookie，8 小时失效，后台修改接口有同源校验。不要将管理员密钥发给其他人或提交进代码。若忘记密钥，可重新设置 GitHub Secret `DIGGSPACE_ADMIN_TOKEN`，然后手动重新部署，它会覆盖 Worker 的 `ADMIN_TOKEN`。

## 项目结构

| 位置 | 用途 |
|---|---|
| `frontend/worker/index.js` | Hono 入口、SSR 路由、RSS 抓取 |
| `frontend/worker/admin-panel.js` | 管理员登录及后台页面 |
| `frontend/worker/feedspace-admin.js` | RSS 来源管理 API |
| `frontend/public/admin.js` 和 `admin.css` | 后台管理界面 |
| `frontend/migrations/0012_retire_indi_catalog.sql` | 停用原始 CSV 目录，保留历史关联 |
| `frontend/public/style.css`、`app.js` | 延续原版 Indi 的公开 UI |
| `scripts/feedspace_admin.py` | 可选的命令行管理工具 |

## 部署

已使用独立的 Cloudflare Worker、D1 和 digg.space 自定义域名。登录 GitHub 仓库 [Actions](https://github.com/tenglei87/diggspace/actions/workflows/deploy_diggspace.yml)，手动运行 **Deploy DiggSpace to digg.space (manual)**，选择 `master` 并输入 `BIND_DIGG_SPACE`。部署会自动运行数据库迁移、更新 Worker 和刷新前台来源快照。

三个 GitHub Secrets：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`DIGGSPACE_ADMIN_TOKEN`；无需将其发送到聊天。预设 RSS Cron 仍处于关闭状态，避免在不确定 Cloudflare 额度时自动执行过多请求。需要通过管理后台手动抓取，后续可按套餐配置定时调度。

## 本地开发

安装 Node.js 22+：

```bash
cd frontend
npm ci
printf 'ADMIN_TOKEN=ci-local-admin-token-0123456789abcdef0123456789\nCACHE_TTL=0\nEMAIL_DEV_LOG=1\n' > .dev.vars
npm run db:migrate
npm run dev:seed
npm run dev
```

在浏览器访问 `http://localhost:8787/admin`。旧 RSS CSV 已从仓库删除，不会在开发或生产再次初始化。

## 版权

本项目在 MIT 许可下继续使用原始 Indi 项目的部分代码，保留 [LICENSE](./LICENSE) 中的原始作者署名与许可证。原站与本项目为独立运营，右侧提供外部跳转。
