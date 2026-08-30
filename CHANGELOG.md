# 部署更新日志（workbench · GitHub Pages）

## 2026-08-30 晚风予言创作台 · 实时热榜（点一下就拉·各平台热搜）

### 诉求
选题热点要的是**各自媒体平台真实热门话题/热搜**，且**点一下按钮就刷新**（不是后台定时刷新，不符合创作习惯）。

### 改动
- 热点面板新增 **「实时热榜」板块**：平台标签（微博/抖音/小红书/知乎/B站/百度/头条）+「🔄 拉实时热榜」按钮，**点一下就经代理服务端实时抓取该平台当下热搜/热门话题**，每条可「点击转灵感 / 复制」，带来源灵感。
- 浏览器直连各平台接口必被 CORS 挡死，故改为经「**你掌控的代理**」服务端抓取（服务端有真实外网、无 CORS）：
  - 默认自动用本机代理 `http://localhost:8787`（需先 `node scripts/proxy.mjs` 起服务，零账号）；
  - 或在「⚙ 代理」里填 **Cloudflare Worker 地址**（部署 `worker/hot-proxy.js`，手机/多设备也能用）。
- 原 30 分钟定时 Action 仅作**静默兜底**（保证数据永不为空），不再作为主刷新方式。
- 面板「↻ 刷新选题库」保留：拉取各栏目赛道选题（含同源 hot.json 兜底）。

### 新增文件
- `scripts/proxy.mjs`：Node 本机代理，多源竞速抓取（微博/抖音/小红书/知乎/B站/百度/头条），带超时与容错，CORS 全开。
- `worker/hot-proxy.js`：Cloudflare Worker 版，逻辑同源，供多设备使用。

### 说明
- 小红书官方无开放热榜接口，依赖第三方聚合，可能为空；其余 6 个平台均为主流半开放源。
- 公共 CORS 代理（allorigins/codetabs 等）实测在国内 Cloudflare 522 不可达，故不采用，改用自托管代理。

## 2026-08-29 晚风予言创作台 · 三栏结构化选题升级

### 改动
`wfyy/晚风予言创作台.html` 三栏选题升级为**结构化卡片**，数据策略**联网优先、本地种子仅参考**：

- **晚风诗笺（古诗词）**：选题 = `{古诗词名, 作者, 朝代, 名句}`
  → 卡片：《名》·作者(朝代) + 名句
- **晚风映言（影视台词/金句，含电影+电视剧）**：选题 = `{影视剧名, 类型:电影|电视剧, 台词, 角色, 演员}`
  → 卡片：《剧名》[类型] + 台词 + 角色/演员
- **晚风留声（音乐）**：选题 = `{歌名, 歌手}`
  → 卡片：「歌名」—歌手

实时热词命中种子作品 → 标「实时」浮前；未命中走本地种子 → 标「参考·离线」；诗笺额外尝试拉实时诗词（失败静默）。

### 工程
- `genColTopics` 增加结构化分支；`COL_TOPIC_TPL` 三栏改为种子对象 `SEED_SHIJIAN / SEED_YINGYAN / SEED_LIUSHENG`。
- 新增 `buildStructuredTopics / makeStructTopic / matchLiveToSeed / enrichStructuredLive`；渲染新增 `topic-struct` 样式与 `topicDisplay()`。
- Node 对抗审计（DOM 桩 + vm）：61/61 全部通过，0 运行时错误。

### 托管变更
- **Gitee Pages 已下线**，本工作台统一收敛至 **GitHub Pages** 长期在线：
  `https://258013-lyp.github.io/workbench/wfyy/晚风予言创作台.html`
- 部署通道：ed25519 SSH 部署密钥（私钥 `C:/hf-tmp/workbench_deploy_ed25519`），推送 main 后约 1 分钟自动重建。

## 2026-08-29（续）三栏「实时参考」再升级

### 背景
首版三栏虽为结构化卡片，但其内容来自**本地种子**（`SEED_*`），联网时仅做「热词命中种子」匹配，命中率极低 → 三栏长期显示「参考·离线」，与碎语/心事两栏的「实时」不一致。本版让三栏**真正联网拉取实时参考**，与其他两栏合集对齐。

### 改动
- **晚风诗笺**：联网实时拉取古诗词（`api.gushi.ci`，每次刷新随机新诗，去重），标「实时参考」浮前；离线/失败退回 `SEED_SHIJIAN`（参考·离线）。
- **晚风映言**：实时热词 / 我的文案主题 命中扩展影视台词池 `SEED_YINGYAN`（24 条，带 `themes` 主题标签）；无命中则按日轮换兜底，保证联网即有时参考。
- **晚风留声**：实时热歌榜多源竞速（`vvhan`/`oioweb` 热歌接口）+ 热词/主题命中歌单池 `SEED_LIUSHENG`（24 条，带 `themes`）；接口失败退回主题/轮换。
- 三栏实时卡片徽章统一为 **「实时参考」**；离线种子兜底徽章 **「参考·离线」**。非结构化两栏（碎语/心事）行为不变（实时选题）。

### 工程
- 新增 `fetchLivePoems / fetchLiveQuotes / fetchLiveSongs / fetchHotSongs / normalizeSongs / refreshStructuredCol`；`applyLiveItems` 改为 async，联网即拉取三栏实时结构化参考。
- 废弃旧 `enrichStructuredLive`（仅单首随机诗、且不覆盖映言/留声），统一并入上述实时管道；`refreshColTopics` 对结构化栏目改走 `refreshStructuredCol`。
- 渲染条数上限 16→20，保证三栏实时卡片在总览中可见。
- Node 对抗审计（DOM 桩 + vm）：14/14 全部通过，0 运行时错误。

## 2026-08-30 实时参考数据源改为「仓库同源 JSON」（修复刷新不变）

### 背景
上一版三栏实时参考依赖外部第三方 API（`api.gushi.ci` 古诗词、`vvhan`/`oioweb` 热歌/热榜等）。实测这些源**全部失效**（超时、404 或被 CORS 拦截），浏览器端 `fetch` 静默 `catch` 后退回到静态种子池 → 表现为「三栏永远离线、点刷新毫无变化」。已确认这是导致用户反馈「古诗词还是离线选题、刷新无变化」的根因。

### 改动
- **数据源改为仓库内同源 JSON**：新增 `wfyy/data/{poems,quotes,songs,hot}.json`（各 30 条策展数据），与页面**同源托管于 GitHub Pages**，彻底规避 CORS / 外部源失效问题。
- **每次刷新轮换取样**：新增 `_refreshNonce` + `bumpNonce()` + `samplePool()`，按 nonce 决定取样窗口起点并对窗口做确定性洗牌。主刷新（↻ 刷新）与栏目「↻ 本栏换一批」都会在拉取前先 `bumpNonce()`，保证**每次点击都看到不同参考**。
- **`fetchLivePoems/fetchLiveQuotes/fetchLiveSongs`** 现改为 `fetch('./data/*.json')` 加载同源数据，失败才退回内联 `SEED_SHIJIAN/SEED_YINGYAN/SEED_LIUSHENG`。
- **`fetchLiveItems`（热点）** 改为优先加载同源自 `data/hot.json`，不可用时退回内联 `HOT_SEED()`。
- 删除因外部 API 失效而无人调用的 `fetchHotSongs` / `normalizeSongs`（遗留死代码已清理）。
- 内联 `SEED_*` / `HOT_SEED()` 仅作 `file://` 直接打开时的兜底（同源 JSON 不可用时）；GitHub Pages 线上版走同源 JSON。

### 工程
- 代码层替换集中在数据获取段（约 1558–1636 行），`applyLiveItems` / `refreshStructuredCol` / `fetchLiveItems` 三处调用方均已改为 async + 先 `bumpNonce()`。
- 残留引用核查：`fetchHotSongs` / `normalizeSongs` 已无引用；`node --check` 语法校验通过（脚本 151,735 字节，0 错误）。
- 新增文件：`wfyy/data/poems.json`（30）、`quotes.json`（30）、`songs.json`（30）、`hot.json`（30），Node `require` 校验均通过。

## 2026-08-30（续）选题热点改为「GitHub 定时 Action 服务端实时抓取」

### 背景
用户明确：选题热点要的是**全网实时热点**，不是提前写死的 30 条——写死即失去时效性。但浏览器直接 `fetch` 第三方热榜 API 在 2026 年已不可行：实测 vvhan / oioweb 直接 `fetch failed`、tenapi 502、微博官方接口 `Forbidden`（CORS + 源大面积失效）。故必须把抓取搬出浏览器。

### 方案
新增 **GitHub Actions 定时任务**（`.github/workflows/update-hot.yml`，cron 每 30 分钟 + 可手动触发）：
- 运行在 GitHub 真实服务器（有外网、无浏览器 CORS 限制），服务端多源竞速抓取**真实全网热点**；
- 抓取脚本 `scripts/update-hot.mjs`：内置多适配器（百度实时热搜 HTML 解析、微博 hotSearch JSON+请求头、oioweb/vvhan 等聚合 API 通用抽取），合并去重→洗牌→写入 `wfyy/data/hot.json` 与 `data/hot.json`；
- 任一源带回真实数据即写入；**全部失败则保留旧文件不覆盖**，保证页面永远有内容；
- 每次抓取仅内容有变化才提交，推送 main 触发 Pages 自动重建（约 1 分钟）。

### 效果
- 选题热点（hot.json）现在是**最近 30 分钟内的真实全网热点**，有时效性，非人工预设；
- 页面仍走同源 `fetch('./data/hot.json')`，无 CORS 问题；每次刷新配合 `bumpNonce` 轮换，且底层数据本身每 30 分钟自动换新；
- 结构化三栏（诗笺/映言/留声）走各自同源 JSON 池（诗词/台词/歌曲属于参考库，本就不适用"实时"，保持现状）。

### 工程
- 新增 `scripts/update-hot.mjs`（Node 20，`node --check` 通过）、`.github/workflows/update-hot.yml`。
- 首跑后需在 Actions 日志确认哪些源真能用（服务端网络与沙箱不同），必要时迭代增删源。
