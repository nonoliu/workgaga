# workgaga

[简体中文](./README.CN.md) | English

workgaga is a local-first personal work assistant for planning, writing, knowledge management, and AI-assisted execution. It helps individuals organize daily work, manage tasks and schedules, build a connected knowledge base, and turn work context into documents or reports.

Markdown editing is one of its core capabilities: workgaga includes a full Markdown editor and uses Markdown files as a lightweight, portable format for notes, plans, documents, and knowledge-base content.

## What this project contains

This repository is a Yarn workspace with three main packages:

| Package | Description |
| --- | --- |
| `packages/client` | The desktop personal work assistant. Built with Vue 3, Pinia, Vite, and Tauri 2. |
| `packages/workgaga` | The Markdown editor package used by the desktop client and examples. |
| `packages/vscodePlugin` | A VS Code Markdown preview extension powered by `workgaga`. |

## Main features

### Personal work dashboard

- Daily dashboard for planning and reviewing work.
- Create todos with priority, scene, tags, and estimated time.
- Track todo states: planned, doing, and done.
- Focus on one task and record actual work time.
- Review completed tasks with completion notes and process feedback.
- Manage historical carry-over tasks and bring them back into today’s plan.
- Create schedules with date, time range, description, and linked documents.
- Link documents to todos and schedules so work context stays connected.

### AI work assistant

- Built-in AI assistant page with conversation history and task records.
- Use AI around the current document, knowledge base, todos, schedules, and daily work context.
- Configurable LLM channels with encrypted API-key storage.
- Supports OpenAI-compatible, Anthropic, and Gemini-style tool loops in the runtime.
- Built-in tools for context reading, knowledge retrieval, todo/schedule access, document saving, web search/fetch, weather, daily report context, and work-report generation.
- Skill and Agent management with built-in and installable plugin manifests.
- Plugin installation from local app data, GitHub manifest URLs, or SkillHub-style URLs.
- MCP server configuration and MCP tool definition support in the AI runtime.
- Workspace-aware developer tools for file listing, reading, searching, writing, patching, and checks.

### Knowledge base and knowledge graph

- Open local folders as knowledge bases.
- Browse Markdown files in the knowledge base sidebar.
- Create new documents under the current knowledge base.
- Index `.md` and `.markdown` files recursively.
- Parse wiki-style links like `[[Note]]` and normal Markdown links.
- Build a knowledge graph with existing notes, missing links, and note relationships.
- Refresh the graph when documents change.

### Markdown documents and editor

- Create, open, edit, and save local Markdown files.
- Restore the last opened document and maintain a recent-document list.
- Track unsaved changes and prompt before switching documents or closing the app.
- Switch editor modes: edit only, preview only, or edit + preview.
- Export the current document as Markdown, HTML, PNG long image, or PDF.
- Use Markdown editing capabilities from `packages/workgaga`, including tables, code blocks, formulas, Mermaid, media insertion, and rich preview rendering.

### VS Code extension

The `packages/vscodePlugin` package provides a VS Code Markdown preview extension with:

- Markdown preview command.
- F10 shortcut for previewing Markdown files.
- Theme configuration.
- Image upload configuration options.

## Installation

Install dependencies from the repository root:

```bash
yarn install
```

Requirements:

- Node.js `>=24`
- Yarn `>=1.22.18`

## Development

Start the Markdown editor package development server:

```bash
yarn dev
```

Start the desktop client:

```bash
yarn dev:client
```

Start the React example:

```bash
yarn example:react
```

## Build

Build the Markdown editor package:

```bash
yarn build
```

Build the desktop client:

```bash
yarn build:client
```

Build the VS Code extension:

```bash
yarn build:vscodePlugin
```

## Test and lint

Run editor tests:

```bash
yarn test
```

Update test snapshots:

```bash
yarn test:update
```

Run lint checks across packages:

```bash
yarn lint:all
```

Automatically fix lint/format issues where possible:

```bash
yarn lint:fix:all
```

## Markdown editor package

The `packages/workgaga` package builds multiple editor outputs:

| Build | Purpose |
| --- | --- |
| Full build | General browser editor usage. |
| Core build | Editor usage without bundled Mermaid. |
| Engine build | Markdown-to-HTML rendering without the full editor UI. |
| Stream build | Streaming-output scenarios such as AI chat rendering. |
| Addons build | Separate addon/plugin build artifacts. |
| Styles build | CSS output. |
| Types build | Type declarations. |

A basic ESM usage example:

```javascript
import 'workgaga/dist/workgaga.css';
import Cherry from 'workgaga';

const editor = new Cherry({
  id: 'markdown-container',
  value: '# Hello workgaga',
});
```

## Examples

Browser examples are available in [examples](./examples):

- [Basic editor](./examples/basic.html)
- [Full example](./examples/index.html)
- [Mobile example](./examples/h5.html)
- [Multiple instances](./examples/multiple.html)
- [Preview only](./examples/preview_only.html)
- [Image editing](./examples/img.html)
- [Table editing](./examples/table.html)
- [Mermaid](./examples/mermaid.html)
- [AI chat rendering](./examples/ai_chat.html)
- [AI chat stream rendering](./examples/ai_chat_stream.html)
- [VIM mode](./examples/vim.html)

## License

This project is licensed under the **Apache License 2.0**.

- Repository package license: `Apache-2.0`
- License text: [packages/vscodePlugin/LICENSE](./packages/vscodePlugin/LICENSE)

Third-party dependencies are distributed under their own licenses. Review their license files when redistributing this project or built artifacts.
