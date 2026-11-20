# DiggSpace · RSS 订阅源管理

正式访问地址：https://digg.space

## 网站定位

本站只展示站长自己新增的 RSS / Atom / RSSHub 来源和文章，公开顶栏仅有「最新 / 讨论 / 我的关注」。原项目的 1,609 个博客订阅已由数据库迁移停用、RSS 地址清空，文章保留历史关联但不再公开展示。原博客站独立运营，右侧设有 [Indi · 中文独立博客](https://indi.blog/) 友情链接。

## 图形管理后台

访问 https://digg.space/admin （首次会进入 /admin/login），输入 GitHub Secret `DIGGSPACE_ADMIN_TOKEN` 所对应的 Worker `ADMIN_TOKEN` 登录。后台不需要普通读者账号，也不需要 GitHub OAuth。管理员可以新增、编辑、停用、恢复、删除订阅源，以及一次最多抓取 5 个到期 RSS。保存订阅源只建立目录，需要点击「抓取到期 RSS」才会出现文章。

管理员 Cookie 仅保存 HMAC 签名的短时会话，HttpOnly、SameSite=Strict；所有网页 API 写操作强制同源 Origin。未登录时 API 不暴露来源数据。不要将密钥粘贴在聊天或前台 HTML。

## RSS 来源管理 API（可选）

使用 `Authorization: Bearer $ADMIN_TOKEN`：

| Method | Endpoint | 用途 |
|---|---|---|
| GET/POST | `/api/admin/feedspace/sources` | 列出/创建来源 |
| PATCH/DELETE | `/api/admin/feedspace/sources/:num` | 修改/停用来源 |
| GET/POST | `/api/admin/feedspace/groups` | 查看/创建内部来源组 |
| POST | `/api/admin/crawl?limit=5&favicons=0` | 抓取最多 5 个 RSS |
| POST | `/api/admin/snapshot` | 重新生成公开来源快照 |

新增来源默认归到 `feeds` 组，可以额外指定 `forum` 或 `news` 分类。旧 `blogs` 组已移除，管理员 API 不再返回 `retired_catalog` 的旧记录。删除来源为软删除，以保留其原有文章与用户关联记录。

命令行接口仍位于 `scripts/feedspace_admin.py`，但绝大多数操作可直接在网页完成。

## Cloudflare 部署

GitHub Secret：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`DIGGSPACE_ADMIN_TOKEN`。使用 [Deploy DiggSpace to digg.space](https://github.com/tenglei87/diggspace/actions/workflows/deploy_diggspace.yml) 手动部署；工作流应用数据库迁移，发布 Worker，写入管理员密钥，再重建快照并检查线上路由。自动 Cron 保持关闭。若以后调整密钥，更新 GitHub Secret 并再次运行部署即可。

**删除语义：** 旧 1,609 个订阅已在 D1 中标记为 `retired_catalog` 且 `removed=1, feed=NULL`，并没有物理删除历史文章，这是为了避免破坏引用关系。如需彻底物理清理，请先制定独立的关联记录迁移和备份方案。
