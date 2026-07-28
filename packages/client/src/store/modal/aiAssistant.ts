import { defineStore } from 'pinia';
import {
  removeEncryptedChannelApiKey,
  saveEncryptedChannelApiKey,
  getDecryptedChannelApiKey,
} from '../../utils/llmKeyCrypto';
import {
  installPluginFromGitHubUrl,
  installPluginFromSkillHubUrl,
  loadInstalledPluginManifests,
  uninstallPluginDir,
} from '../../utils/aiPlugins';
import { llmFetch } from '../../utils/llmHttpClient';
import {
  builtinAITools,
  buildLLMRequestSpec,
  createDetailedLLMStatusError,
  extractProviderReply,
  getLLMStatusFallbackMessage,
  createBuiltinAIToolRegistry,
  isEventStreamResponse,
  type AIRuntimeEvent,
  resolveRuntimeTools,
  runAnthropicToolLoop,
  runGeminiToolLoop,
  runOpenAIToolLoop,
  appendAITranscriptRecord,
  buildAgentSystemPromptV2,
  buildCodeChangePlanGate,
  buildTaskPlan,
  runAutonomousTask,
  detectAIProblemIntent,
  buildAIEvidencePlan,
  buildAITaskCompletionCriteria,
  buildAITaskProfile,
  formatAIEvidencePlanPrompt,
  formatAITaskCompletionCriteriaPrompt,
  formatAITaskProfilePrompt,
  getProblemPolicy,
  getProviderToolStrategy,
  verifyFinalAnswerReadiness,
  evaluateDailyReportAnswerConsistency,
  writeDegradedAnswerArtifact,
  readAITranscript,
  uiMessageToTranscriptRecord,
  createAIAgentLLMExecutor,
  createAIAgentRuntime,
  createDefaultAIAgentRegistry,
  createProjectAIAgentRegistry,
  formatAIAgentListPrompt,
  getAIAgentFeatureFlags,
  routeAIAgent,
  resolveAIRuntimeWorkspace,
} from '../../utils/aiRuntime';
import type { AIModelProvider, AITaskRun as AIRuntimeTaskRun } from '../../utils/aiRuntime';
export type { AIModelProvider } from '../../utils/aiRuntime';
import { documentDir } from '@tauri-apps/api/path';
import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs';

export type AITaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AICategory = 'general' | 'writing' | 'research' | 'planning' | 'organizing' | 'automation';
export type AIOutputKind = 'document' | 'todo' | 'schedule' | 'knowledge';
export type AIToolName =
  | 'read-context'
  | 'write-document'
  | 'manage-task'
  | 'manage-schedule'
  | 'use-knowledge'
  | 'web-search'
  | 'web-fetch'
  | 'weather-forecast'
  | 'search-knowledge'
  | 'list-knowledge-notes'
  | 'read-knowledge-note'
  | 'list-todos'
  | 'get-todo'
  | 'list-schedules'
  | 'get-schedule'
  | 'collect-today-work-activities'
  | 'build-today-work-report'
  | 'collect-daily-report-context'
  | 'build-daily-report-brief'
  | 'read-current-document'
  | 'save-document'
  | 'create-todo'
  | 'create-schedule'
  | 'refresh-knowledge-index'
  | 'run-agent'
  | 'list-files'
  | 'read-file'
  | 'search-files'
  | 'write-file'
  | 'apply-patch'
  | 'run-check';

export interface AISkill {
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  category: AICategory;
  promptTemplate: string;
  preferredTools?: AIToolName[];
  requiredTools?: AIToolName[];
  enabled: boolean;
  userInvocable: boolean;
  builtin: boolean;
  outputPolicy: Record<'mayCreateDocument' | 'mayCreateTodo' | 'mayCreateSchedule' | 'mayUpdateKnowledgeBase', boolean>;
  createdAt: number;
  updatedAt: number;
}

export interface AIAgent {
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  systemPrompt: string;
  enabled: boolean;
  builtin: boolean;
  allowedSkills: string[];
  allowedTools: AIToolName[];
  permissionMode: 'ask' | 'auto-read' | 'auto-write';
  memoryScope: 'none' | 'app' | 'workspace' | 'matter';
  runMode: 'foreground' | 'background';
  usageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AITask {
  id: string;
  title: string;
  userInput: string;
  status: AITaskStatus;
  category: AICategory;
  agentId?: string;
  skillIds: string[];
  prompt: string;
  progressText: string;
  result: string;
  outputKinds: AIOutputKind[];
  outputFiles: string[];
  conversationId?: string;
  lastMessageAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type AIConversationStatus = 'active' | 'paused' | 'completed' | 'failed';
export type AIMessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type AIMessageStatus = 'sending' | 'sent' | 'streaming' | 'completed' | 'failed';
export type AIArtifactType = 'document' | 'todo' | 'schedule' | 'knowledge';
export type AIPluginSourceType = 'local' | 'github' | 'skillhub';
export type AIPluginManifestKind = 'skill' | 'agent' | 'tool';

export interface AIPluginManifestBase {
  id: string;
  name: string;
  version: string;
  description?: string;
  sourceType: AIPluginSourceType;
  sourceUrl?: string;
  author?: string;
  homepage?: string;
  tags?: string[];
  minAppVersion?: string;
}

export interface AISkillPluginManifest extends AIPluginManifestBase {
  kind: 'skill';
  category: AICategory;
  promptTemplate: string;
  outputPolicy?: {
    mayCreateDocument?: boolean;
    mayCreateTodo?: boolean;
    mayCreateSchedule?: boolean;
    mayUpdateKnowledgeBase?: boolean;
  };
}

export interface AIAgentPluginManifest extends AIPluginManifestBase {
  kind: 'agent';
  systemPrompt: string;
  allowedCategories?: AICategory[];
  allowedSkills?: string[];
  allowedTools?: AIToolName[];
  defaultRunMode?: 'manual' | 'semi-auto' | 'auto';
}

export interface AIToolPluginManifest extends AIPluginManifestBase {
  kind: 'tool';
  toolName: string;
  runtime: 'mcp' | 'http' | 'builtin';
  inputSchema: Record<string, unknown>;
  mcpServerId?: string;
  httpEndpoint?: string;
  readOnly?: boolean;
  defaultPermission?: 'allow' | 'deny' | 'ask' | 'passthrough';
}

export type AIPluginManifest = AISkillPluginManifest | AIAgentPluginManifest | AIToolPluginManifest;

export interface AIInstalledPluginRecord {
  id: string;
  kind: AIPluginManifestKind;
  name: string;
  version: string;
  sourceType: AIPluginSourceType;
  sourceUrl?: string;
  installedAt: number;
  updatedAt: number;
}

export const isSkillPluginManifest = (manifest: AIPluginManifest): manifest is AISkillPluginManifest =>
  manifest.kind === 'skill';

export const isAgentPluginManifest = (manifest: AIPluginManifest): manifest is AIAgentPluginManifest =>
  manifest.kind === 'agent';

export const isToolPluginManifest = (manifest: AIPluginManifest): manifest is AIToolPluginManifest =>
  manifest.kind === 'tool';

export const validatePluginManifestBase = (manifest: Record<string, unknown>): string[] => {
  const errors: string[] = [];
  if (typeof manifest.id !== 'string' || !manifest.id.trim()) errors.push('缺少插件 id。');
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) errors.push('缺少插件名称。');
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) errors.push('缺少插件版本。');
  if (manifest.sourceType !== 'local' && manifest.sourceType !== 'github' && manifest.sourceType !== 'skillhub') {
    errors.push('不支持的 sourceType。');
  }
  return errors;
};

export const validateSkillPluginManifest = (manifest: Record<string, unknown>): string[] => {
  const errors = validatePluginManifestBase(manifest);
  if (manifest.kind !== 'skill') errors.push('kind 必须为 skill。');
  if (typeof manifest.promptTemplate !== 'string' || !manifest.promptTemplate.trim()) {
    errors.push('Skill 插件缺少 promptTemplate。');
  }
  return errors;
};

export const validateAgentPluginManifest = (manifest: Record<string, unknown>): string[] => {
  const errors = validatePluginManifestBase(manifest);
  if (manifest.kind !== 'agent') errors.push('kind 必须为 agent。');
  if (typeof manifest.systemPrompt !== 'string' || !manifest.systemPrompt.trim()) {
    errors.push('Agent 插件缺少 systemPrompt。');
  }
  return errors;
};

export const validateToolPluginManifest = (manifest: Record<string, unknown>): string[] => {
  const errors = validatePluginManifestBase(manifest);
  if (manifest.kind !== 'tool') errors.push('kind 必须为 tool。');
  if (typeof manifest.toolName !== 'string' || !manifest.toolName.trim()) errors.push('Tool 插件缺少 toolName。');
  if (manifest.runtime !== 'mcp' && manifest.runtime !== 'http' && manifest.runtime !== 'builtin')
    errors.push('Tool 插件 runtime 无效。');
  if (!manifest.inputSchema || typeof manifest.inputSchema !== 'object') errors.push('Tool 插件缺少 inputSchema。');
  return errors;
};

export interface AIConversation {
  id: string;
  taskId?: string;
  channelId?: string;
  title: string;
  status: AIConversationStatus;
  provider?: string;
  model?: string;
  lastMessageAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AIMessageToolEvent {
  id: string;
  type: 'start' | 'progress' | 'result' | 'error';
  toolName?: string;
  message: string;
  createdAt: number;
}

export type AIRunTimelineStepType =
  | 'intent_detected'
  | 'policy_selected'
  | 'preflight_started'
  | 'tool_observed'
  | 'fallback_attempted'
  | 'permission_requested'
  | 'reasoning'
  | 'verifying'
  | 'completed'
  | 'failed';

export interface AIRunTimelineStep {
  id: string;
  type: AIRunTimelineStepType;
  title: string;
  detail?: string;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  createdAt: number;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  status: AIMessageStatus;
  toolEvents?: AIMessageToolEvent[];
  timeline?: AIRunTimelineStep[];
  createdAt: number;
  updatedAt: number;
}

export interface AIChangePlanWritePreview {
  toolName: string;
  targetPaths: string[];
  preview: string;
}

export interface AIApprovedChangePlan {
  id: string;
  conversationId?: string;
  files: string[];
  reasons: string[];
  evidence: string[];
  verification: string[];
  writePreview?: AIChangePlanWritePreview;
  approved: boolean;
  createdAt: number;
  approvedAt?: number;
}

export interface AIPendingPermissionRequest {
  id: string;
  conversationId?: string;
  toolName: string;
  behavior: 'ask';
  reason?: string;
  message: string;
  inputPreview: string;
  createdAt: number;
  resolvedAt?: number;
  decision?: 'allow-once' | 'deny-once';
}

export interface AIPendingClarificationRequest {
  id: string;
  conversationId: string;
  questions: string[];
  reason?: string;
  createdAt: number;
  resolvedAt?: number;
  response?: string;
}

export interface AIArtifact {
  id: string;
  conversationId: string;
  messageId?: string;
  type: AIArtifactType;
  title: string;
  summary: string;
  filePath?: string;
  createdAt: number;
}

export interface AIKnowledgeSnippet {
  title: string;
  path?: string;
  content: string;
}

export interface AIContextSnapshot {
  currentFileName?: string;
  vaultName?: string;
  vaultPath?: string;
  noteCount?: number;
  category?: AICategory;
  outputKinds?: AIOutputKind[];
  knowledgeSnippets?: AIKnowledgeSnippet[];
}

export interface AISendOptions {
  agentId?: string;
  channelId?: string;
  userSelectedSkillIds?: string[];
  contextSnapshot?: AIContextSnapshot;
}

export interface LLModelChannel {
  id: string;
  name: string;
  provider: AIModelProvider;
  model: string;
  baseUrl: string;
  enabled: boolean;
  apiKeyStored: boolean;
  apiKeyStoredAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface AIChannelTestResult {
  status: 'idle' | 'checking' | 'success' | 'error';
  message: string;
  testedAt: number;
}

interface AISettings {
  forceReadOnlyMode: boolean;
  requireConfirmBeforeWrite: boolean;
  suggestDocuments: boolean;
  suggestTodos: boolean;
  suggestSchedules: boolean;
  suggestKnowledge: boolean;
  defaultOutputDirectory: string;
  aiDocumentSavePath: string;
  aiDocumentVaultSubdir: string;
  saveDocumentsToCurrentVault: boolean;
  enableKnowledgeSnippetInjection: boolean;
  maxKnowledgeSnippets: number;
  showKnowledgeSnippetPreview: boolean;
  autoExpandKnowledgeSnippetPreview: boolean;
  llmChannels: LLModelChannel[];
  activeChannelId: string;
}

interface AIAssistantState {
  tasks: AITask[];
  skills: AISkill[];
  agents: AIAgent[];
  settings: AISettings;
  channelTestResults: Record<string, AIChannelTestResult>;
  channelTestHistory: Record<string, AIChannelTestResult[]>;
  conversations: Record<string, AIConversation>;
  messages: Record<string, AIMessage>;
  taskRuns: AIRuntimeTaskRun[];
  artifacts: Record<string, AIArtifact>;
  installedSkillPlugins: Record<string, AIInstalledPluginRecord>;
  installedAgentPlugins: Record<string, AIInstalledPluginRecord>;
  pendingPermissionRequests: AIPendingPermissionRequest[];
  pendingClarifications: AIPendingClarificationRequest[];
  changePlans: AIApprovedChangePlan[];
  activeRunIds: string[];
  conversationSummaries: Record<string, string>;
  summaryGenerating: Record<string, boolean>;
}

const STORAGE_KEY = 'workgaga_ai_assistant_state';
const now = () => Date.now();
const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createChannel = (
  channel: Omit<LLModelChannel, 'id' | 'createdAt' | 'updatedAt' | 'apiKeyStored' | 'apiKeyStoredAt'> & {
    apiKeyStored?: boolean;
    apiKeyStoredAt?: number;
  },
): LLModelChannel => ({
  ...channel,
  id: createId('channel'),
  apiKeyStored: channel.apiKeyStored ?? false,
  apiKeyStoredAt: channel.apiKeyStoredAt ?? 0,
  createdAt: now(),
  updatedAt: now(),
});

const createSkill = (skill: Omit<AISkill, 'createdAt' | 'updatedAt'>): AISkill => ({
  ...skill,
  createdAt: now(),
  updatedAt: now(),
});

const builtinSkills: AISkill[] = [
  createSkill({
    id: 'skill-general-answer',
    name: '通用回答',
    description: '直接回答问题、解释概念、给出建议，不默认产生文档。',
    whenToUse: '当用户只是咨询、讨论、解释、判断或需要建议时使用。',
    category: 'general',
    enabled: true,
    userInvocable: true,
    builtin: true,
    outputPolicy: {
      mayCreateDocument: false,
      mayCreateTodo: false,
      mayCreateSchedule: false,
      mayUpdateKnowledgeBase: false,
    },
    promptTemplate:
      '作为万能 AI 助手，先理解用户目标，直接给出清晰、可执行的回答。不要默认写入知识库或创建日程，除非用户明确要求或内容明显值得沉淀。',
  }),
  createSkill({
    id: 'skill-plan-work',
    name: '规划事项',
    description: '把模糊目标拆成阶段、任务、风险和下一步。',
    whenToUse: '当用户要推进一个项目、准备一次沟通、安排一件复杂事情时使用。',
    category: 'planning',
    enabled: true,
    userInvocable: true,
    builtin: true,
    outputPolicy: {
      mayCreateDocument: true,
      mayCreateTodo: true,
      mayCreateSchedule: true,
      mayUpdateKnowledgeBase: false,
    },
    promptTemplate:
      '你负责把模糊目标转化为可确认的行动计划。工作流程：1. 先复述用户目标和约束；2. 判断是否需要研究、计划、执行、验证四个阶段；3. 将复杂任务拆成可并行或顺序执行的步骤；4. 明确每一步的产出、依赖和风险；5. 标注哪些结果适合形成文档、待办、日程或知识沉淀；6. 涉及写入、归档、创建待办或加入日程时，必须等待用户确认。',
  }),
  createSkill({
    id: 'skill-write-document',
    name: '生成文档',
    description: '把想法、记录或讨论整理成结构化 Markdown。',
    whenToUse: '当用户要求写方案、纪要、报告、复盘、说明文档时使用。',
    category: 'writing',
    enabled: true,
    userInvocable: true,
    builtin: true,
    outputPolicy: {
      mayCreateDocument: true,
      mayCreateTodo: true,
      mayCreateSchedule: false,
      mayUpdateKnowledgeBase: true,
    },
    preferredTools: ['search-knowledge', 'web-fetch', 'save-document'],
    promptTemplate:
      '生成结构清晰的 Markdown。若内容具有长期价值，建议保存到 Knowledge；若只是过程材料，建议保存到 Documents、Projects、Meetings 或 Inbox。',
  }),
  createSkill({
    id: 'skill-extract-actions',
    name: '提取行动项',
    description: '从输入或 AI 结果里提取待办、负责人、截止时间。',
    whenToUse: '当文本包含“需要、准备、完成、跟进、截止、明天、下周”等行动信号时使用。',
    category: 'organizing',
    enabled: true,
    userInvocable: true,
    builtin: true,
    outputPolicy: {
      mayCreateDocument: false,
      mayCreateTodo: true,
      mayCreateSchedule: true,
      mayUpdateKnowledgeBase: false,
    },
    preferredTools: ['create-todo', 'create-schedule'],
    promptTemplate:
      '提取明确行动项和时间信息。区分待办和日程：有动作但无固定时间是待办；有明确日期/时间是日程。添加前先让用户确认。',
  }),
  createSkill({
    id: 'skill-organize-output',
    name: '整理产出',
    description: '把 AI 生成内容归档到合适位置，并保留来源和任务记录。',
    whenToUse: '当一次任务产生了文档、结论、清单、计划或知识沉淀时使用。',
    category: 'automation',
    enabled: true,
    userInvocable: true,
    builtin: true,
    outputPolicy: {
      mayCreateDocument: true,
      mayCreateTodo: true,
      mayCreateSchedule: true,
      mayUpdateKnowledgeBase: true,
    },
    preferredTools: ['save-document', 'create-todo', 'create-schedule', 'refresh-knowledge-index'],
    promptTemplate:
      '判断产出类型并建议保存位置：Inbox、Projects、Documents、Meetings、Tasks、Schedule、Knowledge、Reviews。不要把所有内容默认塞进知识库。',
  }),
];

const createAgent = (agent: Omit<AIAgent, 'createdAt' | 'updatedAt' | 'usageCount'>): AIAgent => ({
  ...agent,
  usageCount: 0,
  createdAt: now(),
  updatedAt: now(),
});

const builtinAgents: AIAgent[] = [
  createAgent({
    id: 'agent-universal',
    name: '万能 AI',
    description: '默认主助手，直接面对用户，负责理解目标、选择能力、输出结果。',
    whenToUse: '默认用于所有用户请求。优先直接解决问题，只在复杂任务中调用更专业的 Agent 或 Skill。',
    systemPrompt:
      '你是 workgaga 的万能 AI 助手。用户目标是主线，知识库、文档、日程、待办只是需要时调用或生成的结果。先理解目标，再判断是否需要计划、文档、待办、日程或知识沉淀。',
    enabled: true,
    builtin: true,
    allowedSkills: builtinSkills.map((skill) => skill.id),
    allowedTools: [
      'read-context',
      'write-document',
      'manage-task',
      'manage-schedule',
      'use-knowledge',
      'search-knowledge',
      'list-knowledge-notes',
      'read-knowledge-note',
      'collect-today-work-activities',
      'build-today-work-report',
      'collect-daily-report-context',
      'build-daily-report-brief',
      'list-todos',
      'get-todo',
      'list-schedules',
      'get-schedule',
      'web-search',
      'web-fetch',
      'weather-forecast',
      'save-document',
      'create-todo',
      'create-schedule',
      'refresh-knowledge-index',
      'run-agent',
    ],
    permissionMode: 'ask',
    memoryScope: 'workspace',
    runMode: 'foreground',
  }),
  createAgent({
    id: 'agent-researcher',
    name: '研究分析员',
    description: '处理开放式研究、复杂问题拆解和多资料分析。',
    whenToUse: '当问题需要探索多个角度、比较方案、分析大量上下文时使用。',
    systemPrompt:
      '你是研究分析员，负责处理开放式研究、复杂问题拆解和多资料分析。你的工作方式：1. 先明确研究问题、边界和用户真正要做的决定；2. 从多个角度收集和比较信息，不要只沿着单一路径下结论；3. 将发现分为事实、判断、风险、未知项和建议；4. 不要编造没有证据的结果，不要预测尚未完成的后台任务；5. 输出必须包含关键发现、依据、风险、可选方案和下一步；6. 如果研究结果可能产生长期价值，只提出保存或沉淀建议，不直接写入。',
    enabled: true,
    builtin: true,
    allowedSkills: ['skill-general-answer', 'skill-plan-work'],
    allowedTools: [
      'read-context',
      'use-knowledge',
      'search-knowledge',
      'list-knowledge-notes',
      'read-knowledge-note',
      'collect-today-work-activities',
      'build-today-work-report',
      'collect-daily-report-context',
      'build-daily-report-brief',
      'list-todos',
      'get-todo',
      'list-schedules',
      'get-schedule',
      'web-search',
      'web-fetch',
      'weather-forecast',
    ],
    permissionMode: 'auto-read',
    memoryScope: 'workspace',
    runMode: 'background',
  }),
  createAgent({
    id: 'agent-planner',
    name: '任务规划师',
    description: '把目标拆解成计划、待办和可确认的执行步骤。',
    whenToUse: '当用户需要推进事项、项目、沟通、发布、学习计划时使用。',
    systemPrompt:
      '你是任务规划师。先给计划，不直接写入。把目标拆成阶段、行动项、依赖和可验证结果，并标出哪些可转为待办或日程。',
    enabled: true,
    builtin: true,
    allowedSkills: ['skill-plan-work', 'skill-extract-actions'],
    allowedTools: [
      'manage-task',
      'manage-schedule',
      'search-knowledge',
      'list-knowledge-notes',
      'read-knowledge-note',
      'collect-today-work-activities',
      'build-today-work-report',
      'collect-daily-report-context',
      'build-daily-report-brief',
      'list-todos',
      'get-todo',
      'list-schedules',
      'get-schedule',
      'create-todo',
      'create-schedule',
    ],
    permissionMode: 'ask',
    memoryScope: 'matter',
    runMode: 'foreground',
  }),
  createAgent({
    id: 'agent-writer',
    name: '写作编辑',
    description: '生成、润色、总结 Markdown 文档。',
    whenToUse: '当用户需要方案、纪要、报告、文章、复盘或正式表达时使用。',
    systemPrompt:
      '你是写作编辑。输出结构化 Markdown，并在文档产生后建议自然归档位置。只有长期价值内容才建议加入 Knowledge。',
    enabled: true,
    builtin: true,
    allowedSkills: ['skill-write-document', 'skill-organize-output'],
    allowedTools: [
      'write-document',
      'use-knowledge',
      'search-knowledge',
      'list-knowledge-notes',
      'read-knowledge-note',
      'collect-today-work-activities',
      'build-today-work-report',
      'collect-daily-report-context',
      'build-daily-report-brief',
      'list-todos',
      'get-todo',
      'list-schedules',
      'get-schedule',
      'save-document',
      'web-fetch',
    ],
    permissionMode: 'ask',
    memoryScope: 'workspace',
    runMode: 'foreground',
  }),
  createAgent({
    id: 'agent-developer',
    name: '开发者助手',
    description: '读取项目结构、搜索代码、分析文件，并在确认后执行写入或补丁建议。',
    whenToUse: '当用户需要理解项目、定位代码、分析实现、生成修改建议或做开发任务时使用。',
    systemPrompt:
      '你是开发者助手。先观察项目结构和相关文件，再提出修改计划。读取和搜索可以自动进行；写文件、应用补丁、运行检查必须等待权限确认。不要在没有读取相关文件前提出具体代码改动。',
    enabled: true,
    builtin: true,
    allowedSkills: ['skill-general-answer', 'skill-plan-work', 'skill-write-document'],
    allowedTools: [
      'list-files',
      'read-file',
      'search-files',
      'write-file',
      'apply-patch',
      'run-check',
      'search-knowledge',
    ],
    permissionMode: 'auto-read',
    memoryScope: 'workspace',
    runMode: 'foreground',
  }),
];

const defaultChannel = createChannel({
  name: '默认 OpenAI',
  provider: 'openai',
  model: 'gpt-4o',
  baseUrl: '',
  enabled: true,
  apiKeyStored: false,
  apiKeyStoredAt: 0,
});

const defaultSettings: AISettings = {
  forceReadOnlyMode: false,
  requireConfirmBeforeWrite: true,
  suggestDocuments: true,
  suggestTodos: true,
  suggestSchedules: true,
  suggestKnowledge: true,
  defaultOutputDirectory: 'Inbox',
  aiDocumentSavePath: '',
  aiDocumentVaultSubdir: '',
  saveDocumentsToCurrentVault: false,
  enableKnowledgeSnippetInjection: true,
  maxKnowledgeSnippets: 5,
  showKnowledgeSnippetPreview: true,
  autoExpandKnowledgeSnippetPreview: false,
  llmChannels: [defaultChannel],
  activeChannelId: defaultChannel.id,
};

const MIGRATION_KEY = 'workgaga_ai_channel_secret_migrated_v1';
const getRunTimeoutPolicy = (params: { intent: string; provider: AIModelProvider }) => {
  const intentTimeouts: Record<string, number> = {
    weather_query: 45000,
    realtime_query: 60000,
    web_research: 90000,
    url_reading: 60000,
    knowledge_lookup: 45000,
    code_understanding: 90000,
    code_modification: 180000,
    troubleshooting: 180000,
    document_generation: 120000,
  };
  const timeoutMs = Math.max(intentTimeouts[params.intent] ?? 120000, 180000);
  return {
    timeoutMs,
    reason: `运行超时策略：intent=${params.intent}, provider=${params.provider}, timeout=${Math.round(timeoutMs / 1000)}s`,
  };
};
const activeRunControllers = new Map<string, AbortController>();
const activeRunCancelReasons = new Map<string, 'user' | 'timeout'>();

const migrateLegacyChannelSecretKeys = (): void => {
  try {
    if (localStorage.getItem(MIGRATION_KEY)) return;

    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith('workgaga_ai_channel_') && !key.includes(':')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(MIGRATION_KEY, '1');
  } catch (error) {
    console.warn('迁移旧渠道 API Key 失败:', error);
  }
};

const loadState = (): Partial<AIAssistantState> => {
  migrateLegacyChannelSecretKeys();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('加载 AI 助手状态失败:', error);
    return {};
  }
};

const saveState = (state: AIAssistantState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('保存 AI 助手状态失败:', error);
  }
};

const findChannelById = (channels: LLModelChannel[], channelId?: string): LLModelChannel | null => {
  if (!channelId) return null;
  return channels.find((channel) => channel.id === channelId) ?? null;
};

const findEnabledChannelById = (channels: LLModelChannel[], channelId?: string): LLModelChannel | null => {
  if (!channelId) return null;
  return channels.find((channel) => channel.id === channelId && channel.enabled) ?? null;
};

const findFirstEnabledChannel = (channels: LLModelChannel[]): LLModelChannel | null =>
  channels.find((channel) => channel.enabled) ?? null;

const resolveActiveChannelFromSettings = (settings: AISettings): LLModelChannel | null =>
  findEnabledChannelById(settings.llmChannels, settings.activeChannelId) ??
  findFirstEnabledChannel(settings.llmChannels) ??
  findChannelById(settings.llmChannels, settings.activeChannelId) ??
  settings.llmChannels[0] ??
  null;

const resolveChannelForConversation = (
  settings: AISettings,
  conversation?: AIConversation | null,
  preferredChannelId?: string,
): LLModelChannel | null =>
  findEnabledChannelById(settings.llmChannels, preferredChannelId) ??
  findEnabledChannelById(settings.llmChannels, conversation?.channelId) ??
  findEnabledChannelById(settings.llmChannels, settings.activeChannelId) ??
  findFirstEnabledChannel(settings.llmChannels) ??
  findChannelById(settings.llmChannels, preferredChannelId) ??
  findChannelById(settings.llmChannels, conversation?.channelId) ??
  findChannelById(settings.llmChannels, settings.activeChannelId) ??
  settings.llmChannels[0] ??
  null;

const getEnvChannelApiKey = (): string | null => {
  try {
    const envKey = (
      import.meta as unknown as { env: Record<string, string | undefined> }
    ).env?.VITE_OPENAI_API_KEY?.trim();
    return envKey || null;
  } catch (error) {
    console.warn('读取环境 API Key 失败:', error);
    return null;
  }
};

const resolveChannelApiKey = async (channelId: string): Promise<string | null> =>
  (await getDecryptedChannelApiKey(channelId)) || getEnvChannelApiKey();

const getErrorMessage = (error: unknown, fallback = '发送失败，请稍后重试。'): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; error?: unknown; reason?: unknown };
    const value = [candidate.message, candidate.error, candidate.reason].find(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    if (value) return value;
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const inferCategory = (input: string): AICategory => {
  if (/计划|规划|项目|推进|安排|准备/.test(input)) return 'planning';
  if (/写|文档|方案|报告|纪要|总结|复盘/.test(input)) return 'writing';
  if (/整理|归档|分类|待办|行动项/.test(input)) return 'organizing';
  if (/分析|研究|比较|调研/.test(input)) return 'research';
  return 'general';
};

const inferOutputKinds = (input: string): AIOutputKind[] => {
  const kinds = new Set<AIOutputKind>();
  if (/写|文档|方案|报告|纪要|总结|复盘|保存|归档/.test(input)) kinds.add('document');
  if (/待办|行动项|任务|跟进|完成|准备/.test(input)) kinds.add('todo');
  if (/今天|明天|后天|周一|周二|周三|周四|周五|周六|周日|上午|下午|晚上|\d{1,2}[点:：]/.test(input))
    kinds.add('schedule');
  if (/知识|沉淀|长期|方法论|经验|原则/.test(input)) kinds.add('knowledge');
  return Array.from(kinds);
};

const buildPrompt = (params: {
  input: string;
  agent?: AIAgent;
  skills: AISkill[];
  category: AICategory;
  outputKinds: AIOutputKind[];
}): string => {
  const skillText = params.skills.map((skill) => `- ${skill.name}: ${skill.whenToUse}`).join('\n') || '- 通用回答';
  const outputText = params.outputKinds.length ? params.outputKinds.join(', ') : '无明确结构化产出，先直接回答';
  return `你是 workgaga 的万能 AI 助手。你直接面向用户，负责理解目标、选择能力、规划行动、汇总结果，并在合适时机建议产生文档、待办、日程或知识沉淀。

## 核心角色
- 用户目标是主线，不要把知识库、文档或日程当成默认主线。
- 能直接回答的问题直接回答，不要过度拆解。
- 复杂任务先规划，再等待用户确认后执行。
- 后台任务、未完成任务、外部 AI 尚未返回的内容，不得猜测结果。
- Worker、Skill、任务通知都是内部能力，面向用户时只总结必要信息。

## 能力选择规则
- 简单咨询：直接回答。
- 开放式分析：先列研究问题、事实、风险、未知项和下一步。
- 项目/事项推进：拆成研究、计划、执行、验证阶段。
- 写作/纪要/报告：生成结构化 Markdown，并建议自然归档位置。
- 出现行动信号：建议提取待办。
- 出现明确日期或时间：建议加入日程。
- 出现长期可复用结论、方法、原则、复盘：建议知识沉淀。

## 写入与确认规则
- 任何写入文档、创建待办、创建日程、加入知识库的动作，都必须先说明将要创建什么，再等待用户确认。
- 不要把所有结果默认放入知识库。只有长期价值内容才建议进入 Knowledge。
- 临时内容优先建议 Inbox；项目推进建议 Projects；会议内容建议 Meetings；复盘建议 Reviews；日程建议 Schedule；任务清单建议 Tasks。

## Prompt 编写规则
- 说明目标、上下文、约束、已知信息和输出格式。
- 不要只给命令式短句。
- 不要把理解责任转交给后续 Agent；你必须先完成理解和任务边界定义。
- 输出要可执行、可确认、可继续。

用户请求：
${params.input}

识别类型：${params.category}
建议使用 Agent：${params.agent?.name || '万能 AI'}
可用 Skill：
${skillText}

可能产出：${outputText}

请输出：
1. 对用户目标的理解
2. 建议行动计划
3. 是否需要生成文档、待办、日程或知识沉淀
4. 如果需要，给出建议保存位置或结构
5. 明确哪些动作需要用户确认后才能执行`;
};

const resolveSkillsForSend = (params: {
  userSelectedSkillIds: string[];
  allSkills: AISkill[];
  agent?: AIAgent;
  category: AICategory;
  outputKinds: AIOutputKind[];
  userInput: string;
}): AISkill[] => {
  const { userSelectedSkillIds, allSkills, agent, category, outputKinds, userInput } = params;

  const enabled = allSkills.filter((s) => s.enabled);
  const agentSkillSet = new Set(agent?.allowedSkills ?? []);

  const userSelected = enabled.filter((s) => userSelectedSkillIds.includes(s.id));

  const autoSelected = enabled
    .filter((s) => {
      if (userSelectedSkillIds.includes(s.id)) return false;
      if (agent && agentSkillSet.size > 0 && !agentSkillSet.has(s.id)) return false;
      return scoreSkillForSend({ skill: s, category, outputKinds, userInput }) > 0;
    })
    .sort(
      (left, right) =>
        scoreSkillForSend({ skill: right, category, outputKinds, userInput }) -
          scoreSkillForSend({ skill: left, category, outputKinds, userInput }) ||
        Number(right.updatedAt) - Number(left.updatedAt),
    );

  const merged = new Map<string, AISkill>();
  for (const skill of userSelected) merged.set(skill.id, skill);
  for (const skill of autoSelected) {
    if (merged.size >= 5) break;
    merged.set(skill.id, skill);
  }
  if (merged.size === 0) {
    const fallback = enabled.find((s) => s.id === 'skill-general-answer') || enabled[0];
    if (fallback) merged.set(fallback.id, fallback);
  }
  return Array.from(merged.values());
};

const buildRunPrompt = (params: {
  agent?: AIAgent;
  skills: AISkill[];
  contextSnapshot?: AIContextSnapshot;
  conversationSummary?: string;
  userInput: string;
}): { system: string; user: string } => {
  const { agent, skills, contextSnapshot, conversationSummary, userInput } = params;

  const sections: string[] = [];

  const agentPrompt =
    agent?.systemPrompt ||
    '你是 workgaga 的万能 AI 助手。用户目标是主线，先理解目标，再判断是否需要计划、文档、待办、日程或知识沉淀。';
  sections.push(agentPrompt);

  if (skills.length > 0) {
    const skillBlock = skills.map((s) => `- [${s.name}] ${s.whenToUse}\n  能力指令：${s.promptTemplate}`).join('\n');
    sections.push(`## 当前可用能力\n${skillBlock}`);
  }

  const contextParts: string[] = [];
  if (contextSnapshot?.currentFileName) contextParts.push(`当前文件：${contextSnapshot.currentFileName}`);
  if (contextSnapshot?.vaultName)
    contextParts.push(`知识库：${contextSnapshot.vaultName}（${contextSnapshot.noteCount ?? 0} 篇）`);
  if (contextSnapshot?.category) contextParts.push(`任务类型：${contextSnapshot.category}`);
  if (contextSnapshot?.outputKinds && contextSnapshot.outputKinds.length > 0) {
    contextParts.push(`可能产出类型：${contextSnapshot.outputKinds.join(', ')}`);
  }
  if (contextParts.length > 0) {
    sections.push(`## 当前上下文\n${contextParts.join('\n')}`);
  }

  const snippets = contextSnapshot?.knowledgeSnippets ?? [];
  if (snippets.length > 0) {
    const snippetBlock = snippets
      .map((snippet, index) => {
        const source = snippet.path ? `（${snippet.path}）` : '';
        return `${index + 1}. ${snippet.title}${source}\n${snippet.content}`;
      })
      .join('\n\n');
    sections.push(
      `## 已检索到的知识库片段\n以下片段来自当前知识库，仅作为上下文参考；若与用户目标无关，不要强行使用。\n${snippetBlock}`,
    );
  }

  sections.push(`## 核心规则
- 用户目标是主线，不要把知识库、文档或日程当成默认主线。
- 能直接回答的问题直接回答，不要过度拆解。
- 复杂任务先规划，再等待用户确认后执行。
- 写入文档、创建待办、加入日程、知识沉淀等动作必须先说明再等待确认。
- 后台任务、未完成任务的结果不得猜测。`);

  if (conversationSummary) {
    sections.push(`## 对话历史摘要\n${conversationSummary}`);
  }

  const system = sections.join('\n\n');
  return { system, user: userInput };
};

const CONVERSATION_COMPRESS_THRESHOLD = 16;
const CONVERSATION_KEEP_RECENT = 8;

const buildConversationSummary = (messages: AIMessage[], maxChars = 600): string => {
  if (messages.length === 0) return '';
  const recent = messages.slice(-6);
  const lines = recent.map((m) => {
    const prefix = m.role === 'assistant' ? 'AI' : m.role === 'system' ? '系统' : '用户';
    const text = m.content.length > 120 ? `${m.content.slice(0, 120)}...` : m.content;
    return `${prefix}：${text}`;
  });
  const summary = lines.join('\n');
  return summary.length > maxChars ? summary.slice(0, maxChars) + '...' : summary;
};

const extractKeyPoints = (messages: AIMessage[]): string[] => {
  const points: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = msg.content.length > 100 ? `${msg.content.slice(0, 100)}...` : msg.content;
      points.push(`用户：${text}`);
    } else if (msg.role === 'assistant') {
      const content = msg.content;
      const lines = content.split('\n').filter((l) => l.trim());
      const important: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (/^#{1,4}\s/.test(trimmed)) {
          important.push(trimmed.replace(/^#+\s*/, ''));
        } else if (/^[-*]\s/.test(trimmed) && trimmed.length > 4) {
          important.push(trimmed);
        } else if (/结论|总结|建议|风险|关键|重要|方案|计划|行动|待办|日程|注意/.test(trimmed) && trimmed.length > 4) {
          important.push(trimmed);
        }
      }

      if (important.length > 0) {
        const topPoints = important.slice(0, 5);
        points.push(`AI 要点：${topPoints.join('；')}`);
      } else {
        const brief = content.length > 150 ? `${content.slice(0, 150)}...` : content;
        points.push(`AI：${brief}`);
      }
    }
  }

  return points;
};

const compressOldMessages = (messages: AIMessage[], cachedSummary?: string): string => {
  if (messages.length === 0) return '';

  if (cachedSummary) {
    return cachedSummary;
  }

  const keyPoints = extractKeyPoints(messages);
  const joined = keyPoints.join('\n');

  if (joined.length > 1000) {
    const firstUser = messages.find((m) => m.role === 'user');
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const userTopics = messages
      .filter((m) => m.role === 'user')
      .slice(0, 3)
      .map((m) => m.content.slice(0, 60))
      .join('、');
    const parts: string[] = [];
    if (userTopics) {
      parts.push(`讨论主题：${userTopics}`);
    }
    if (firstUser) {
      parts.push(`用户最初提问：${firstUser.content.slice(0, 100)}${firstUser.content.length > 100 ? '...' : ''}`);
    }

    const assistantKeyPoints = extractKeyPoints(messages.filter((m) => m.role === 'assistant'));
    if (assistantKeyPoints.length > 0) {
      parts.push(`AI 关键回复：\n${assistantKeyPoints.slice(0, 3).join('\n')}`);
    }

    if (lastAssistant) {
      parts.push(
        `AI 最后回复摘要：${lastAssistant.content.slice(0, 200)}${lastAssistant.content.length > 200 ? '...' : ''}`,
      );
    }
    parts.push(`（共 ${messages.length} 条消息已智能压缩）`);
    return parts.join('\n');
  }

  return joined;
};

const MIN_LOCAL_SUMMARY_LENGTH = 80;

const buildLocalStructuredSummary = (messages: AIMessage[]): string => {
  if (messages.length === 0) return '';

  const userTopics: string[] = [];
  const keyConclusions: string[] = [];
  const actionItems: string[] = [];
  const importantFacts: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const brief = msg.content.length > 80 ? `${msg.content.slice(0, 80)}...` : msg.content;
      if (brief.trim()) userTopics.push(brief);
    } else if (msg.role === 'assistant') {
      const lines = msg.content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 4) continue;

        if (/^#{1,4}\s/.test(trimmed)) {
          keyConclusions.push(trimmed.replace(/^#+\s*/, ''));
        } else if (/结论|总结|建议|方案|关键|重要|核心/.test(trimmed)) {
          keyConclusions.push(trimmed.length > 100 ? `${trimmed.slice(0, 100)}...` : trimmed);
        } else if (/需要|完成|准备|跟进|安排|处理|确认|检查|TODO|待办/.test(trimmed) && /^[-*]\s/.test(trimmed)) {
          actionItems.push(trimmed);
        } else if (/日期|时间|数量|版本|比例|百分比|\d+%|\d{4}[-/]\d/.test(trimmed) && trimmed.length > 6) {
          importantFacts.push(trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed);
        }
      }
    }
  }

  const sections: string[] = [];

  if (userTopics.length > 0) {
    const uniqueTopics = [...new Set(userTopics.slice(0, 3))];
    sections.push(`讨论主题：${uniqueTopics.join('；')}`);
  }

  if (keyConclusions.length > 0) {
    sections.push(
      `关键结论：\n${keyConclusions
        .slice(0, 5)
        .map((c) => `- ${c}`)
        .join('\n')}`,
    );
  }

  if (actionItems.length > 0) {
    sections.push(
      `行动项：\n${actionItems
        .slice(0, 5)
        .map((a) => `- ${a}`)
        .join('\n')}`,
    );
  }

  if (importantFacts.length > 0) {
    sections.push(`关键数据：${importantFacts.slice(0, 3).join('；')}`);
  }

  if (sections.length === 0) {
    const firstUser = messages.find((m) => m.role === 'user');
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (firstUser) sections.push(`用户问题：${firstUser.content.slice(0, 100)}`);
    if (lastAssistant) sections.push(`AI 回复摘要：${lastAssistant.content.slice(0, 200)}`);
    sections.push(`（共 ${messages.length} 条消息，本地自动摘要）`);
  }

  const result = sections.join('\n');
  return result.length > 600 ? `${result.slice(0, 600)}...` : result;
};

const SKILL_AUTO_MATCH_STOP_WORDS = new Set([
  '用户',
  '使用',
  '用于',
  '需要',
  '可以',
  '时候',
  '情况',
  '相关',
  '一个',
  '这个',
  '进行',
  '以及',
  '如果',
  '时候',
  'invoke',
  'when',
  'user',
  'asks',
  'ask',
  'with',
  'that',
  'this',
  'from',
  'into',
]);

const extractSkillKeywords = (skill: AISkill): string[] => {
  const text = `${skill.name} ${skill.whenToUse} ${skill.promptTemplate}`;
  const matches = text.match(/[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_-]{1,}/g) ?? [];
  return Array.from(
    new Set(
      matches
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 2 && !SKILL_AUTO_MATCH_STOP_WORDS.has(item)),
    ),
  ).slice(0, 24);
};

const scoreSkillForSend = (params: {
  skill: AISkill;
  category: AICategory;
  outputKinds: AIOutputKind[];
  userInput: string;
}): number => {
  const { skill, category, outputKinds, userInput } = params;
  let score = 0;
  const normalizedInput = userInput.trim().toLowerCase();

  if (category !== 'general' && skill.category === category) score += 5;
  if (skill.id === 'skill-general-answer') score += 1;
  if (category === 'writing' && skill.id === 'skill-write-document') score += 4;
  if (category === 'planning' && skill.id === 'skill-plan-work') score += 4;

  if (
    outputKinds.some((kind) => {
      if (kind === 'document') return skill.outputPolicy.mayCreateDocument;
      if (kind === 'todo') return skill.outputPolicy.mayCreateTodo;
      if (kind === 'schedule') return skill.outputPolicy.mayCreateSchedule;
      return skill.outputPolicy.mayUpdateKnowledgeBase;
    })
  ) {
    score += 3;
  }

  const keywordMatches = extractSkillKeywords(skill).filter((keyword) => normalizedInput.includes(keyword)).length;
  score += Math.min(4, keywordMatches);

  return score;
};

const buildCompressedRequestMessages = (
  history: AIMessage[],
  systemPrompt: string,
  cachedSummary?: string,
): { role: string; content: string }[] => {
  const messages: { role: string; content: string }[] = [];

  if (history.length > CONVERSATION_COMPRESS_THRESHOLD) {
    const olderMessages = history.slice(0, history.length - CONVERSATION_KEEP_RECENT);
    const recentMessages = history.slice(history.length - CONVERSATION_KEEP_RECENT);

    const compressedSummary = compressOldMessages(olderMessages, cachedSummary);

    messages.push({ role: 'system', content: systemPrompt });
    if (compressedSummary) {
      const sourceLabel =
        cachedSummary && cachedSummary.length > MIN_LOCAL_SUMMARY_LENGTH ? 'LLM 智能摘要' : '本地结构化摘要';
      messages.push({
        role: 'system',
        content: `## 早期对话摘要（${sourceLabel}，共 ${olderMessages.length} 条）\n${compressedSummary}`,
      });
    }
    for (const msg of recentMessages) {
      messages.push({
        role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  } else {
    messages.push({ role: 'system', content: systemPrompt });
    for (const msg of history) {
      messages.push({
        role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  }

  return messages;
};

export const useAIAssistantStore = defineStore('aiAssistant', {
  state: (): AIAssistantState => {
    const saved = loadState();
    return {
      tasks: saved.tasks || [],
      skills: saved.skills || builtinSkills,
      agents: saved.agents || builtinAgents,
      settings: { ...defaultSettings, ...(saved.settings || {}) },
      channelTestResults: saved.channelTestResults || {},
      channelTestHistory: saved.channelTestHistory || {},
      conversations: saved.conversations || {},
      messages: saved.messages || {},
      taskRuns: saved.taskRuns || [],
      artifacts: saved.artifacts || {},
      installedSkillPlugins: saved.installedSkillPlugins || {},
      installedAgentPlugins: saved.installedAgentPlugins || {},
      pendingPermissionRequests: (saved.pendingPermissionRequests || []).filter((request) => !request.resolvedAt),
      pendingClarifications: (saved.pendingClarifications || []).filter((request) => !request.resolvedAt),
      changePlans: saved.changePlans || [],
      activeRunIds: [],
      conversationSummaries: saved.conversationSummaries || {},
      summaryGenerating: saved.summaryGenerating || {},
    };
  },

  getters: {
    enabledChannels: (state) => state.settings.llmChannels.filter((channel) => channel.enabled),
    activeChannel: (state) => resolveActiveChannelFromSettings(state.settings),
    conversationMessages: (state) => (conversationId: string) =>
      Object.values(state.messages)
        .filter((message) => message.conversationId === conversationId)
        .sort((left, right) => left.createdAt - right.createdAt),
    taskArtifacts: (state) => (conversationId?: string) => {
      if (!conversationId) return [];
      return Object.values(state.artifacts)
        .filter((artifact) => artifact.conversationId === conversationId)
        .sort((left, right) => right.createdAt - left.createdAt);
    },
    channelHistory: (state) => (channelId: string) => state.channelTestHistory[channelId]?.slice(0, 5) ?? [],
    enabledSkills: (state) => state.skills.filter((skill) => skill.enabled),
    enabledAgents: (state) => state.agents.filter((agent) => agent.enabled),
    sortedTasks: (state) =>
      state.tasks.slice().sort((a, b) => {
        const order: Record<AITaskStatus, number> = { running: 0, pending: 1, failed: 2, completed: 3, cancelled: 4 };
        return order[a.status] - order[b.status] || b.updatedAt - a.updatedAt;
      }),
    taskCounts: (state) => ({
      total: state.tasks.length,
      pending: state.tasks.filter((task) => task.status === 'pending').length,
      running: state.tasks.filter((task) => task.status === 'running').length,
      completed: state.tasks.filter((task) => task.status === 'completed').length,
      failed: state.tasks.filter((task) => task.status === 'failed').length,
    }),
  },

  actions: {
    persist() {
      saveState(this.$state);
    },

    enqueuePermissionRequest(request: Omit<AIPendingPermissionRequest, 'id' | 'createdAt'>) {
      const item: AIPendingPermissionRequest = {
        ...request,
        id: createId('permission'),
        createdAt: now(),
      };
      this.pendingPermissionRequests = [
        item,
        ...this.pendingPermissionRequests.filter((existing) => !existing.resolvedAt),
      ].slice(0, 20);
      this.persist();
      return item;
    },

    resolvePermissionRequest(id: string, decision: AIPendingPermissionRequest['decision']) {
      this.pendingPermissionRequests = this.pendingPermissionRequests.map((request) =>
        request.id === id ? { ...request, decision, resolvedAt: now() } : request,
      );
      this.persist();
    },

    clearResolvedPermissionRequests() {
      this.pendingPermissionRequests = this.pendingPermissionRequests.filter((request) => !request.resolvedAt);
      this.persist();
    },

    enqueueClarificationRequest(request: Omit<AIPendingClarificationRequest, 'id' | 'createdAt'>) {
      const item: AIPendingClarificationRequest = {
        ...request,
        id: createId('clarification'),
        createdAt: now(),
      };
      this.pendingClarifications = [
        item,
        ...this.pendingClarifications.filter((existing) => !existing.resolvedAt),
      ].slice(0, 20);
      this.persist();
      return item;
    },

    resolveClarificationsForConversation(conversationId: string, response: string) {
      let resolved: AIPendingClarificationRequest[] = [];
      this.pendingClarifications = this.pendingClarifications.map((request) => {
        if (request.conversationId !== conversationId || request.resolvedAt) return request;
        const next = { ...request, response, resolvedAt: now() };
        resolved = [...resolved, next];
        return next;
      });
      this.persist();
      return resolved;
    },

    registerTaskRun(taskRun: AIRuntimeTaskRun) {
      this.taskRuns = [taskRun, ...this.taskRuns.filter((item) => item.id !== taskRun.id)].slice(0, 50);
      this.persist();
      return taskRun;
    },

    updateTaskRun(taskRunId: string, patch: Partial<AIRuntimeTaskRun>) {
      this.taskRuns = this.taskRuns.map((taskRun) =>
        taskRun.id === taskRunId ? { ...taskRun, ...patch, updatedAt: now() } : taskRun,
      );
      this.persist();
    },

    registerChangePlan(plan: Omit<AIApprovedChangePlan, 'createdAt' | 'approved'>) {
      const existing = this.changePlans.find((item) => item.id === plan.id);
      const item: AIApprovedChangePlan = {
        ...plan,
        approved: existing?.approved ?? false,
        writePreview: plan.writePreview ?? existing?.writePreview,
        createdAt: existing?.createdAt ?? now(),
        approvedAt: existing?.approvedAt,
      };
      this.changePlans = [item, ...this.changePlans.filter((existingPlan) => existingPlan.id !== item.id)].slice(0, 20);
      this.persist();
      return item;
    },

    approveChangePlan(planId: string) {
      this.changePlans = this.changePlans.map((plan) =>
        plan.id === planId ? { ...plan, approved: true, approvedAt: now() } : plan,
      );
      this.persist();
    },

    cancelRun(runId: string) {
      activeRunCancelReasons.set(runId, 'user');
      activeRunControllers.get(runId)?.abort();
      activeRunControllers.delete(runId);
      this.activeRunIds = this.activeRunIds.filter((id) => id !== runId);
    },

    cancelAllRuns() {
      activeRunControllers.forEach((controller, runId) => {
        activeRunCancelReasons.set(runId, 'user');
        controller.abort();
      });
      activeRunControllers.clear();
      this.activeRunIds = [];
    },

    createTask(userInput: string) {
      const category = inferCategory(userInput);
      const outputKinds = inferOutputKinds(userInput);
      const activeChannel = resolveActiveChannelFromSettings(this.settings);
      const agent = this.enabledAgents.find((item) => item.id === 'agent-universal') || this.enabledAgents[0];
      const skills = resolveSkillsForSend({
        userSelectedSkillIds: [],
        allSkills: this.skills,
        agent,
        category,
        outputKinds,
        userInput,
      }).slice(0, 5);
      const task: AITask = {
        id: createId('task'),
        title: userInput.slice(0, 28) || '新的 AI 任务',
        userInput,
        status: 'pending',
        category,
        agentId: agent?.id,
        skillIds: skills.map((skill) => skill.id),
        prompt: buildPrompt({ input: userInput, agent, skills, category, outputKinds }),
        progressText: '已创建任务，等待用户确认或复制 Prompt 执行。',
        result: '',
        outputKinds,
        outputFiles: [],
        createdAt: now(),
        updatedAt: now(),
      };

      const conversation = this.createConversation({
        taskId: task.id,
        title: task.title,
        channelId: activeChannel?.id,
        provider: activeChannel?.provider,
        model: activeChannel?.model,
      });

      task.conversationId = conversation.id;

      this.appendMessage({
        conversationId: conversation.id,
        role: 'user',
        content: userInput,
        status: 'completed',
      });

      this.tasks.unshift(task);
      if (agent) agent.usageCount += 1;
      this.persist();
      return task;
    },

    async sendPromptDirect(userInput: string, options: AISendOptions = {}, contextSnapshot?: AIContextSnapshot) {
      const trimmed = userInput.trim();
      if (!trimmed) return null;

      const category = contextSnapshot?.category ?? inferCategory(trimmed);
      const outputKinds = contextSnapshot?.outputKinds ?? inferOutputKinds(trimmed);
      const activeChannel = resolveChannelForConversation(this.settings, null, options.channelId);

      const agent = options.agentId
        ? this.agents.find((a) => a.id === options.agentId && a.enabled)
        : this.enabledAgents.find((a) => a.id === 'agent-universal') || this.enabledAgents[0];

      const resolvedSkills = resolveSkillsForSend({
        userSelectedSkillIds: options.userSelectedSkillIds ?? [],
        allSkills: this.skills,
        agent,
        category,
        outputKinds,
        userInput: trimmed,
      });

      const task: AITask = {
        id: createId('task'),
        title: trimmed.slice(0, 28) || '新的 AI 任务',
        userInput: trimmed,
        status: 'pending',
        category,
        agentId: agent?.id,
        skillIds: resolvedSkills.map((s) => s.id),
        prompt: '',
        progressText: '正在发送请求...',
        result: '',
        outputKinds,
        outputFiles: [],
        createdAt: now(),
        updatedAt: now(),
      };

      const conversation = this.createConversation({
        taskId: task.id,
        title: task.title,
        channelId: activeChannel?.id,
        provider: activeChannel?.provider,
        model: activeChannel?.model,
      });

      task.conversationId = conversation.id;
      this.tasks.unshift(task);
      if (agent) agent.usageCount += 1;
      this.persist();

      await this.sendConversationMessage(conversation.id, trimmed, {
        agentId: agent?.id,
        channelId: activeChannel?.id,
        userSelectedSkillIds: resolvedSkills.map((s) => s.id),
        contextSnapshot,
      });

      return task;
    },

    updateTask(id: string, patch: Partial<AITask>) {
      const task = this.tasks.find((item) => item.id === id);
      if (!task) return;
      Object.assign(task, patch, { updatedAt: now() });
      this.persist();
    },

    deleteTask(id: string) {
      this.tasks = this.tasks.filter((task) => task.id !== id);
      this.persist();
    },

    createConversation(
      payload: Omit<AIConversation, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { status?: AIConversationStatus },
    ) {
      const conversation: AIConversation = {
        ...payload,
        id: createId('conversation'),
        title: payload.title || '新的 AI 对话',
        status: payload.status ?? 'active',
        createdAt: now(),
        updatedAt: now(),
      };

      this.conversations = {
        ...this.conversations,
        [conversation.id]: conversation,
      };

      this.persist();
      return conversation;
    },

    updateConversation(id: string, patch: Partial<AIConversation>) {
      const conversation = this.conversations[id];
      if (!conversation) return;

      this.conversations = {
        ...this.conversations,
        [id]: {
          ...conversation,
          ...patch,
          updatedAt: now(),
        },
      };

      this.persist();
    },

    appendMessage(payload: Omit<AIMessage, 'id' | 'createdAt' | 'updatedAt'>) {
      const message: AIMessage = {
        ...payload,
        id: createId('message'),
        status: payload.status ?? 'completed',
        createdAt: now(),
        updatedAt: now(),
      };

      this.messages = {
        ...this.messages,
        [message.id]: message,
      };

      const conversation = this.conversations[message.conversationId];
      if (conversation) {
        this.conversations = {
          ...this.conversations,
          [conversation.id]: {
            ...conversation,
            lastMessageAt: message.createdAt,
            updatedAt: message.createdAt,
          },
        };
      }

      const task = this.tasks.find((item) => item.conversationId === message.conversationId);
      if (task) {
        task.lastMessageAt = message.createdAt;
        task.updatedAt = message.createdAt;
      }

      this.persist();
      appendAITranscriptRecord(uiMessageToTranscriptRecord(message)).catch((error: unknown) => {
        console.warn('写入 AI transcript 失败:', error);
      });
      return message;
    },

    async restoreConversationTranscript(conversationId: string) {
      const records = await readAITranscript(conversationId);
      let restored = 0;

      records.forEach((record) => {
        if (this.messages[record.id]) return;
        this.messages = {
          ...this.messages,
          [record.id]: {
            id: record.id,
            conversationId: record.conversationId,
            role: record.role,
            content: record.content,
            status: record.status === 'failed' ? 'failed' : record.status === 'streaming' ? 'streaming' : 'completed',
            createdAt: record.createdAt,
            updatedAt: record.createdAt,
          },
        };
        restored += 1;
      });

      if (restored > 0) this.persist();
      return { restored, total: records.length };
    },

    addArtifact(payload: Omit<AIArtifact, 'id' | 'createdAt'>) {
      const artifact: AIArtifact = {
        ...payload,
        id: createId('artifact'),
        createdAt: now(),
      };

      this.artifacts = {
        ...this.artifacts,
        [artifact.id]: artifact,
      };

      this.persist();
      return artifact;
    },

    removeArtifact(id: string) {
      const { [id]: _removed, ...rest } = this.artifacts;
      this.artifacts = rest;
      this.persist();
    },

    autoSuggestArtifacts(conversationId: string) {
      const conversation = this.conversations[conversationId];
      if (!conversation) return;

      const task = this.tasks.find((item) => item.conversationId === conversationId);
      if (!task || task.status !== 'completed') return;

      const messages = this.conversationMessages(conversationId);
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.status === 'completed');
      if (!lastAssistant || !lastAssistant.content.trim()) return;

      const existingArtifacts = Object.values(this.artifacts).filter((a) => a.conversationId === conversationId);
      const existingTypes = new Set(existingArtifacts.map((a) => a.type));

      const suggestions: Omit<AIArtifact, 'id' | 'createdAt'>[] = [];

      const content = lastAssistant.content;
      const hasDocumentSignal =
        /方案|报告|纪要|总结|复盘|文档|结构|框架|模板|范文/.test(content) || task.outputKinds.includes('document');
      const hasTodoSignal =
        /待办|行动项|任务|跟进|完成|准备|TODO|checklist|清单/.test(content) || task.outputKinds.includes('todo');
      const hasScheduleSignal =
        /时间|日程|日期|会议|下周|明天|今天|deadline|截止|安排/.test(content) || task.outputKinds.includes('schedule');
      const hasKnowledgeSignal =
        /方法|原则|经验|规律|模式|最佳实践|总结|复盘|教训|心得/.test(content) || task.outputKinds.includes('knowledge');

      if (hasDocumentSignal && !existingTypes.has('document')) {
        const title = task.category === 'writing' ? `文档草稿：${task.title}` : `文档建议：${task.title}`;
        suggestions.push({
          conversationId,
          type: 'document',
          title,
          summary:
            task.category === 'writing'
              ? 'AI 生成的内容已具备文档结构，可一键保存为 Markdown 文档。'
              : '对话中包含可沉淀的正式内容，建议整理为文档归档。',
        });
      }

      if (hasTodoSignal && !existingTypes.has('todo')) {
        suggestions.push({
          conversationId,
          type: 'todo',
          title: `待办提取：${task.title}`,
          summary:
            task.category === 'organizing'
              ? '识别到明确的行动项和负责人信息，可一键提取为待办任务。'
              : '对话中包含需要跟进的行动项，建议提取为待办。',
        });
      }

      if (hasScheduleSignal && !existingTypes.has('schedule')) {
        suggestions.push({
          conversationId,
          type: 'schedule',
          title: `日程建议：${task.title}`,
          summary: '识别到时间相关信息，建议添加到日程以便提醒和追踪。',
        });
      }

      if (hasKnowledgeSignal && !existingTypes.has('knowledge')) {
        suggestions.push({
          conversationId,
          type: 'knowledge',
          title: `知识沉淀：${task.title}`,
          summary:
            task.category === 'research'
              ? '研究结论具有长期复用价值，建议沉淀到知识库。'
              : '对话中包含可复用的经验或方法论，建议沉淀到知识库。',
        });
      }

      if (suggestions.length === 0 && !existingTypes.has('document') && content.length > 200) {
        suggestions.push({
          conversationId,
          type: 'document',
          title: `内容存档：${task.title}`,
          summary: 'AI 回复内容较长，建议保存为文档以备后续查阅。',
        });
      }

      for (const suggestion of suggestions) {
        this.addArtifact(suggestion);
      }

      return suggestions;
    },

    async loadLocalPlugins() {
      const result = await loadInstalledPluginManifests();

      const skillRecords: Record<string, AIInstalledPluginRecord> = {};
      for (const manifest of result.skills) {
        skillRecords[manifest.id] = {
          id: manifest.id,
          kind: manifest.kind,
          name: manifest.name,
          version: manifest.version,
          sourceType: manifest.sourceType,
          sourceUrl: manifest.sourceUrl,
          installedAt: this.installedSkillPlugins[manifest.id]?.installedAt ?? Date.now(),
          updatedAt: Date.now(),
        };
      }

      const agentRecords: Record<string, AIInstalledPluginRecord> = {};
      for (const manifest of result.agents) {
        agentRecords[manifest.id] = {
          id: manifest.id,
          kind: manifest.kind,
          name: manifest.name,
          version: manifest.version,
          sourceType: manifest.sourceType,
          sourceUrl: manifest.sourceUrl,
          installedAt: this.installedAgentPlugins[manifest.id]?.installedAt ?? Date.now(),
          updatedAt: Date.now(),
        };
      }

      this.installedSkillPlugins = skillRecords;
      this.installedAgentPlugins = agentRecords;
      this.persist();

      return result;
    },

    async installPluginFromGitHub(url: string) {
      const trimmed = url.trim();
      if (!trimmed) throw new Error('请输入 GitHub 插件地址。');

      const { manifest, record } = await installPluginFromGitHubUrl(trimmed);

      if (manifest.kind === 'skill') {
        this.installedSkillPlugins = {
          ...this.installedSkillPlugins,
          [manifest.id]: record,
        };
      } else {
        this.installedAgentPlugins = {
          ...this.installedAgentPlugins,
          [manifest.id]: record,
        };
      }

      this.persist();
      return manifest;
    },

    async installPluginFromSkillHub(url: string) {
      const trimmed = url.trim();
      if (!trimmed) throw new Error('请输入 SkillHub 插件地址。');

      const { manifest, record } = await installPluginFromSkillHubUrl(trimmed);

      if (manifest.kind === 'skill') {
        this.installedSkillPlugins = {
          ...this.installedSkillPlugins,
          [manifest.id]: record,
        };
      } else {
        this.installedAgentPlugins = {
          ...this.installedAgentPlugins,
          [manifest.id]: record,
        };
      }

      this.persist();
      return manifest;
    },

    async uninstallPlugin(id: string) {
      if (this.installedSkillPlugins[id]) {
        const { [id]: _removed, ...rest } = this.installedSkillPlugins;
        this.installedSkillPlugins = rest;
        await uninstallPluginDir('skill', id);
        this.persist();
        return 'skill';
      }

      if (this.installedAgentPlugins[id]) {
        const { [id]: _removed, ...rest } = this.installedAgentPlugins;
        this.installedAgentPlugins = rest;
        await uninstallPluginDir('agent', id);
        this.persist();
        return 'agent';
      }

      return null;
    },

    async sendConversationMessage(conversationId: string, content: string, sendOptions?: AISendOptions) {
      const conversation = this.conversations[conversationId];
      if (!conversation) {
        throw new Error('未找到目标对话，请刷新后重试。');
      }

      const trimmed = content.trim();
      if (!trimmed) return null;

      const channel = resolveChannelForConversation(this.settings, conversation, sendOptions?.channelId);
      if (!channel) {
        throw new Error('当前没有可用的模型渠道，请先在设置中配置并启用一个渠道。');
      }

      if (!channel.model.trim()) {
        throw new Error('当前默认渠道未填写模型名称，请先在设置中补充模型。');
      }

      this.appendMessage({
        conversationId,
        role: 'user',
        content: trimmed,
        status: 'completed',
      });

      const earlyFeatureFlags = getAIAgentFeatureFlags();
      const resolvedClarifications = earlyFeatureFlags.clarificationLoopEnabled
        ? this.resolveClarificationsForConversation(conversationId, trimmed)
        : [];
      const clarificationContextPrompt = resolvedClarifications.length
        ? [
            '# User clarification received',
            ...resolvedClarifications.map((item) =>
              [`Questions: ${item.questions.join('；')}`, `User response: ${item.response || trimmed}`].join('\n'),
            ),
          ].join('\n\n')
        : '';
      const effectiveTaskInput = resolvedClarifications.length
        ? [
            '用户正在补充上一轮任务所需上下文，请结合原任务和以下补充继续完成：',
            ...resolvedClarifications.flatMap((item) => [
              `待补充问题：${item.questions.join('；')}`,
              `用户补充：${item.response || trimmed}`,
            ]),
            `本轮输入：${trimmed}`,
          ].join('\n')
        : trimmed;

      const assistantMessage = this.appendMessage({
        conversationId,
        role: 'assistant',
        content: '',
        status: 'sending',
      });

      const runId = assistantMessage.id;
      const runController = new AbortController();
      activeRunControllers.set(runId, runController);
      this.activeRunIds = Array.from(new Set([...this.activeRunIds, runId]));

      this.conversations = {
        ...this.conversations,
        [conversationId]: {
          ...this.conversations[conversationId],
          status: 'active',
          channelId: channel.id,
          provider: channel.provider,
          model: channel.model,
          updatedAt: now(),
        },
      };

      const task = this.tasks.find((item) => item.conversationId === conversationId);
      if (task) {
        task.status = 'running';
        task.progressText = '正在与 AI 对话，等待回复中...';
        task.updatedAt = now();
      }

      this.persist();

      let timeoutTimer: number | undefined;
      let timeoutReason = '';

      try {
        const apiKey = await resolveChannelApiKey(channel.id);

        if (!apiKey) {
          throw new Error('当前渠道未配置 API Key。');
        }

        const history = this.conversationMessages(conversationId).filter(
          (message) => message.id !== assistantMessage.id,
        );

        let requestMessages: { role: string; content: string }[];
        let resolvedAgent: AIAgent | undefined;
        let resolvedRuntimeSkills: AISkill[] = [];

        if (sendOptions) {
          const agent = sendOptions.agentId
            ? this.agents.find((a) => a.id === sendOptions.agentId)
            : task?.agentId
              ? this.agents.find((a) => a.id === task.agentId)
              : undefined;
          resolvedAgent = agent;

          const category = sendOptions.contextSnapshot?.category ?? (task ? task.category : inferCategory(trimmed));
          const outputKinds =
            sendOptions.contextSnapshot?.outputKinds ?? (task ? task.outputKinds : inferOutputKinds(trimmed));

          const resolvedSkills = resolveSkillsForSend({
            userSelectedSkillIds: sendOptions.userSelectedSkillIds ?? task?.skillIds ?? [],
            allSkills: this.skills,
            agent,
            category,
            outputKinds,
            userInput: trimmed,
          });
          resolvedRuntimeSkills = resolvedSkills;

          const conversationSummary = buildConversationSummary(history);

          const { system } = buildRunPrompt({
            agent,
            skills: resolvedSkills,
            contextSnapshot: sendOptions.contextSnapshot,
            conversationSummary,
            userInput: trimmed,
          });

          requestMessages = buildCompressedRequestMessages(history, system, this.conversationSummaries[conversationId]);
        } else {
          resolvedAgent = task?.agentId ? this.agents.find((a) => a.id === task.agentId) : undefined;
          resolvedRuntimeSkills = resolveSkillsForSend({
            userSelectedSkillIds: task?.skillIds ?? [],
            allSkills: this.skills,
            agent: resolvedAgent,
            category: task?.category ?? inferCategory(trimmed),
            outputKinds: task?.outputKinds ?? inferOutputKinds(trimmed),
            userInput: trimmed,
          });
          requestMessages = history.map((message) => ({
            role: message.role === 'system' ? 'system' : message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content,
          }));
        }

        const provider = channel.provider;
        const model = channel.model;
        const providerToolStrategy = getProviderToolStrategy(provider);
        const canUseStreaming = providerToolStrategy.supportsStreaming;

        const applyAssistantContent = (content: string, status: AIMessageStatus) => {
          this.messages = {
            ...this.messages,
            [assistantMessage.id]: {
              ...this.messages[assistantMessage.id],
              content,
              status,
              updatedAt: now(),
            },
          };
        };

        const appendAssistantToolEvent = (event: Omit<AIMessageToolEvent, 'id' | 'createdAt'>): void => {
          const current = this.messages[assistantMessage.id];
          if (!current) return;
          this.messages = {
            ...this.messages,
            [assistantMessage.id]: {
              ...current,
              toolEvents: [...(current.toolEvents ?? []), { ...event, id: createId('tool-event'), createdAt: now() }],
              updatedAt: now(),
            },
          };
        };

        const appendTimelineStep = (step: Omit<AIRunTimelineStep, 'id' | 'createdAt'>): void => {
          const current = this.messages[assistantMessage.id];
          if (!current) return;
          this.messages = {
            ...this.messages,
            [assistantMessage.id]: {
              ...current,
              timeline: [...(current.timeline ?? []), { ...step, id: createId('timeline'), createdAt: now() }],
              updatedAt: now(),
            },
          };
        };

        if (resolvedRuntimeSkills.length > 0) {
          appendTimelineStep({
            type: 'policy_selected',
            title: '自动启用 Skill',
            detail: resolvedRuntimeSkills.map((skill) => skill.name).join(', '),
            status: 'completed',
          });
        }

        applyAssistantContent('', 'streaming');

        const builtinToolNames = builtinAITools.map((tool) => tool.name);
        const runtimeTools = resolveRuntimeTools({
          agent: resolvedAgent,
          skills: resolvedRuntimeSkills,
          builtinToolNames,
        });
        const aiAgentFeatureFlags = earlyFeatureFlags;
        const intentDetection = detectAIProblemIntent(effectiveTaskInput);
        const taskProfile = aiAgentFeatureFlags.taskProfileEnabled
          ? buildAITaskProfile(effectiveTaskInput, intentDetection)
          : undefined;
        const taskCompletionCriteria = taskProfile ? buildAITaskCompletionCriteria(taskProfile) : undefined;
        const evidencePlan =
          taskProfile && taskCompletionCriteria && aiAgentFeatureFlags.evidencePlanEnabled
            ? buildAIEvidencePlan(taskProfile, taskCompletionCriteria)
            : undefined;
        const taskProfilePrompt = taskProfile ? formatAITaskProfilePrompt(taskProfile) : '';
        const taskCompletionCriteriaPrompt = taskCompletionCriteria
          ? formatAITaskCompletionCriteriaPrompt(taskCompletionCriteria)
          : '';
        const evidencePlanPrompt = evidencePlan ? formatAIEvidencePlanPrompt(evidencePlan) : '';
        const runtimeWorkspace = await resolveAIRuntimeWorkspace({
          vaultPath: sendOptions?.contextSnapshot?.vaultPath,
        });
        if (runtimeWorkspace.outputDirectoryFallback) {
          appendTimelineStep({
            type: 'policy_selected',
            title: '工作目录产物目录降级',
            detail: `无法写入工作目录 .workgaga，产物将保存到：${runtimeWorkspace.outputDirectory}`,
            status: 'completed',
          });
        }
        const shouldAutoRouteToAgent =
          aiAgentFeatureFlags.enabled &&
          aiAgentFeatureFlags.autoRouteEnabled &&
          ['code_understanding', 'code_modification', 'troubleshooting'].includes(intentDetection.intent);
        appendTimelineStep({
          type: 'intent_detected',
          title: `识别意图：${intentDetection.intent}`,
          detail: intentDetection.reasons.join('；'),
          status: 'completed',
        });
        const problemPolicy = getProblemPolicy(intentDetection);
        const taskRunId = createId('task-run');
        const taskRun = this.registerTaskRun({
          id: taskRunId,
          conversationId,
          assistantMessageId: assistantMessage.id,
          goal: trimmed,
          intent: intentDetection.intent,
          status: 'running',
          policy: problemPolicy,
          steps: buildTaskPlan({ detection: intentDetection, policy: problemPolicy }).map((step, index) =>
            index === 0 ? { ...step, status: 'completed', startedAt: now(), completedAt: now() } : step,
          ),
          evidence: [],
          failures: [],
          recoveries: [],
          createdAt: now(),
          updatedAt: now(),
        });
        const timeoutPolicy = getRunTimeoutPolicy({ intent: intentDetection.intent, provider });
        timeoutReason = timeoutPolicy.reason;
        timeoutTimer = window.setTimeout(() => {
          activeRunCancelReasons.set(runId, 'timeout');
          runController.abort();
        }, timeoutPolicy.timeoutMs);
        appendTimelineStep({
          type: 'policy_selected',
          title: '选择问题策略',
          detail: `required=[${problemPolicy.requiredTools.join(', ')}], fallback=[${problemPolicy.fallbackTools.join(', ')}], timeout=${Math.round(timeoutPolicy.timeoutMs / 1000)}s`,
          status: 'completed',
        });
        const policyToolNames = [
          ...problemPolicy.requiredTools,
          ...problemPolicy.preferredTools,
          ...problemPolicy.fallbackTools,
        ].filter((toolName) => builtinToolNames.includes(toolName));
        const allowedToolNames = Array.from(new Set([...runtimeTools.allowedToolNames, ...policyToolNames]));
        const toolRegistry = createBuiltinAIToolRegistry();
        const projectAgentRegistryResult =
          aiAgentFeatureFlags.enabled &&
          aiAgentFeatureFlags.customAgentsEnabled &&
          sendOptions?.contextSnapshot?.vaultPath
            ? await createProjectAIAgentRegistry(sendOptions.contextSnapshot.vaultPath)
            : undefined;
        const aiAgentRegistry = aiAgentFeatureFlags.enabled
          ? (projectAgentRegistryResult?.registry ?? createDefaultAIAgentRegistry())
          : createDefaultAIAgentRegistry([]);
        projectAgentRegistryResult?.failedFiles.forEach((failure) => {
          appendTimelineStep({
            type: 'failed',
            title: '自定义 Agent 加载失败',
            detail: `${failure.path}: ${failure.error}`,
            status: 'failed',
          });
        });
        if (projectAgentRegistryResult?.agents.length) {
          appendTimelineStep({
            type: 'policy_selected',
            title: '加载项目自定义 Agents',
            detail: projectAgentRegistryResult.agents.map((agent) => agent.type).join(', '),
            status: 'completed',
          });
        }
        const availableRuntimeAgents = aiAgentFeatureFlags.enabled ? aiAgentRegistry.list() : [];
        const agentGuidancePrompt =
          aiAgentFeatureFlags.enabled && aiAgentFeatureFlags.promptGuidanceEnabled
            ? formatAIAgentListPrompt(availableRuntimeAgents)
            : '';
        const aiAgentRoute = routeAIAgent({
          prompt: trimmed,
          availableAgents: availableRuntimeAgents,
        });
        const selectedRuntimeAgent =
          aiAgentFeatureFlags.enabled &&
          (shouldAutoRouteToAgent ||
            (aiAgentFeatureFlags.autoRouteEnabled && aiAgentRoute.agentType === 'runtime-guide'))
            ? aiAgentRegistry.get(aiAgentRoute.agentType)
            : undefined;
        if (selectedRuntimeAgent) {
          appendTimelineStep({
            type: 'policy_selected',
            title: `自动选择 Agent：${selectedRuntimeAgent.displayName || selectedRuntimeAgent.type}`,
            detail: `${aiAgentRoute.reason} confidence=${aiAgentRoute.confidence}, source=${selectedRuntimeAgent.source ?? 'built-in'}, projectAgents=${availableRuntimeAgents.filter((agent) => agent.source === 'project').length}`,
            status: 'completed',
          });
        }
        let codeChangePlanGateForPermission: ReturnType<typeof buildCodeChangePlanGate> | undefined;
        const requestChangePlanApproval = async (
          plan: {
            id: string;
            files: string[];
            reasons: string[];
            evidence: string[];
            verification: string[];
          },
          writePreview?: AIChangePlanWritePreview,
        ): Promise<'approved' | 'denied'> => {
          this.registerChangePlan({ ...plan, conversationId, writePreview });
          appendTimelineStep({
            type: 'permission_requested',
            title: `等待修改计划批准：${plan.id}`,
            detail: plan.files.join(', '),
            status: 'blocked',
          });
          const startedAt = now();
          while (now() - startedAt < 120000) {
            if (runController.signal.aborted) return 'denied';
            const current = this.changePlans.find((item) => item.id === plan.id);
            if (current?.approved) return 'approved';
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          return 'denied';
        };
        const requestToolPermission = async (payload: {
          conversationId?: string;
          toolName: string;
          input: unknown;
          message: string;
          reason?: string;
        }): Promise<'allow' | 'deny'> => {
          const request = this.enqueuePermissionRequest({
            conversationId: payload.conversationId,
            toolName: payload.toolName,
            behavior: 'ask',
            reason: payload.reason,
            message: codeChangePlanGateForPermission?.blockingTools.includes(payload.toolName)
              ? `${payload.message}\n\n代码修改计划 Gate：写入前必须已说明要改哪些文件、为什么改、依据了哪些已读证据以及如何验证。`
              : payload.message,
            inputPreview: (() => {
              try {
                return JSON.stringify(payload.input, null, 2).slice(0, 1200);
              } catch {
                return String(payload.input).slice(0, 1200);
              }
            })(),
          });
          appendAssistantToolEvent({
            type: 'progress',
            toolName: payload.toolName,
            message: `等待权限确认：${payload.toolName}`,
          });
          appendTimelineStep({
            type: 'permission_requested',
            title: `请求权限：${payload.toolName}`,
            detail: payload.message,
            status: 'blocked',
          });
          const startedAt = now();
          while (now() - startedAt < 120000) {
            if (runController.signal.aborted) {
              this.resolvePermissionRequest(request.id, 'deny-once');
              return 'deny';
            }
            const current = this.pendingPermissionRequests.find((item) => item.id === request.id);
            if (current?.decision === 'allow-once') return 'allow';
            if (current?.decision === 'deny-once') return 'deny';
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          this.resolvePermissionRequest(request.id, 'deny-once');
          return 'deny';
        };
        appendTimelineStep({
          type: 'preflight_started',
          title: '自主执行任务准备步骤',
          detail: problemPolicy.requiredTools.length
            ? problemPolicy.requiredTools.join(', ')
            : '按任务计划自动收集必要上下文',
          status: 'running',
        });
        const autonomousResult = await runAutonomousTask({
          taskRun,
          userInput: effectiveTaskInput,
          detection: intentDetection,
          policy: problemPolicy,
          taskProfile: aiAgentFeatureFlags.recoveryPlannerV2Enabled ? taskProfile : undefined,
          completionCriteria: aiAgentFeatureFlags.recoveryPlannerV2Enabled ? taskCompletionCriteria : undefined,
          evidencePlan: aiAgentFeatureFlags.evidencePlanEnabled ? evidencePlan : undefined,
          registry: toolRegistry,
          allowedToolNames,
          context: {
            conversationId,
            workspace: runtimeWorkspace,
            permissionMode: this.settings.forceReadOnlyMode ? 'auto-read' : resolvedAgent?.permissionMode,
            requestPermission: requestToolPermission,
            signal: runController.signal,
          },
          currentFileName: sendOptions?.contextSnapshot?.currentFileName,
          onEvent: (event) => {
            if (event.type === 'task_updated') {
              this.updateTaskRun(taskRun.id, event.taskRun);
            } else if (event.type === 'step_started') {
              appendTimelineStep({
                type: event.step.type === 'collect_context' ? 'tool_observed' : 'preflight_started',
                title: `执行步骤：${event.step.title}`,
                status: 'running',
              });
            } else if (event.type === 'step_completed') {
              appendTimelineStep({
                type: event.step.type === 'collect_context' ? 'tool_observed' : 'preflight_started',
                title: `完成步骤：${event.step.title}`,
                status: 'completed',
              });
            } else if (event.type === 'step_blocked') {
              appendTimelineStep({
                type: 'failed',
                title: `步骤受阻：${event.step.title}`,
                detail: event.failures.map((failure) => failure.reason).join('；'),
                status: 'blocked',
              });
            } else if (event.type === 'recovery_selected') {
              appendTimelineStep({
                type: 'policy_selected',
                title: `恢复建议：${event.recovery.actionType}`,
                detail: event.recovery.reason,
                status: 'blocked',
              });
            } else if (event.type === 'runtime_event') {
              if (event.event.type === 'tool_call_start') {
                appendAssistantToolEvent({
                  type: 'start',
                  toolName: event.event.call.name,
                  message: `自主调用工具：${event.event.call.name}`,
                });
              } else if (event.event.type === 'tool_call_progress') {
                appendAssistantToolEvent({ type: 'progress', message: event.event.message });
              } else if (event.event.type === 'tool_call_result') {
                appendAssistantToolEvent({
                  type: event.event.result.error ? 'error' : 'result',
                  toolName: event.event.result.name,
                  message: event.event.result.error || `工具 ${event.event.result.name} 执行完成`,
                });
              }
            }
          },
        });
        const autonomousTaskRun = autonomousResult.taskRun;
        const preflightResult = autonomousResult.preflight || { results: [], injectedContext: '' };
        const failedPreflightResults = preflightResult.results.filter((result) => !result.ok);
        failedPreflightResults.forEach((result) => {
          const failureMessage = result.error || result.observation?.summary || `工具 ${result.toolName} 未产出可用结果`;
          appendAssistantToolEvent({
            type: 'error',
            toolName: result.toolName,
            message: failureMessage,
          });
          appendTimelineStep({
            type: 'failed',
            title: `预处理工具失败：${result.toolName}`,
            detail: failureMessage,
            status: 'failed',
          });
        });
        const codeEvidence = autonomousResult.codeEvidence || {
          attempted: false,
          ok: false,
          evidenceContext: '',
          results: [],
        };
        if (codeEvidence.attempted) {
          appendTimelineStep({
            type: 'tool_observed',
            title: codeEvidence.ok ? '代码证据收集完成' : '代码证据不足',
            detail: codeEvidence.directory
              ? `${codeEvidence.directory} / ${codeEvidence.query || ''}`
              : '缺少项目目录或当前文件路径',
            status: codeEvidence.ok ? 'completed' : 'blocked',
          });
        }
        const codeChangePlanGate = buildCodeChangePlanGate({
          detection: intentDetection,
          codeEvidence,
        });
        codeChangePlanGateForPermission = codeChangePlanGate;
        if (codeChangePlanGate.required) {
          appendTimelineStep({
            type: 'policy_selected',
            title: '启用代码修改计划 Gate',
            detail: codeChangePlanGate.evidenceReady
              ? '已具备代码证据，写入前仍需说明修改计划。'
              : '证据不足，写入前必须补充路径或说明限制。',
            status: codeChangePlanGate.evidenceReady ? 'completed' : 'blocked',
          });
        }
        appendTimelineStep({
          type: 'verifying',
          title: '验证回答证据',
          status: 'running',
        });
        const taskRunForVerification = this.taskRuns.find((item) => item.id === taskRun.id) || autonomousTaskRun;
        const finalAnswerVerification = verifyFinalAnswerReadiness({
          detection: intentDetection,
          policy: problemPolicy,
          preflight: preflightResult,
          codeEvidence,
          evidence: taskRunForVerification.evidence,
        });
        this.updateTaskRun(taskRun.id, {
          status: finalAnswerVerification.blocking ? 'blocked' : 'running',
          verification: {
            ok: finalAnswerVerification.ok,
            confidence: finalAnswerVerification.confidence,
            reasons: finalAnswerVerification.reasons,
            checkedAt: now(),
          },
          steps:
            this.taskRuns
              .find((item) => item.id === taskRun.id)
              ?.steps.map((step) =>
                step.type === 'extract_evidence'
                  ? {
                      ...step,
                      status: finalAnswerVerification.ok ? 'completed' : 'blocked',
                      completedAt: now(),
                      failureReason: finalAnswerVerification.ok
                        ? undefined
                        : finalAnswerVerification.reasons.join('；'),
                    }
                  : step,
              ) || taskRun.steps,
        });
        appendTimelineStep({
          type: 'verifying',
          title: finalAnswerVerification.ok ? '证据验证通过' : '证据验证不足',
          detail: finalAnswerVerification.reasons.join('；'),
          status: finalAnswerVerification.ok ? 'completed' : finalAnswerVerification.blocking ? 'blocked' : 'failed',
        });
        if (finalAnswerVerification.blocking) {
          appendAssistantToolEvent({
            type: 'progress',
            message: `最终回答证据不足：${finalAnswerVerification.reasons.join('；')}`,
          });
        }
        const dailyReportBriefOutput =
          intentDetection.entities?.subtype === 'daily_report'
            ? preflightResult.results.find((result) => result.toolName === 'build-today-work-report' && result.ok)
                ?.output ||
              preflightResult.results.find((result) => result.toolName === 'build-daily-report-brief' && result.ok)
                ?.output
            : undefined;
        const dailyReportBriefPrompt =
          dailyReportBriefOutput && typeof dailyReportBriefOutput === 'object'
            ? [
                '# Daily report generation mode',
                "You already have verified local daily-report evidence. Do not claim local tools are unavailable. Do not ask the user to resend today's work details unless diagnostics and sections both show the missing area is outside software records.",
                'Prefer using the verified reportMarkdown below as the base draft. You may polish wording, but keep it faithful to the evidence.',
                typeof (dailyReportBriefOutput as Record<string, unknown>).reportMarkdown === 'string'
                  ? String((dailyReportBriefOutput as Record<string, unknown>).reportMarkdown)
                  : '',
              ]
                .filter(Boolean)
                .join('\n\n')
            : '';
        const agentSystemPromptV2 = [
          ...buildAgentSystemPromptV2({
            userInput: trimmed,
            provider,
            model,
            agent: resolvedAgent,
            skills: resolvedRuntimeSkills,
            availableToolNames: allowedToolNames,
            permissionMode: resolvedAgent?.permissionMode,
            conversationId,
            intentDetection,
            problemPolicy,
            preflightContext: preflightResult.injectedContext,
            codeEvidence,
            codeChangePlanGate,
            finalAnswerVerification,
            providerToolStrategy,
            conversationSummary: this.conversationSummaries[conversationId],
          }),
          taskProfilePrompt,
          taskCompletionCriteriaPrompt,
          evidencePlanPrompt,
          clarificationContextPrompt,
          dailyReportBriefPrompt,
          agentGuidancePrompt,
        ]
          .filter(Boolean)
          .join('\n\n');
        requestMessages = buildCompressedRequestMessages(
          history,
          agentSystemPromptV2,
          this.conversationSummaries[conversationId],
        );
        const shouldUseToolLoop = providerToolStrategy.supportsNativeToolCalling && allowedToolNames.length > 0;

        let reply = '';
        const recoveryQuestions = (preflightResult.recoveryActions ?? [])
          .filter((action) => action.startsWith('ask_user:'))
          .map((action) => action.replace(/^ask_user:\s*/, '').trim());
        const shouldPromptUserNow = finalAnswerVerification.primaryMissingRequirementKeys.includes('user_context');
        const applyFinalAnswerGate = (content: string): string => {
          if (finalAnswerVerification.status === 'ready') return content;
          if (finalAnswerVerification.status === 'degraded') {
            const notice = [
              '受限完成：',
              `完成度：${finalAnswerVerification.completionScore}%`,
              ...finalAnswerVerification.reasons.map((reason) => `- ${reason}`),
              finalAnswerVerification.primaryMissingRequirements.length
                ? `主要缺失：${finalAnswerVerification.primaryMissingRequirements.join('；')}`
                : undefined,
              finalAnswerVerification.secondaryMissingRequirements.length
                ? `次要缺失：${finalAnswerVerification.secondaryMissingRequirements.join('；')}`
                : undefined,
              finalAnswerVerification.missingRequirements.length
                ? `缺失要求：${finalAnswerVerification.missingRequirements.join('；')}`
                : undefined,
              finalAnswerVerification.primaryNextActions.length
                ? `优先下一步：${finalAnswerVerification.primaryNextActions.join('；')}`
                : undefined,
              finalAnswerVerification.secondaryNextActions.length
                ? `补充下一步：${finalAnswerVerification.secondaryNextActions.join('；')}`
                : undefined,
              finalAnswerVerification.nextActions.length
                ? `下一步：${finalAnswerVerification.nextActions.join('；')}`
                : undefined,
              shouldPromptUserNow && recoveryQuestions.length
                ? `需要你补充：${recoveryQuestions.join('；')}`
                : undefined,
              '当前无法获得完整可靠证据；以下回答必须按受限结果理解，并优先参考已尝试工具、失败原因和建议的下一步。',
            ]
              .filter(Boolean)
              .join('\n');
            return content.includes('受限完成：') ? content : `${notice}\n\n${content}`;
          }
          if (!finalAnswerVerification.blocking) return content;
          const notice = [
            '证据检查未通过：',
            ...finalAnswerVerification.reasons.map((reason) => `- ${reason}`),
            '请基于上述限制解读以下回答；如果需要准确结论，请补充必要上下文或允许相关工具继续执行。',
          ].join('\n');
          return content.includes('证据检查未通过') ? content : `${notice}\n\n${content}`;
        };

        const requestCompletion = async (
          messagesForRequest: { role: string; content: string }[],
          stream: boolean,
          options?: { silent?: boolean },
        ): Promise<string> => {
          const { targetUrl, headers, body } = buildLLMRequestSpec({
            provider,
            baseUrl: channel.baseUrl,
            apiKey,
            model,
            messages: messagesForRequest,
            stream,
          });

          const response = await llmFetch(targetUrl, {
            method: 'POST',
            headers,
            signal: runController.signal,
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            throw await createDetailedLLMStatusError(response, targetUrl, getLLMStatusFallbackMessage(response.status));
          }

          if (provider === 'anthropic' || provider === 'gemini') {
            const data = await response.json();
            const replyText = extractProviderReply(provider, data);
            if (!replyText.trim()) throw new Error(`LLM 未返回有效内容（${provider} / ${model}）。`);
            return replyText;
          }

          if (stream && response.body && isEventStreamResponse(response)) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let streamedReply = '';
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

                const payload = trimmedLine.slice(5).trim();
                if (payload === '[DONE]') continue;

                try {
                  const chunk = JSON.parse(payload);
                  const delta: string = chunk?.choices?.[0]?.delta?.content ?? '';
                  if (delta) {
                    streamedReply += delta;
                    if (!options?.silent) applyAssistantContent(streamedReply, 'streaming');
                  }
                } catch (error) {
                  console.warn('解析对话流数据失败:', error);
                }
              }
            }

            if (streamedReply.trim()) return streamedReply;
          }

          const data = await response.json();
          const replyText = extractProviderReply(provider, data);
          if (!replyText.trim()) throw new Error(`LLM 未返回有效内容（${provider} / ${model}）。`);
          return replyText;
        };

        const maybeRetryDailyReportAnswer = async (content: string): Promise<string> => {
          const consistency = evaluateDailyReportAnswerConsistency({
            detection: intentDetection,
            preflight: preflightResult,
            answer: content,
          });
          if (!consistency.applicable || consistency.ok || !consistency.shouldRetry || !consistency.retryPrompt) {
            return content;
          }

          appendTimelineStep({
            type: 'verifying',
            title: '日报回答一致性修正',
            detail: consistency.reasons.join('；'),
            status: 'running',
          });

          try {
            const retryMessages = [
              ...requestMessages,
              {
                role: 'system',
                content:
                  'Rewrite the final answer using the verified local daily-report evidence. Do not say local tools are unavailable. Do not ask the user to resend work details that are already present in the verified brief.',
              },
              {
                role: 'user',
                content: `${consistency.retryPrompt}\n\n上一版回答存在问题，请直接重写成最终可交付版本：\n${content}`,
              },
            ];
            const retried = applyFinalAnswerGate(await requestCompletion(retryMessages, false, { silent: true }));
            const secondCheck = evaluateDailyReportAnswerConsistency({
              detection: intentDetection,
              preflight: preflightResult,
              answer: retried,
            });
            appendTimelineStep({
              type: 'verifying',
              title: secondCheck.ok ? '日报回答一致性修正完成' : '日报回答一致性仍有风险',
              detail: secondCheck.ok ? '已基于日报摘要重写最终回答。' : secondCheck.reasons.join('；'),
              status: secondCheck.ok ? 'completed' : 'failed',
            });
            return secondCheck.ok ? retried : content;
          } catch (error) {
            appendTimelineStep({
              type: 'verifying',
              title: '日报回答一致性修正失败',
              detail: error instanceof Error ? error.message : String(error),
              status: 'failed',
            });
            return content;
          }
        };

        const modifiedFiles = new Set<string>();
        const executedChecks: string[] = [];
        const runtimeToolErrors: string[] = [];
        const runtimeToolResults: string[] = [];

        const collectModifiedFile = (output: unknown): void => {
          if (!output || typeof output !== 'object') return;
          const record = output as Record<string, unknown>;
          const path = typeof record.path === 'string' ? record.path : undefined;
          if (path) modifiedFiles.add(path);
        };

        const toolLoopContext = {
          conversationId,
          workspace: runtimeWorkspace,
          permissionMode: this.settings.forceReadOnlyMode ? 'auto-read' : resolvedAgent?.permissionMode,
          requestPermission: requestToolPermission,
          requestPlanApproval: requestChangePlanApproval,
          writePlanGuard: codeChangePlanGate.required
            ? {
                required: true,
                blockingTools: codeChangePlanGate.blockingTools,
                approvedPlanIds: this.changePlans.filter((plan) => plan.approved).map((plan) => plan.id),
              }
            : undefined,
          signal: runController.signal,
        };

        const handleRuntimeEvent = (event: AIRuntimeEvent): void => {
          if (event.type === 'tool_call_start') {
            appendAssistantToolEvent({
              type: 'start',
              toolName: event.call.name,
              message: `正在调用工具：${event.call.name}`,
            });
            applyAssistantContent(`正在调用工具：${event.call.name}...`, 'streaming');
          } else if (event.type === 'tool_call_progress') {
            appendAssistantToolEvent({ type: 'progress', message: event.message });
            applyAssistantContent(event.message, 'streaming');
          } else if (event.type === 'tool_call_result') {
            if (event.result.name === 'write-file' && !event.result.error) collectModifiedFile(event.result.output);
            if (event.result.name === 'apply-patch' && !event.result.error) modifiedFiles.add('patch:apply-patch');
            if (event.result.name === 'run-check' && !event.result.error)
              executedChecks.push(JSON.stringify(event.result.output).slice(0, 800));
            if (event.result.error) runtimeToolErrors.push(`${event.result.name}: ${event.result.error}`);
            else runtimeToolResults.push(`${event.result.name}: ok`);
            appendAssistantToolEvent({
              type: event.result.error ? 'error' : 'result',
              toolName: event.result.name,
              message: event.result.error || `工具 ${event.result.name} 执行完成`,
            });
          } else if (event.type === 'change_plan_detected') {
            this.registerChangePlan({
              ...event.plan,
              conversationId,
            });
            appendTimelineStep({
              type: 'policy_selected',
              title: '检测到结构化修改计划',
              detail: event.plan.files.join(', '),
              status: 'blocked',
            });
          } else if (event.type === 'post_write_verification') {
            executedChecks.push(`${event.toolName}: ${event.ok ? 'ok' : 'failed'} ${event.summary}`.slice(0, 800));
            appendAssistantToolEvent({
              type: event.ok ? 'result' : 'error',
              toolName: event.toolName,
              message: event.summary,
            });
            appendTimelineStep({
              type: 'verifying',
              title: event.ok ? '写入后验证通过' : '写入后验证失败',
              detail: event.summary,
              status: event.ok ? 'completed' : 'failed',
            });
          } else if (event.type === 'error') {
            appendAssistantToolEvent({ type: 'error', message: event.error });
          }
        };

        appendTimelineStep({
          type: 'reasoning',
          title: selectedRuntimeAgent
            ? `Agent 执行：${selectedRuntimeAgent.displayName || selectedRuntimeAgent.type}`
            : shouldUseToolLoop
              ? '模型推理与工具循环'
              : '模型生成回答',
          detail: selectedRuntimeAgent
            ? `${aiAgentRoute.reason} confidence=${aiAgentRoute.confidence}`
            : providerToolStrategy.toolMode,
          status: 'running',
        });

        let agentHandled = false;
        if (selectedRuntimeAgent && shouldUseToolLoop) {
          try {
            const agentRuntime = createAIAgentRuntime(
              createAIAgentLLMExecutor({
                provider,
                baseUrl: channel.baseUrl,
                apiKey,
                model,
                registry: toolRegistry,
                maxTokens: 2048,
                maxToolRounds: 4,
              }),
            );
            const agentResult = await agentRuntime.run({
              agent: selectedRuntimeAgent,
              messages: [{ role: 'user', content: trimmed, createdAt: now() }],
              tools: toolRegistry.filter(allowedToolNames),
              context: {
                parentRunId: runId,
                workspace: runtimeWorkspace,
                toolContext: toolLoopContext,
                metadata: {
                  conversationId,
                  routeReason: aiAgentRoute.reason,
                  routeConfidence: aiAgentRoute.confidence,
                },
              },
              provider,
              model,
              apiKey,
              baseUrl: channel.baseUrl,
              maxTokens: 2048,
              maxToolRounds: 4,
              intent: intentDetection.intent,
              signal: runController.signal,
            });
            agentResult.events.forEach(handleRuntimeEvent);
            if (agentResult.status === 'completed' && agentResult.outputText.trim()) {
              reply = await maybeRetryDailyReportAnswer(applyFinalAnswerGate(agentResult.outputText));
              applyAssistantContent(reply, 'completed');
              agentHandled = true;
              appendTimelineStep({
                type: 'reasoning',
                title: `Agent 完成：${selectedRuntimeAgent.type}`,
                detail: `duration=${agentResult.durationMs ?? 0}ms`,
                status: 'completed',
              });
            } else {
              appendTimelineStep({
                type: 'failed',
                title: `Agent 回退：${selectedRuntimeAgent.type}`,
                detail: agentResult.error || `status=${agentResult.status}`,
                status: 'failed',
              });
            }
          } catch (error) {
            appendTimelineStep({
              type: 'failed',
              title: `Agent 回退：${selectedRuntimeAgent.type}`,
              detail: error instanceof Error ? error.message : String(error),
              status: 'failed',
            });
          }
        }

        if (!agentHandled && shouldUseToolLoop) {
          const result =
            provider === 'anthropic'
              ? await runAnthropicToolLoop(
                  {
                    baseUrl: channel.baseUrl,
                    apiKey,
                    model,
                    messages: requestMessages,
                    registry: toolRegistry,
                    allowedToolNames,
                    maxToolRounds: 4,
                    context: toolLoopContext,
                    signal: runController.signal,
                  },
                  handleRuntimeEvent,
                )
              : provider === 'gemini'
                ? await runGeminiToolLoop(
                    {
                      baseUrl: channel.baseUrl,
                      apiKey,
                      model,
                      messages: requestMessages,
                      registry: toolRegistry,
                      allowedToolNames,
                      maxToolRounds: 4,
                      context: toolLoopContext,
                      signal: runController.signal,
                    },
                    handleRuntimeEvent,
                  )
                : await runOpenAIToolLoop(
                    {
                      provider,
                      baseUrl: channel.baseUrl,
                      apiKey,
                      model,
                      messages: requestMessages,
                      registry: toolRegistry,
                      allowedToolNames,
                      maxToolRounds: 4,
                      context: toolLoopContext,
                      signal: runController.signal,
                    },
                    handleRuntimeEvent,
                  );
          reply = await maybeRetryDailyReportAnswer(applyFinalAnswerGate(result.content));
          if (!reply.trim()) throw new Error(`LLM 未返回有效内容（${provider} / ${model}）。`);
          applyAssistantContent(reply, 'completed');
        }
        if (!agentHandled && !shouldUseToolLoop) {
          try {
            reply = await requestCompletion(requestMessages, canUseStreaming);
          } catch (error) {
            if (!canUseStreaming) throw error;

            console.warn('流式对话失败，自动回退非流式请求:', error);
            applyAssistantContent('', 'sending');
            reply = await requestCompletion(requestMessages, false);
          }

          reply = await maybeRetryDailyReportAnswer(applyFinalAnswerGate(reply));
          applyAssistantContent(reply, 'completed');
        }

        const verifierAgent = aiAgentRegistry.get('verifier');
        const shouldRunVerifier = Boolean(
          aiAgentFeatureFlags.enabled &&
          aiAgentFeatureFlags.verifierEnabled &&
          verifierAgent &&
          shouldUseToolLoop &&
          selectedRuntimeAgent?.type !== 'verifier' &&
          reply.trim() &&
          (modifiedFiles.size > 0 ||
            intentDetection.intent === 'code_modification' ||
            intentDetection.intent === 'troubleshooting' ||
            /验证|测试|verify|test/i.test(trimmed)),
        );
        if (shouldRunVerifier && verifierAgent) {
          appendTimelineStep({
            type: 'verifying',
            title: '启动 Verifier Agent',
            detail: `modifiedFiles=${modifiedFiles.size}, checks=${executedChecks.length}`,
            status: 'running',
          });
          try {
            const verifierRuntime = createAIAgentRuntime(
              createAIAgentLLMExecutor({
                provider,
                baseUrl: channel.baseUrl,
                apiKey,
                model,
                registry: toolRegistry,
                maxTokens: 1536,
                maxToolRounds: 3,
              }),
            );
            const verifierPrompt = [
              '请对本次 AI 任务结果做独立验证。你只能验证，不要修改文件。',
              `原始任务：${trimmed}`,
              `初始回答：${reply}`,
              `修改文件：${Array.from(modifiedFiles).join(', ') || '未检测到明确写入文件'}`,
              `已执行检查：${executedChecks.join('\n') || '无'}`,
              `工具结果摘要：${runtimeToolResults.slice(-12).join('\n') || '无'}`,
              `工具错误：${runtimeToolErrors.slice(-8).join('\n') || '无'}`,
              '请最终输出 VERDICT: PASS、VERDICT: FAIL 或 VERDICT: PARTIAL，并简要说明依据。',
            ].join('\n\n');
            const verifierResult = await verifierRuntime.run({
              agent: verifierAgent,
              messages: [{ role: 'user', content: verifierPrompt, createdAt: now() }],
              tools: toolRegistry.filter(['read-file', 'search-files', 'list-files', 'run-check']),
              context: {
                parentRunId: runId,
                workspace: runtimeWorkspace,
                toolContext: {
                  ...toolLoopContext,
                  permissionMode: 'auto-read',
                  writePlanGuard: undefined,
                  metadata: {
                    verifierForRunId: runId,
                    modifiedFiles: Array.from(modifiedFiles),
                  },
                },
                metadata: {
                  conversationId,
                  verifierForRunId: runId,
                },
              },
              provider,
              model,
              apiKey,
              baseUrl: channel.baseUrl,
              maxTokens: 1536,
              maxToolRounds: 3,
              intent: intentDetection.intent,
              signal: runController.signal,
            });
            verifierResult.events.forEach(handleRuntimeEvent);
            const verdictMatch = verifierResult.outputText.match(/VERDICT:\s*(PASS|FAIL|PARTIAL)/i);
            const verdict = verdictMatch?.[1]?.toUpperCase() || 'PARTIAL';
            appendTimelineStep({
              type: 'verifying',
              title: `Verifier 结论：${verdict}`,
              detail: verifierResult.outputText.slice(0, 600),
              status: verdict === 'PASS' ? 'completed' : verdict === 'FAIL' ? 'failed' : 'blocked',
            });
            const verifierAppendix = `\n\n---\n\n验证结果：\n${verifierResult.outputText}`;
            reply = `${reply}${verifierAppendix}`;
            applyAssistantContent(reply, 'completed');
          } catch (error) {
            appendTimelineStep({
              type: 'verifying',
              title: 'Verifier Agent 回退',
              detail: error instanceof Error ? error.message : String(error),
              status: 'failed',
            });
          }
        }

        if (
          aiAgentFeatureFlags.clarificationLoopEnabled &&
          finalAnswerVerification.status === 'degraded' &&
          shouldPromptUserNow &&
          recoveryQuestions.length
        ) {
          const hasPendingClarification = this.pendingClarifications.some(
            (item) => item.conversationId === conversationId && !item.resolvedAt,
          );
          if (!hasPendingClarification) {
            this.enqueueClarificationRequest({
              conversationId,
              questions: recoveryQuestions,
              reason: '任务恢复需要用户补充上下文。',
            });
          }
        }

        if (finalAnswerVerification.status === 'degraded' && reply.trim()) {
          try {
            const artifactPath = await writeDegradedAnswerArtifact({
              workspace: runtimeWorkspace,
              title: trimmed,
              content: [
                `# 受限结果：${trimmed}`,
                '',
                '## 原始任务',
                trimmed,
                '',
                '## 有效任务输入',
                effectiveTaskInput,
                '',
                '## 澄清补充',
                resolvedClarifications.length
                  ? resolvedClarifications
                      .map((item) => `- 问题：${item.questions.join('；')}\n  回复：${item.response || trimmed}`)
                      .join('\n')
                  : '无',
                '',
                '## 验证状态',
                `完成度：${finalAnswerVerification.completionScore}%`,
                finalAnswerVerification.reasons.map((reason) => `- ${reason}`).join('\n'),
                '',
                '## 主要缺失',
                finalAnswerVerification.primaryMissingRequirements.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 次要缺失',
                finalAnswerVerification.secondaryMissingRequirements.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 缺失要求',
                finalAnswerVerification.missingRequirements.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 优先下一步',
                finalAnswerVerification.primaryNextActions.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 补充下一步',
                finalAnswerVerification.secondaryNextActions.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 下一步',
                finalAnswerVerification.nextActions.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 需要用户补充',
                (shouldPromptUserNow ? recoveryQuestions : []).map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 恢复动作',
                preflightResult.recoveryActions?.map((action) => `- ${action}`).join('\n') || '无',
                '',
                '## 缺失证据类别',
                preflightResult.missingEvidenceKeys?.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 候选来源',
                preflightResult.sourceCandidates?.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 证据尝试',
                preflightResult.evidenceAttempts?.map((item) => `- ${item}`).join('\n') || '无',
                '',
                '## 最终回答',
                reply,
              ].join('\n'),
            });
            reply = `${reply}\n\n受限结果已保存：${artifactPath}`;
            applyAssistantContent(reply, 'completed');
          } catch {
            // 保存受限产物失败不应阻断最终回答。
          }
        }

        this.conversations = {
          ...this.conversations,
          [conversationId]: {
            ...this.conversations[conversationId],
            status: 'active',
            updatedAt: now(),
          },
        };

        appendTimelineStep({
          type: 'completed',
          title: '运行完成',
          status: 'completed',
        });

        if (task) {
          task.status = 'completed';
          task.progressText = 'AI 已完成回复，可继续补充信息或转成文档、待办、日程、知识沉淀。';
          task.updatedAt = now();
        }

        this.persist();
        this.autoSuggestArtifacts(conversationId);

        const allMessages = this.conversationMessages(conversationId);
        if (
          allMessages.length >= CONVERSATION_COMPRESS_THRESHOLD &&
          !this.conversationSummaries[conversationId] &&
          !this.summaryGenerating[conversationId]
        ) {
          this.requestSmartSummary(conversationId).catch((err: unknown) => {
            console.warn('后台摘要生成失败（不影响主对话）:', err);
          });
        }

        this.updateTaskRun(taskRun.id, {
          status: 'completed',
          completedAt: now(),
          steps:
            this.taskRuns
              .find((item) => item.id === taskRun.id)
              ?.steps.map((step) =>
                step.status === 'pending' ? { ...step, status: 'completed', completedAt: now() } : step,
              ) || taskRun.steps,
        });
        window.clearTimeout(timeoutTimer);
        activeRunControllers.delete(runId);
        activeRunCancelReasons.delete(runId);
        this.activeRunIds = this.activeRunIds.filter((id) => id !== runId);
        return this.messages[assistantMessage.id];
      } catch (error) {
        window.clearTimeout(timeoutTimer);
        activeRunControllers.delete(runId);
        const cancelReason = activeRunCancelReasons.get(runId);
        activeRunCancelReasons.delete(runId);
        this.activeRunIds = this.activeRunIds.filter((id) => id !== runId);
        console.warn('发送对话消息失败:', error);
        const reason =
          cancelReason === 'timeout'
            ? timeoutReason || '本次运行超时中止。'
            : cancelReason === 'user'
              ? '用户已停止本次运行。'
              : getErrorMessage(error);
        const currentFailedMessage = this.messages[assistantMessage.id];

        this.messages = {
          ...this.messages,
          [assistantMessage.id]: {
            ...currentFailedMessage,
            content: reason,
            status: 'failed',
            timeline: [
              ...(currentFailedMessage?.timeline ?? []),
              {
                id: createId('timeline'),
                type: 'failed',
                title: cancelReason === 'timeout' ? '运行超时' : cancelReason === 'user' ? '用户停止运行' : '运行失败',
                detail: reason,
                status: 'failed',
                createdAt: now(),
              },
            ],
            updatedAt: now(),
          },
        };

        this.conversations = {
          ...this.conversations,
          [conversationId]: {
            ...this.conversations[conversationId],
            status: 'failed',
            updatedAt: now(),
          },
        };

        if (task) {
          task.status = 'failed';
          task.progressText = `任务执行失败：${reason}`;
          task.updatedAt = now();
        }

        this.persist();
        return this.messages[assistantMessage.id];
      }
    },

    addSkill(skill: Omit<AISkill, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>) {
      this.skills.unshift(createSkill({ ...skill, id: createId('skill'), builtin: false }));
      this.persist();
    },

    updateSkill(id: string, patch: Partial<AISkill>) {
      const skill = this.skills.find((item) => item.id === id);
      if (!skill) return;
      Object.assign(skill, patch, { updatedAt: now() });
      this.persist();
    },

    deleteSkill(id: string) {
      this.skills = this.skills.filter((skill) => skill.id !== id || skill.builtin);
      this.persist();
    },

    addAgent(agent: Omit<AIAgent, 'id' | 'builtin' | 'usageCount' | 'createdAt' | 'updatedAt'>) {
      this.agents.unshift(createAgent({ ...agent, id: createId('agent'), builtin: false }));
      this.persist();
    },

    updateAgent(id: string, patch: Partial<AIAgent>) {
      const agent = this.agents.find((item) => item.id === id);
      if (!agent) return;
      Object.assign(agent, patch, { updatedAt: now() });
      this.persist();
    },

    deleteAgent(id: string) {
      this.agents = this.agents.filter((agent) => agent.id !== id || agent.builtin);
      this.persist();
    },

    updateSettings(patch: Partial<AISettings>) {
      this.settings = { ...this.settings, ...patch };
      this.persist();
    },

    addChannel(
      payload: Omit<LLModelChannel, 'id' | 'createdAt' | 'updatedAt' | 'apiKeyStored' | 'apiKeyStoredAt'> & {
        apiKeyStored?: boolean;
        apiKeyStoredAt?: number;
      },
    ) {
      const channel = createChannel(payload);
      this.settings.llmChannels.push(channel);

      if (!this.settings.activeChannelId) {
        this.settings.activeChannelId = channel.id;
      }

      this.persist();
      return channel;
    },

    updateChannel(id: string, patch: Partial<LLModelChannel>) {
      const channel = this.settings.llmChannels.find((item) => item.id === id);
      if (!channel) return;
      Object.assign(channel, patch, { updatedAt: now() });
      this.persist();
    },

    deleteChannel(id: string) {
      this.settings.llmChannels = this.settings.llmChannels.filter((channel) => channel.id !== id);

      if (this.settings.activeChannelId === id) {
        this.settings.activeChannelId = this.settings.llmChannels[0]?.id ?? '';
      }

      try {
        removeEncryptedChannelApiKey(id);
      } catch (error) {
        console.warn('删除渠道 API Key 失败:', error);
      }

      const { [id]: _removed, ...rest } = this.channelTestResults;
      this.channelTestResults = rest;
      this.persist();
    },

    setActiveChannel(id: string) {
      if (!this.settings.llmChannels.some((channel) => channel.id === id)) return;
      this.settings.activeChannelId = id;
      this.persist();
    },

    async setChannelApiKey(channelId: string, apiKey: string) {
      const channel = this.settings.llmChannels.find((item) => item.id === channelId);
      if (!channel) return;

      try {
        const record = await saveEncryptedChannelApiKey(channelId, apiKey);
        channel.apiKeyStored = Boolean(record);
        channel.apiKeyStoredAt = record?.updatedAt ?? 0;
      } catch (error) {
        console.warn('保存渠道 API Key 失败:', error);
      }

      this.persist();
    },

    appendChannelTestHistory(channelId: string, result: AIChannelTestResult) {
      const history = this.channelTestHistory[channelId] ? [...this.channelTestHistory[channelId]] : [];
      history.unshift(result);
      this.channelTestHistory = {
        ...this.channelTestHistory,
        [channelId]: history.slice(0, 5),
      };
      this.persist();
    },

    async testChannelConnection(channelId: string) {
      const channel = this.settings.llmChannels.find((item) => item.id === channelId);
      if (!channel) {
        this.channelTestResults = {
          ...this.channelTestResults,
          [channelId]: { status: 'error', message: '未找到目标渠道配置。', testedAt: Date.now() },
        };
        this.appendChannelTestHistory(channelId, this.channelTestResults[channelId]);
        return this.channelTestResults[channelId];
      }

      this.channelTestResults = {
        ...this.channelTestResults,
        [channel.id]: { status: 'checking', message: '正在检查渠道配置...', testedAt: Date.now() },
      };

      const provider = channel.provider;
      const model = channel.model?.trim();
      const apiKey = await resolveChannelApiKey(channel.id);

      if (!apiKey) {
        this.channelTestResults = {
          ...this.channelTestResults,
          [channel.id]: {
            status: 'error',
            message: `${provider} 未配置 API Key。请先在渠道中保存 API Key，或在环境变量中配置 VITE_OPENAI_API_KEY。`,
            testedAt: Date.now(),
          },
        };
        this.appendChannelTestHistory(channel.id, this.channelTestResults[channel.id]);
        return this.channelTestResults[channel.id];
      }

      if (!model) {
        this.channelTestResults = {
          ...this.channelTestResults,
          [channel.id]: { status: 'error', message: '未填写模型名称，请先选择或输入一个模型。', testedAt: Date.now() },
        };
        this.appendChannelTestHistory(channel.id, this.channelTestResults[channel.id]);
        return this.channelTestResults[channel.id];
      }

      try {
        const { targetUrl, headers, body } = buildLLMRequestSpec({
          provider,
          baseUrl: channel.baseUrl,
          apiKey,
          model,
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 16,
        });

        const response = await llmFetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const data = await response.json();
          const replyText = extractProviderReply(provider, data);
          if (!replyText.trim()) {
            throw new Error(`${provider} 已连通，但返回内容为空或格式不符合当前解析规则。`);
          }

          this.channelTestResults = {
            ...this.channelTestResults,
            [channel.id]: {
              status: 'success',
              message: `连接成功：${provider} / ${model}，已收到有效响应。`,
              testedAt: Date.now(),
            },
          };
        } else if (response.status === 401 || response.status === 403) {
          const detailedError = await createDetailedLLMStatusError(
            response,
            targetUrl,
            `${provider} 认证失败，请检查 API Key 或权限。`,
          );
          this.channelTestResults = {
            ...this.channelTestResults,
            [channel.id]: {
              status: 'error',
              message: detailedError.message,
              testedAt: Date.now(),
            },
          };
        } else {
          const detailedError = await createDetailedLLMStatusError(
            response,
            targetUrl,
            `${provider} 返回异常状态码 ${response.status}，${getLLMStatusFallbackMessage(response.status)}`,
          );
          this.channelTestResults = {
            ...this.channelTestResults,
            [channel.id]: {
              status: 'error',
              message: detailedError.message,
              testedAt: Date.now(),
            },
          };
        }
      } catch (error) {
        console.warn(`测试 ${provider} 连接失败:`, error);
        const message = getErrorMessage(error, '渠道测试失败。');

        this.channelTestResults = {
          ...this.channelTestResults,
          [channel.id]: {
            status: 'error',
            message: `无法连接 ${provider}：${message}。请检查网络、代理或 Base URL 是否可达。`,
            testedAt: Date.now(),
          },
        };
      }

      this.appendChannelTestHistory(channel.id, this.channelTestResults[channel.id]);
      return this.channelTestResults[channel.id];
    },

    async requestSmartSummary(conversationId: string): Promise<string> {
      const messages = this.conversationMessages(conversationId);
      if (messages.length < CONVERSATION_COMPRESS_THRESHOLD) {
        return '';
      }

      if (this.conversationSummaries[conversationId]) {
        return this.conversationSummaries[conversationId];
      }

      if (this.summaryGenerating[conversationId]) {
        return '';
      }

      const olderMessages = messages.slice(0, messages.length - CONVERSATION_KEEP_RECENT);

      // 第一级：本地正则提取，立即同步返回
      const localSummary = buildLocalStructuredSummary(olderMessages);
      if (localSummary) {
        this.conversationSummaries = {
          ...this.conversationSummaries,
          [conversationId]: localSummary,
        };
        this.persist();
      }

      // 第二级：若本地摘要不够充分，异步请求 LLM 提取
      if (localSummary.length < MIN_LOCAL_SUMMARY_LENGTH || olderMessages.length > 20) {
        this.summaryGenerating = { ...this.summaryGenerating, [conversationId]: true };
        this.persist();

        try {
          const channel = resolveActiveChannelFromSettings(this.settings);
          if (!channel) return localSummary;

          const apiKey = await resolveChannelApiKey(channel.id);

          if (!apiKey) return localSummary;

          const conversationText = olderMessages
            .map((m) => {
              const prefix = m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI' : '系统';
              const text = m.content.length > 300 ? `${m.content.slice(0, 300)}...` : m.content;
              return `${prefix}：${text}`;
            })
            .join('\n');

          const summaryPrompt = `请对以下对话内容进行结构化摘要，要求：
1. 提取讨论的核心主题和用户目标
2. 总结关键结论、决策和方案
3. 列出未完成的行动项或待确认事项
4. 保留重要的具体数据、日期、名称等事实信息
5. 摘要控制在 500 字以内

对话内容：
${conversationText}

请输出结构化摘要：`;

          const provider = channel.provider;
          const model = channel.model;
          const { targetUrl, headers, body } = buildLLMRequestSpec({
            provider,
            baseUrl: channel.baseUrl,
            apiKey,
            model,
            messages: [{ role: 'user', content: summaryPrompt }],
            maxTokens: 600,
          });

          const response = await llmFetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });

          if (!response.ok) return localSummary;

          const data = await response.json();
          const llmSummary = extractProviderReply(provider, data);

          if (llmSummary && llmSummary.length > localSummary.length * 0.5) {
            this.conversationSummaries = {
              ...this.conversationSummaries,
              [conversationId]: llmSummary,
            };
            this.persist();
            return llmSummary;
          }

          return localSummary;
        } catch (error) {
          console.warn('LLM 智能摘要升级失败，使用本地摘要:', error);
          return localSummary;
        } finally {
          this.summaryGenerating = {
            ...this.summaryGenerating,
            [conversationId]: false,
          };
          this.persist();
        }
      }

      return localSummary;
    },

    async resolveDefaultAIDocumentPath(): Promise<string> {
      const configuredPath = this.settings.aiDocumentSavePath.trim();
      if (configuredPath) return configuredPath.replace(/[\\/]+$/, '');

      const baseDir = await documentDir();
      return `${baseDir.replace(/[\\/]+$/, '')}/workgaga/AI-文档`;
    },

    async saveDocumentToLocal(
      title: string,
      content: string,
      options: { vaultPath?: string | null; preferVault?: boolean } = {},
    ): Promise<{ success: boolean; filePath?: string; error?: string; usedFallback?: boolean }> {
      const safeName = title.replace(/[\\/:*?"<>|]/g, '').trim() || '未命名文档';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `${safeName}-${timestamp}.md`;
      const shouldTryVault = Boolean(options.preferVault && options.vaultPath);
      const defaultTargetDir = await this.resolveDefaultAIDocumentPath();
      const configuredSubdir = this.settings.aiDocumentVaultSubdir.trim().replace(/^[/\\]+|[/\\]+$/g, '');
      const vaultTargetDir = shouldTryVault
        ? [options.vaultPath!.replace(/[\\/]+$/, ''), configuredSubdir].filter(Boolean).join('/')
        : '';
      const targetDirs = shouldTryVault ? [vaultTargetDir, defaultTargetDir] : [defaultTargetDir];
      let lastError: unknown;

      for (let index = 0; index < targetDirs.length; index += 1) {
        const targetDir = targetDirs[index];
        try {
          await mkdir(targetDir, { recursive: true });
          const filePath = `${targetDir}/${fileName}`;
          await writeTextFile(filePath, content);
          return { success: true, filePath, usedFallback: shouldTryVault && index > 0 };
        } catch (error) {
          lastError = error;
          console.warn('保存文档到本地失败:', targetDir, error);
        }
      }

      return {
        success: false,
        error: lastError instanceof Error ? lastError.message : '写入本地文件失败',
      };
    },
  },
});
