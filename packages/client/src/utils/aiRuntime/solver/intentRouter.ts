import type { AIIntentDetectionResult, AIProblemIntent } from './types';

const includesAny = (text: string, words: string[]): boolean => words.some((word) => text.includes(word));

const extractUrl = (text: string): string | undefined => text.match(/https?:\/\/[^\s)\]}"'<>]+/i)?.[0];

const extractWeatherCity = (text: string): string | undefined => {
  const match = text.match(/([\u4e00-\u9fa5A-Za-z]+)(?:最近|未来|这几天|今天|明天|后天)?\s*\d*\s*天?天气/);
  return match?.[1];
};

const result = (
  intent: AIProblemIntent,
  confidence: AIIntentDetectionResult['confidence'],
  reasons: string[],
  entities?: Record<string, string>,
): AIIntentDetectionResult => ({ intent, confidence, reasons, entities });

export const detectAIProblemIntent = (input: string): AIIntentDetectionResult => {
  const text = input.trim();
  const normalized = text.toLowerCase();
  const url = extractUrl(text);

  if (url) {
    return result('url_reading', 'high', ['检测到 URL'], { url });
  }

  if (includesAny(normalized, ['天气', '气温', '降雨', '下雨', '台风', '空气质量', 'aqi'])) {
    const city = extractWeatherCity(text);
    return result('weather_query', 'high', ['检测到天气/气象相关问题'], city ? { city } : undefined);
  }

  if (includesAny(normalized, ['日报', '周报', '月报', '工作日报', '工作总结', '复盘', '整理', '总结'])) {
    return result('document_generation', 'high', ['检测到日报/总结整理需求'], { subtype: 'daily_report' });
  }

  if (
    includesAny(normalized, ['最近', '最新', '当前', '现在', '实时', '新闻', '价格', '版本', '发布', '更新', '政策']) ||
    (normalized.includes('今天') && includesAny(normalized, ['新闻', '价格', '版本', '发布', '更新', '政策', '当前']))
  ) {
    return result('realtime_query', 'high', ['检测到实时/最新信息需求']);
  }

  if (
    /(为什么|原因|检查一下|排查)/.test(text) &&
    (/(无法|不能|没法|读不到|没读到).*(读取|获取|访问)/.test(text) ||
      includesAny(normalized, ['软件内活动', '活动摘要', '本地工作记录', '日报记录']))
  ) {
    return result('troubleshooting', 'high', ['检测到本地记录读取失败排查需求']);
  }

  if (includesAny(normalized, ['网页', '网站', '搜索', '查一下', '帮我查', '资料', '调研', '研究'])) {
    return result('web_research', 'medium', ['检测到网页搜索或调研需求']);
  }

  if (includesAny(normalized, ['知识库', '笔记', '文档里', '以前记录', '我的记录', '知识图谱', 'workspace memory'])) {
    return result('knowledge_lookup', 'high', ['检测到本地知识库/笔记查询需求']);
  }

  if (includesAny(normalized, ['写一份', '生成文档', '会议纪要', '报告', '方案', '总结成文档', 'markdown'])) {
    return result('document_generation', 'medium', ['检测到文档生成需求']);
  }

  if (includesAny(normalized, ['待办', 'todo', '任务清单', '行动项', '提醒我'])) {
    return result('todo_planning', 'medium', ['检测到待办/行动项需求']);
  }

  if (includesAny(normalized, ['日程', '安排', '会议', '明天', '后天', '几点', 'calendar'])) {
    return result('schedule_planning', 'medium', ['检测到日程安排需求']);
  }

  if (includesAny(normalized, ['报错', '错误', '异常', '失败', 'bug', '崩溃', 'debug', '修复'])) {
    return result('troubleshooting', 'high', ['检测到故障排查/修复需求']);
  }

  if (includesAny(normalized, ['代码', '函数', '组件', '接口', '类', '方法', '文件', '项目', '实现', '源码'])) {
    if (includesAny(normalized, ['修改', '改成', '新增', '删除', '重构', '实现', '修'])) {
      return result('code_modification', 'high', ['检测到代码修改需求']);
    }
    return result('code_understanding', 'high', ['检测到代码理解/项目分析需求']);
  }

  if (includesAny(normalized, ['对比', '比较', '区别', '优缺点', '选择哪个'])) {
    return result('comparison_analysis', 'medium', ['检测到对比分析需求']);
  }

  if (includesAny(normalized, ['提取', '整理', '表格', '结构化', '转换'])) {
    return result('data_extraction', 'medium', ['检测到信息提取/结构化需求']);
  }

  if (text.length > 20) {
    return result('general_reasoning', 'low', ['未匹配专门意图，按一般推理处理']);
  }

  return result('general_chat', 'low', ['简短通用对话']);
};
