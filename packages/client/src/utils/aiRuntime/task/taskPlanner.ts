import type { AIIntentDetectionResult, AIProblemPolicy } from '../solver';
import type { AITaskStep, AITaskStepType } from './taskTypes';

const createStep = (params: {
  index: number;
  title: string;
  type: AITaskStepType;
  requiredEvidence?: string[];
  preferredTools?: string[];
  fallbackTools?: string[];
  verificationCriteria?: string[];
}): AITaskStep => ({
  id: `step-${params.index}`,
  title: params.title,
  type: params.type,
  status: 'pending',
  requiredEvidence: params.requiredEvidence ?? [],
  preferredTools: params.preferredTools ?? [],
  fallbackTools: params.fallbackTools ?? [],
  verificationCriteria: params.verificationCriteria ?? [],
});

export const buildTaskPlan = (params: {
  detection: AIIntentDetectionResult;
  policy: AIProblemPolicy;
}): AITaskStep[] => {
  const { detection, policy } = params;

  switch (detection.intent) {
    case 'weather_query':
      return [
        createStep({ index: 1, title: '识别地点与时间范围', type: 'analyze_goal', verificationCriteria: ['包含地点', '包含时间范围'] }),
        createStep({ index: 2, title: '获取天气数据', type: 'run_required_tool', requiredEvidence: ['天气预报数据'], preferredTools: ['weather-forecast'], fallbackTools: policy.fallbackTools }),
        createStep({ index: 3, title: '可信来源 fallback', type: 'fallback_search', requiredEvidence: ['搜索结果或网页来源'], preferredTools: policy.fallbackTools, fallbackTools: ['web-search', 'web-fetch'] }),
        createStep({ index: 4, title: '提取天气证据', type: 'extract_evidence', requiredEvidence: ['日期', '天气', '温度', '来源'], verificationCriteria: ['至少覆盖用户要求的天数'] }),
        createStep({ index: 5, title: '生成天气建议', type: 'finalize', verificationCriteria: ['回答包含来源', '回答说明不确定性'] }),
      ];
    case 'realtime_query':
    case 'web_research':
      return [
        createStep({ index: 1, title: '明确实时查询目标', type: 'analyze_goal' }),
        createStep({ index: 2, title: '搜索最新信息', type: 'run_required_tool', requiredEvidence: ['搜索结果'], preferredTools: ['web-search'], fallbackTools: policy.fallbackTools }),
        createStep({ index: 3, title: '抓取并交叉验证来源', type: 'fallback_search', requiredEvidence: ['网页内容或多个来源'], preferredTools: ['web-fetch'] }),
        createStep({ index: 4, title: '提取结论和来源', type: 'extract_evidence', verificationCriteria: ['包含来源', '包含时间敏感说明'] }),
        createStep({ index: 5, title: '生成研究结论', type: 'finalize' }),
      ];
    case 'url_reading':
      return [
        createStep({ index: 1, title: '识别 URL 和阅读目标', type: 'analyze_goal' }),
        createStep({ index: 2, title: '抓取 URL 内容', type: 'run_required_tool', requiredEvidence: ['网页正文'], preferredTools: ['web-fetch'] }),
        createStep({ index: 3, title: '提取重点信息', type: 'extract_evidence' }),
        createStep({ index: 4, title: '生成摘要或回答', type: 'finalize' }),
      ];
    case 'knowledge_lookup':
      return [
        createStep({ index: 1, title: '明确知识库查询目标', type: 'analyze_goal' }),
        createStep({ index: 2, title: '检索知识库', type: 'run_required_tool', requiredEvidence: ['知识库片段'], preferredTools: ['search-knowledge'], fallbackTools: policy.fallbackTools }),
        createStep({ index: 3, title: '整合知识库证据', type: 'extract_evidence' }),
        createStep({ index: 4, title: '生成回答', type: 'finalize' }),
      ];
    case 'code_understanding':
      return [
        createStep({ index: 1, title: '明确代码理解目标', type: 'analyze_goal' }),
        createStep({ index: 2, title: '定位相关文件', type: 'collect_context', preferredTools: ['list-files', 'search-files'] }),
        createStep({ index: 3, title: '读取关键上下文', type: 'run_required_tool', requiredEvidence: ['相关文件内容'], preferredTools: ['read-file'] }),
        createStep({ index: 4, title: '解释代码逻辑', type: 'finalize', verificationCriteria: ['引用已读文件证据'] }),
      ];
    case 'code_modification':
    case 'troubleshooting':
      return [
        createStep({ index: 1, title: '定位问题和相关文件', type: 'collect_context', preferredTools: ['list-files', 'search-files'] }),
        createStep({ index: 2, title: '读取关键代码证据', type: 'run_required_tool', requiredEvidence: ['相关文件内容'], preferredTools: ['read-file'] }),
        createStep({ index: 3, title: '生成结构化修改计划', type: 'plan_change', verificationCriteria: ['包含文件', '包含原因', '包含验证方式'] }),
        createStep({ index: 4, title: '等待用户批准计划', type: 'request_approval' }),
        createStep({ index: 5, title: '执行代码修改', type: 'write_change', preferredTools: ['write-file', 'apply-patch'] }),
        createStep({ index: 6, title: '运行验证命令', type: 'run_verification', preferredTools: ['run-check'] }),
        createStep({ index: 7, title: '总结变更和风险', type: 'finalize' }),
      ];
    case 'document_generation':
      if (policy.requiredTools.length > 0) {
        return [
          createStep({ index: 1, title: '明确文档目标', type: 'analyze_goal' }),
          createStep({
            index: 2,
            title: '执行必需文档工具',
            type: 'run_required_tool',
            requiredEvidence: ['文档生成所需的预处理结果'],
            preferredTools: policy.requiredTools,
            fallbackTools: policy.fallbackTools,
          }),
          createStep({ index: 3, title: '收集补充文档上下文', type: 'collect_context', preferredTools: ['read-context', 'search-knowledge'] }),
          createStep({ index: 4, title: '生成文档内容', type: 'finalize' }),
          createStep({ index: 5, title: '按需保存文档', type: 'write_change', preferredTools: ['save-document'] }),
        ];
      }
      return [
        createStep({ index: 1, title: '明确文档目标', type: 'analyze_goal' }),
        createStep({ index: 2, title: '收集文档上下文', type: 'collect_context', preferredTools: ['read-context', 'search-knowledge'] }),
        createStep({ index: 3, title: '生成文档内容', type: 'finalize' }),
        createStep({ index: 4, title: '按需保存文档', type: 'write_change', preferredTools: ['save-document'] }),
      ];
    case 'todo_planning':
    case 'schedule_planning':
      return [
        createStep({ index: 1, title: '识别任务管理意图', type: 'analyze_goal' }),
        createStep({ index: 2, title: '创建或更新任务', type: 'write_change', preferredTools: ['create-todo', 'create-schedule'] }),
        createStep({ index: 3, title: '确认任务结果', type: 'finalize' }),
      ];
    case 'comparison_analysis':
    case 'data_extraction':
    case 'general_reasoning':
    case 'general_chat':
    default:
      return [
        createStep({ index: 1, title: '理解用户问题', type: 'analyze_goal' }),
        createStep({ index: 2, title: '生成回答', type: 'finalize' }),
      ];
  }
};
