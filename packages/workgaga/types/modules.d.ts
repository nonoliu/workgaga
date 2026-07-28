/**
 * workgaga 环境模块声明
 *
 * 为 workgaga 对外提供的非 TypeScript 资源（CSS 等）声明模块类型，
 * 使消费者在 noUncheckedSideEffectImports 开启时不会报错。
 *
 * 此文件随 npm 发布，不参与 TSC 编译，无需构建脚本处理。
 *
 * @example
 * 在 tsconfig.json 中引入：
 * ```json
 * {
 *   "compilerOptions": {
 *     "types": ["workgaga/types/modules"]
 *   }
 * }
 * ```
 *
 * 或在任意 .d.ts 文件中：
 * ```ts
 * /// <reference types="workgaga/types/modules" />
 * ```
 */

/** 完整样式（编辑器 UI + Markdown 渲染），未压缩 */
declare module 'workgaga/dist/workgaga.css';
/** 完整样式（编辑器 UI + Markdown 渲染），压缩版 */
declare module 'workgaga/dist/workgaga.min.css';
/** 仅 Markdown 渲染样式（不含编辑器 UI），适用于预览场景，未压缩 */
declare module 'workgaga/dist/workgaga.markdown.css';
/** 仅 Markdown 渲染样式（不含编辑器 UI），适用于预览场景，压缩版 */
declare module 'workgaga/dist/workgaga.markdown.min.css';

// ─── Addon 插件 ─────────────────────────────────────────

/** Mermaid 代码块插件（独立构建产物，需单独引入） */
declare module 'workgaga/dist/addons/cherry-code-block-mermaid-plugin' {
  const plugin: any;
  export default plugin;
}

/** PlantUML 代码块插件（独立构建产物，需单独引入） */
declare module 'workgaga/dist/addons/cherry-code-block-plantuml-plugin' {
  const plugin: any;
  export default plugin;
}
