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
