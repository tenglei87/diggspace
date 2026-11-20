# DiggSpace × AIHOT：原生阅读栏目

以 [AIHOT 官方 API 接入教程](https://aihot.news/agent?tab=api) 和 [OpenAPI 3.1 / API v2.0.0](https://aihot.news/openapi-v1.json) 为依据。

## 三个栏目

| DiggSpace 路由 | AIHOT API | 官方阅读页 | 更新节奏（北京时间） |
|---|---|---|---|
| `/ai-hot`（AI 热点） | `GET https://aihot.news/api/v1/hot-topics` | https://aihot.news/hot | 事件榜通常每 5 分钟更新，本站最长每 5 分钟检查 |
| `/ai-daily`（AI 日报） | `GET https://aihot.news/api/v1/dailies/latest` | https://aihot.news/daily | 每天 08:00 后；本站下一次检查 08:10 |
| `/ai-weekly`（AI 周报） | `GET https://aihot.news/api/v1/weeklies/latest` | https://aihot.news/weekly | 每周一 10:00 后；本站下一次检查 10:10 |

三栏沿用 Indi/DiggSpace 的页面容器、导航和右侧边栏，用独立的 `aihot.css` 修饰列表、栏目和报刊内容，不修改公开基础样式。

**接口匿名只读、无需 API Key**，但接口可访问并不代表具有公开转载权。旧 `/api/public/*` 已停用，绝不能使用。

## 关键授权限制

AIHOT 的 [公开使用规则](https://aihot.news/terms) 第 4 节明确要求：**对外商业产品、公开镜像、持续批量公开再分发必须事先取得书面授权**。仅显示标题/摘要和来源，也不能自动代替授权。项目当前公开可访问，因此不能默认把第三方热点、日报、周报直接重新发布到站内。

**目前代码默认 `AIHOT_PUBLIC_DISPLAY_ALLOWED=false`**：

- 三栏正常开放，展示 AIHOT 官方原站阅读入口；
- 不会发送任何 API 请求，不会抓取、缓存、存储或公开其内容；
- 当前站的管理员订阅系统与 RSS 抓取不受影响。

申请授权：邮件发送到 **agent@virxact.com**，说明 DiggSpace 域名、非官方身份、拟公开展示热点 Top 10／日报／周报（哪些字段、是否展示摘要）、预计访问量、缓存方式、来源链接、是否商业运营。收到来自官方邮箱的**明确书面许可**及具体范围后，才执行下列启用步骤。

## 获得书面授权后的启用步骤

GitHub → Settings → Secrets and variables → Actions → New repository secret：

- Name：`AIHOT_WRITTEN_PERMISSION_CONFIRMED`
- Value：`YES_WITH_EMAIL_APPROVAL`

注意：**只有真实获得覆盖上述用途的书面授权后才设置此项。** 这不是 API Key，也不会替你取得授权；你应保留官方回复供核验。

随后运行 GitHub Actions 的 **Deploy DiggSpace to digg.space (manual)**，确认 `BIND_DIGG_SPACE`。临时部署配置才会把 `AIHOT_PUBLIC_DISPLAY_ALLOWED` 设为 `true`，正式展示三个栏目。未设置该 Secret 的所有部署仍始终关闭内容再分发。

## 实现细节

- `frontend/worker/aihot.js`：三个固定 API 路径、OpenAPI 字段验证与转换；不会转发原始 JSON，也不会将第三方数据作为本网站独立 RSS 来源导入。
- `frontend/worker/views-aihot.js`：显示热点 Top 10、日报刊期导读／栏目条目、周报期号／总述／栏目条目，保留 AIHOT canonical 和原文链接。
- `frontend/migrations/0013_aihot_cache.sql`：独立 D1 条件缓存，每个接口仅保存一份当前所需的结构化视图，支持 ETag / If-None-Match 及 304。使用 D1 租约避免并发访问造成大量请求。
- 429/503 遵守 `Retry-After` 并保留上次成功的视图；网络错误会退避。页面不提供 AIHOT JSON API 代理。
- 不声明与 AIHOT 存在官方合作；始终链接 AIHOT 的来源、公开规则与原文。
- 日报、周报撤稿或改正后以最新版缓存覆盖旧版，不做永久历史镜像。

## 需要注意

即使取得 AIHOT 公开展示授权，也不代表取得所有第三方新闻图片、原文的再许可。这里不复制图像、第三方全文，仅在符合书面授权的范围内展示必要字段；授权细节应优先于默认展示范围。
