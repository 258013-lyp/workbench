# 工作台持久化部署包（GitHub Pages 就绪）

本仓库包含两个标准静态 PWA，可直接部署到 GitHub Pages（或任意静态托管）长期在线，链接固定、不会被回收。

## 目录结构
- `doudou/` — 拼豆工作台（豆豆小屋）。相对路径 PWA，含 `sw.js` 离线缓存、manifest、图标、图库页。
- `trip/` — 出差规划工作台。相对路径 PWA，含 `sw.js`、manifest、图标。

## 为什么能长期稳定在线
两个站点所有资源均使用**相对路径**（`index.html`、`icon-192.png`、`./` 等），不依赖任何绝对域名。因此：
- 部署到根域（`https://用户名.github.io/仓库/`）或子路径（`https://用户名.github.io/仓库/doudou/`）都能正常安装为 PWA；
- 换域名、换托管都不用改代码；
- GitHub Pages 仓库不删则永久在线，不存在沙箱回收问题。

## 部署到 GitHub Pages（三步）
1. 在 GitHub 新建一个仓库（例如 `workbench`），**不要**勾选自动生成 README。
2. 将本仓库内容推送到该仓库的 `main` 分支（见下方授权方式）。
3. 仓库 `Settings → Pages → Source` 选择 `Deploy from a branch` → `main` → `/ (root)`，保存。

稍等 1–2 分钟，访问：
- 拼豆：`https://<用户名>.github.io/<仓库名>/doudou/`（注意末尾斜杠）
- 出差：`https://<用户名>.github.io/<仓库名>/trip/`

## 绑定自定义域名（可选）
1. 在你的域名服务商处，添加 CNAME 记录指向 `<用户名>.github.io`。
2. 在仓库根目录新建 `CNAME` 文件，内容仅一行你的域名（如 `bench.example.com`）。
3. `Settings → Pages` 中填写该自定义域并保存，等待证书签发。

## 授权 / 推送方式（由助手协助）
- **方式 A（推荐）**：在 WorkBuddy 左侧「连接器」连接并信任 GitHub，连接后助手直接建仓库、推送、开启 Pages，无需命令行。
- **方式 B**：你自己在 GitHub 网页建好空仓库，把仓库 URL 给助手，并确保本机 `git` 已登录（Git Credential Manager），助手执行 `push`。
- 两个站点均为纯静态文件，无需构建步骤。
