# workgaga

简体中文 | [English](./README.md)

workgaga 是一个本地优先的个人工作助手，面向个人的计划管理、写作记录、知识管理和 AI 辅助执行。它帮助用户组织日常工作、管理待办和日程、沉淀互相关联的知识库，并将工作上下文转化为文档或报告。

Markdown 编辑是 workgaga 的核心能力之一：应用内置完整 Markdown 编辑器，并使用 Markdown 文件作为轻量、可迁移的格式，用于承载笔记、计划、文档和知识库内容。

## 项目组成

本仓库采用 Yarn workspace 管理，主要包含三个包：

| 包 | 说明 |
| --- | --- |
| `packages/client` | 桌面端个人工作助手，基于 Vue 3、Pinia、Vite 和 Tauri 2 构建。 |
| `packages/workgaga` | Markdown 编辑器包，供桌面端和示例页面使用。 |
| `packages/vscodePlugin` | 基于 `workgaga` 的 VS Code Markdown 预览插件。 |

## 主要功能

### 个人工作台

- 提供用于日常计划和复盘的工作台视图。
- 创建带优先级、场景、标签和预估耗时的待办。
- 跟踪待办状态：计划中、进行中、已完成。
- 聚焦单个任务，并记录实际工作时间。
- 对已完成任务进行复盘，记录完成说明和过程反馈。
- 管理历史遗留任务，并将其重新拉回今日计划。
- 创建带日期、时间范围、描述和关联文档的日程。
- 将文档关联到待办和日程，让工作上下文保持连接。

### AI 工作助手

- 内置 AI 助手页面，支持历史会话和任务记录。
- 可围绕当前文档、知识库、待办、日程和每日工作上下文使用 AI。
- 支持配置 LLM 渠道，并加密保存 API Key。
- 运行时支持 OpenAI-compatible、Anthropic 和 Gemini 风格的工具调用循环。
- 内置上下文读取、知识检索、待办/日程读取、文档保存、联网搜索/网页读取、天气、日报上下文、工作报告生成等工具。
- 支持 Skill 和 Agent 管理，包含内置能力和可安装的插件清单。
- 支持从本地应用数据、GitHub manifest URL 或 SkillHub 风格 URL 安装插件。
- AI 运行时支持 MCP server 配置和 MCP 工具定义。
- 提供面向工作区的开发者工具，包括文件列表、读取、搜索、写入、补丁应用和检查命令。

### 知识库与知识图谱

- 将本地文件夹打开为知识库。
- 在侧边栏浏览知识库中的 Markdown 文件。
- 在当前知识库下创建新文档。
- 递归索引 `.md` 和 `.markdown` 文件。
- 解析 `[[Note]]` 形式的 Wiki 链接和普通 Markdown 链接。
- 构建包含已有笔记、缺失链接和笔记关系的知识图谱。
- 文档变化后可刷新知识图谱。

### Markdown 文档与编辑器

- 创建、打开、编辑和保存本地 Markdown 文件。
- 恢复上次打开的文档，并维护最近文档列表。
- 跟踪未保存改动，在切换文档或关闭应用前提示确认。
- 支持切换编辑模式：仅编辑、仅预览、编辑 + 预览。
- 支持将当前文档导出为 Markdown、HTML、PNG 长图或 PDF。
- 使用 `packages/workgaga` 提供的 Markdown 编辑能力，包括表格、代码块、公式、Mermaid、媒体插入和富预览渲染。

### VS Code 插件

`packages/vscodePlugin` 提供 VS Code Markdown 预览插件，包含：

- Markdown 预览命令。
- 使用 F10 快捷键预览 Markdown 文件。
- 主题配置。
- 图片上传配置选项。

## 安装

在仓库根目录安装依赖：

```bash
yarn install
```

环境要求：

- Node.js `>=24`
- Yarn `>=1.22.18`

## 开发

启动 Markdown 编辑器包开发服务：

```bash
yarn dev
```

启动桌面客户端：

```bash
yarn dev:client
```

启动 React 示例：

```bash
yarn example:react
```

## 构建

构建 Markdown 编辑器包：

```bash
yarn build
```

构建桌面客户端：

```bash
yarn build:client
```

构建 VS Code 插件：

```bash
yarn build:vscodePlugin
```

## 测试与 lint

运行编辑器测试：

```bash
yarn test
```

更新测试快照：

```bash
yarn test:update
```

运行全部包的 lint 检查：

```bash
yarn lint:all
```

尽可能自动修复 lint/格式问题：

```bash
yarn lint:fix:all
```

## Markdown 编辑器包

`packages/workgaga` 会构建多种编辑器产物：

| 构建 | 用途 |
| --- | --- |
| Full build | 通用浏览器编辑器场景。 |
| Core build | 不内置 Mermaid 的编辑器场景。 |
| Engine build | 不包含完整编辑器 UI 的 Markdown 转 HTML 渲染。 |
| Stream build | AI Chat 等流式输出渲染场景。 |
| Addons build | 独立插件/扩展构建产物。 |
| Styles build | CSS 样式产物。 |
| Types build | 类型声明。 |

基础 ESM 使用示例：

```javascript
import 'workgaga/dist/workgaga.css';
import Cherry from 'workgaga';

const editor = new Cherry({
  id: 'markdown-container',
  value: '# Hello workgaga',
});
```

## 示例

浏览器示例位于 [examples](./examples)：

- [基础编辑器](./examples/basic.html)
- [完整示例](./examples/index.html)
- [移动端示例](./examples/h5.html)
- [多实例](./examples/multiple.html)
- [纯预览](./examples/preview_only.html)
- [图片编辑](./examples/img.html)
- [表格编辑](./examples/table.html)
- [Mermaid](./examples/mermaid.html)
- [AI Chat 渲染](./examples/ai_chat.html)
- [AI Chat 流式渲染](./examples/ai_chat_stream.html)
- [VIM 模式](./examples/vim.html)

## License

本项目使用 **Apache License 2.0** 授权。

- 仓库包授权：`Apache-2.0`
- 授权全文：[packages/vscodePlugin/LICENSE](./packages/vscodePlugin/LICENSE)

第三方依赖使用其各自的授权协议。重新分发本项目或其构建产物时，请同时检查对应依赖的授权文件。
