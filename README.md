# 网页分析生成站

一个可独立部署、便于编辑的网页分析与提示词生成工作台。逐页拆解公开参考网页的模块、视觉、组件和交互，整理可编辑的分析结果，并生成可交给 Codex、Gemini、Claude Code 等 Agent 的建站提示词。工作台界面为静态网页；参考网页实采由本地 Node.js 服务和 Chromium 完成。

实采会在安全边界内记录悬停/可恢复点击的状态变化、整页可见链接的目标类型与 `target`/`rel`，以及多个滚动位置上的透明度、位移、滤镜、CSS `animation`/`transition`、时长、延迟和缓动变化。链接只提取目标，不自动跟随；登录、购买、提交、删除等高风险动作不会触发。普通滚动或懒加载不会被当作已验证动画，未观察到的状态会标注为待人工确认。

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

## 使用 SOP

网站内置「使用 SOP」工作区，适合首次上手和团队培训，涵盖从参考网页实采、模块核对、素材管理到 Agent 提示词交付的完整步骤，并说明线上静态预览、分析服务和本地资料的边界。

简版流程：

1. 输入无需登录的公开参考网页，填写页面类型、目标用户、页面目标和视觉观察。
2. 发起实采并核对桌面/手机证据；再逐模块编辑目的、风格、组件、交互和专业判断。
3. 在提示词工作台填写真实简历/公司/品牌信息，添加并标注素材。
4. 选择“分析并搭建 / 按现有分析搭建 / 只分析网页”，设置 Agent 和技术约束。
5. 复核提示词，复制给网页开发 Agent 或导出 Markdown；使用的素材需单独放进 Agent 可访问的项目目录。

上传文件保存在当前浏览器的 IndexedDB，文本草稿保存在 localStorage，不会传到本站服务端，也不会自动同步到其他电脑。TXT/MD/CSV/JSON 会读取最多 20,000 字符；图片、PDF、DOCX 不会在工作台内自动解析全文或 OCR，也不会自动附加到 Agent。要实际使用，请将它们下载到 Agent 可访问的项目目录。提示词要求 Agent 逐个盘点文件和内容项目，映射到对应网页模块；无法读取的项目必须明确列出并请求补充，不得编造。图片默认保留原始宽高比并完整展示（响应式宽度、`height:auto`、`object-fit:contain` 或等效实现），禁止拉伸或无说明裁切。每项附件最大 15 MB，最多 20 项。

## 独立编辑

- `index.html`：页面结构及中文名、描述。
- `styles.css`：视觉样式、响应式断点。
- `app.js`：分析工作区、素材库和提示词逻辑。
- `analyzer.mjs`：公开网页校验和实采分析。
- `server.mjs`：本地静态服务及 `/api/analyze` 接口。
- `skills/web-design-analysis/SKILL.md`：可下载的通用网页设计分析技能。
- 提示词工作台的 `DESIGN.md` 面板：可从 VoltAgent/awesome-design-md 加载 Apple、Claude、Vercel 规范，也可上传、粘贴、编辑和导出 Markdown；选中的规范作为视觉建议并入提示词。

设计系统远程加载需要联网访问 `raw.githubusercontent.com`；网络不可用时，可先在 [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 下载 `DESIGN.md` 后上传。本机浏览器会保存当前选中的文档，不会自动跨设备同步。页面实采与用户明确要求优先于设计系统建议；下载/复制提示词时 Markdown 规范内容会一并交付。

运行检查：

```sh
npm test
node --check analyzer.mjs
node --check app.js
```

Windows 本机如果 `npm run browser:install` 下载 Chromium 失败，服务会自动尝试使用已安装的 Google Chrome 或 Microsoft Edge；也可以显式设置 `CHROME_EXECUTABLE` 后再运行 `npm start`。

## 发布

推送到 `main` 分支会触发 `.github/workflows/pages.yml` 并发布静态界面到 GitHub Pages。GitHub Pages 不运行 Node/Chromium API；在 Pages 页面提交网址后，界面会把表单交接到本机 `http://127.0.0.1:4173/` 并自动开始实采，避免浏览器拦截 Pages 到本机 API 的跨站请求。也可以将整站作为 Docker Web 服务同源部署。跨电脑时，代码/SOP 由 Git 同步，浏览器草稿和 IndexedDB 附件不会自动同步。

如需让访客在线实采，可将仓库作为同源 Docker Web 服务部署。见 [DEPLOY.md](DEPLOY.md)；本地可用 `docker compose up --build` 验证。Docker 服务同时托管前端和 `/api/analyze`，GitHub Pages 仍然只是静态预览。
