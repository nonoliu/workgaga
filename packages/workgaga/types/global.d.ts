/**
 * 全局类型声明（随 npm 发布给用户）
 *
 * 为通过 `<script>` 标签引入 workgaga 的用户
 * 提供 `window` 上挂载对象的类型支持。
 *
 * @example
 * 在 tsconfig.json 中引入：
 * ```json
 * {
 *   "compilerOptions": {
 *     "types": ["workgaga/types/global"]
 *   }
 * }
 * ```
 *
 * 或在任意 .d.ts 文件中：
 * ```ts
 * /// <reference types="workgaga/types/global" />
 * ```
 */

import type Cherry from '../dist/types/Cherry';
import type CherryStream from '../dist/types/CherryStream';
import type CherryEngine from '../dist/types/index.engine.core';
import type MermaidCodeEngine from '../dist/types/addons/cherry-code-block-mermaid-plugin';
import type PlantUMLCodeEngine from '../dist/types/addons/cherry-code-block-plantuml-plugin';

export {};

declare global {
  interface Window {
    /**
     * workgaga 编辑器构造函数。
     *
     * 根据引入的构建产物不同，类型有所区别：
     * - 完整版（workgaga.js / workgaga.core.js）→ `Cherry`
     * - 流式版（workgaga.stream.js）→ `CherryStream`
     *
     * @example
     * ```ts
     * const cherry = new window.Cherry({ id: 'markdown' });
     * ```
     */
    Cherry?: typeof Cherry | typeof CherryStream;

    /**
     * workgaga 引擎构造函数。
     *
     * 仅包含核心引擎，不包含编辑器 UI。适用于：
     * - 服务端渲染（SSR）
     * - 纯文本转换场景
     * - 无 UI 的解析需求
     *
     * @example
     * ```ts
     * const engine = new window.CherryEngine({
     *   engine: { global: { urlProcessor: (url) => url } }
     * });
     * const html = engine.makeHtml(markdownText);
     * ```
     */
    CherryEngine?: typeof CherryEngine;

    /**
     * Mermaid 代码块插件（UMD 构建产物自动挂载）
     *
     * @example
     * ```ts
     * Cherry.usePlugin(window.CherryCodeBlockMermaidPlugin, {
     *   mermaid: window.mermaid,
     * });
     * ```
     */
    CherryCodeBlockMermaidPlugin?: typeof MermaidCodeEngine;

    /**
     * PlantUML 代码块插件（UMD 构建产物自动挂载）
     *
     * @example
     * ```ts
     * Cherry.usePlugin(window.CherryCodeBlockPlantumlPlugin, {
     *   baseUrl: 'http://www.plantuml.com/plantuml',
     * });
     * ```
     */
    CherryCodeBlockPlantumlPlugin?: typeof PlantUMLCodeEngine;
  }
}
