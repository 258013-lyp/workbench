# 部署更新日志（workbench · GitHub Pages）

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
