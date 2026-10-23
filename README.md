# 网页分析生成站

一个可独立部署、便于编辑的网页分析与提示词生成工作台。逐页拆解公开参考网页的模块、视觉、组件和交互，整理可编辑的分析结果，并生成可交给 Codex、Gemini、Claude Code 等 Agent 的建站提示词。工作台界面为静态网页；参考网页实采由本地 Node.js 服务和 Chromium 完成。

## 在另一台电脑上运行

安装 Git、Node.js 20 或更新版本，然后：

```sh
npm install
npm run browser:install
npm start
```

也可以使用锁文件对应的 pnpm：

```sh
pnpm install
npm run browser:install
npm start
```

打开 <http://127.0.0.1:4173/>。`npm run browser:install` 只需在该电脑首次运行时执行。切勿把私有参考页、登录凭据或敏感资料填入公开站点。

## 使用

1. 输入公开参考网页并开始实采；分析器会检查桌面和手机视口、采样长页、标题、文本、视觉样式、图片和控件。
2. 在独立工作区修订每个网页模块的目的、视觉、组件、交互和专业判断；模块可增删、排序和编辑。
3. 在提示词工作台粘贴简历、公司、品牌和产品事实，或上传图片、PDF、DOCX、TXT、MD、CSV、JSON。纯文本写入提示词；文件可以按用途标注、预览和下载。
4. 复制提示词或导出 Markdown，交给你选择的网页开发 Agent。

上传文件保存在当前浏览器的 IndexedDB，文本草稿保存在 localStorage，不会传到本站服务端，也不会自动同步到其他电脑。图片、PDF、DOCX 不会自动附加到 Agent；要实际使用，请将它们下载到 Agent 可访问的项目目录。PDF 与 DOCX 暂不提取文本，可将需使用的真实事实粘贴到资料框。每项附件最大 15 MB，最多 20 项。

## 独立编辑

- `index.html`：页面结构及中文名、描述。
- `styles.css`：视觉样式、响应式断点。
- `app.js`：分析工作区、素材库和提示词逻辑。
- `analyzer.mjs`：公开网页校验和实采分析。
- `server.mjs`：本地静态服务及 `/api/analyze` 接口。
- `skills/web-design-analysis/SKILL.md`：可下载的通用网页设计分析技能。

运行检查：

```sh
npm test
node --check analyzer.mjs
node --check app.js
```

## 发布

推送到 `main` 分支会触发 `.github/workflows/pages.yml` 并发布静态界面到 GitHub Pages。GitHub Pages 不运行 Node/Chromium API，因此线上页面是界面预览；需要实采分析时，请在本机运行上方 Node 服务。若需多人在线调用分析，需要另行部署安全加固后的 API 服务，并按其地址配置前端。
