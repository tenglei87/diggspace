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

## 部署结构

DiggSpace 使用**自己的 Cloudflare Worker + D1 + digg.space Custom Domain**，独立于原作者网站。推荐通过下方手动 GitHub Actions 工作流发布；它不会在代码推送时自动部署。

仓库中仍保留无效 D1 占位 ID，防止误用其他账号资源。上线初期默认关闭 Cron 和未配置的邮件登录。需要大规模 RSS 抓取前，请确认 Cloudflare 套餐额度。

## 使用 digg.space 自定义域名部署

**主站地址：https://digg.space**。域名托管在用户自己的 Cloudflare 账号，GitHub Actions 只在手动触发后为 `diggspace` 创建/复用独立 D1 并发布 Cloudflare Worker，`SITE_URL` 与规范化链接均固定指向该域名。预览版不再作为发布目标。

### GitHub Secrets

GitHub → Settings → Secrets and variables → Actions → Repository secrets：

| 名称 | 值 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 持有 digg.space 的 Cloudflare Account ID |
| `CLOUDFLARE_API_TOKEN` | 你自己的 Cloudflare API Token，不要粘贴到聊天里 |
| `DIGGSPACE_ADMIN_TOKEN` | 至少 32 字符随机令牌，用于管理员 API |

首次创建 Worker 和 D1 以及绑定域名时，Token 至少需要目标账号内 **Workers 产品 Admin、D1 Admin** 权限，另加 **Zone → Workers Routes → Write**，作用域仅选择 **digg.space** Zone。域名必须处于活动状态。无需授予全部 Zone 的 DNS Edit 权限。

在 GitHub [Actions](https://github.com/tenglei87/diggspace/actions) → **Deploy DiggSpace to digg.space (manual)** → Run workflow，选择 `master`，填写确认短语 `BIND_DIGG_SPACE`。

工作流将检查 Secrets、创建或重用账户内的 `diggspace` D1、执行迁移、设置 `digg.space` Custom Domain、写入 `ADMIN_TOKEN`，最后验证 `https://digg.space` 的首页和受保护的管理 API。

Cloudflare 通常会为 Custom Domain 创建 DNS 和证书。如果根域名已有冲突 CNAME / 路由，需要先在 Cloudflare 控制台评估并处理，**不要直接删除其他业务 DNS**。本脚本不会主动删除 DNS。

为保护首次上线资源，自动 RSS Cron、未配置的邮箱登录和不适用于免费计划的抓取额度参数仍暂时禁用。首次上线后需要有意识地启动少量 RSS 抓取才会显示文章。

详细说明见 [FEEDSPACE.md](./FEEDSPACE.md)。

## 开源许可与版权

这是一个独立维护的衍生项目，不是从零重写。原始软件采用 MIT License（© 2019 Tim Qian）。按许可要求，保留根目录的 [LICENSE](./LICENSE) 和相应版权声明；代码与运行服务已经分离，版权归属不会被抹除。
