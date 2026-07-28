import { collectAssistantTodayActivities, diagnoseAssistantTodayWork } from './adapters/assistantAdapter';
import {
  collectFileDashboardTodayActivities,
  diagnoseFileDashboardTodayWork,
  loadPersistedFileDashboardState,
} from './adapters/fileDashboardAdapter';
import type {
  InsightCard,
  TodayWorkReportBrief,
  TomorrowPlanSections,
  WorkActivityCollectionResult,
  WorkActivityItem,
  WorkActivitySourceDiagnostic,
} from './types';

export const getTodayRange = (): { date: string; startAt: number; endAt: number } => {
  const now = new Date();
  const startAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const endAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { date, startAt, endAt };
};

const getActivityWeight = (item: WorkActivityItem): number => {
  if (item.source === 'assistant.task_run') return 100;
  if (item.source === 'assistant.timeline') return 90;
  if (item.kind === 'file_saved') return 80;
  if (item.kind === 'todo_completed') return 70;
  if (item.kind === 'schedule_event') return 60;
  if (item.kind === 'todo_updated') return 50;
  if (item.kind === 'file_opened') return 40;
  if (item.kind === 'todo_planned') return 30;
  return 10;
};

const sortActivities = (items: WorkActivityItem[]): WorkActivityItem[] =>
  [...items].sort((left, right) => {
    const weight = getActivityWeight(right) - getActivityWeight(left);
    if (weight !== 0) return weight;
    return right.timestamp - left.timestamp;
  });

const dedupeActivities = (items: WorkActivityItem[]): WorkActivityItem[] => {
  const seen = new Set<string>();
  const results: WorkActivityItem[] = [];
  for (const item of items) {
    const minuteBucket = Math.floor(item.timestamp / 60_000);
    const key = `${item.source}|${item.kind}|${item.title}|${minuteBucket}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
};

const computeCoverageScore = (params: { activities: WorkActivityItem[] }): number => {
  let score = 0;
  const hasAssistant = params.activities.some((item) => item.source.startsWith('assistant.'));
  const hasFiles = params.activities.some((item) => item.source === 'workspace.file');
  const hasDashboard = params.activities.some((item) => item.source.startsWith('dashboard.'));
  const enoughActivities = params.activities.length >= 3;

  if (hasAssistant) score += 0.4;
  if (hasFiles) score += 0.25;
  if (hasDashboard) score += 0.2;
  if (enoughActivities) score += 0.15;

  return Math.min(1, Number(score.toFixed(2)));
};

const uniqueStrings = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));
const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const looksLikeMeeting = (text: string): boolean => /会议|同步|沟通|评审|讨论/i.test(text);
const looksLikeRisk = (text: string): boolean => /失败|阻塞|问题|报错|异常|待确认|风险/i.test(text);

const stripActivityPrefix = (text: string): string =>
  text
    .replace(/^(完成待办|更新待办|今日待办|完成任务|开始任务|保存文件|打开文件|日程|用户提出|AI 产出)\s*[:：]\s*/i, '')
    .trim();

const normalizeComparableText = (text: string): string =>
  stripActivityPrefix(text)
    .toLowerCase()
    .replace(/[：:()（）\[\]【】"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTopicText = (text: string): string =>
  stripActivityPrefix(text)
    .toLowerCase()
    .replace(/^(继续跟进|继续推进|继续完善|继续处理|继续|跟进|推进|处理|完善|优化|整理\/推进|整理并推进|整理|确认|排查)\s*/i, '')
    .replace(/(相关事项|后续事项|后续工作|后续计划|工作内容|事项)$/i, '')
    .replace(/[：:()（）\[\]【】"'`]/g, ' ')
    .replace(/并|以及|及|和|与|的|后续|事项|相关/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isMetaReportTask = (text: string): boolean => /日报|工作记录|整理产出|整理一下今天日报|生成今日日报/i.test(text);
const isRuntimeMetaText = (text: string): boolean =>
  /选择问题策略|执行必需文档工具|收集补充文档上下文|验证回答证据|自主执行任务准备步骤|自动启用 Skill|工具 .* 执行完成|生成今日日报摘要/i.test(
    text,
  );

const pickTitles = (items: WorkActivityItem[], max = 5): string[] =>
  uniqueStrings(
    items
      .map((item) => stripActivityPrefix(item.title))
      .filter((title) => title && !isMetaReportTask(title) && !isRuntimeMetaText(title)),
  ).slice(0, max);

const buildNextPlanCandidates = (params: {
  completedItems: WorkActivityItem[];
  inProgressItems: WorkActivityItem[];
  nextPlanItems: WorkActivityItem[];
  riskItems: WorkActivityItem[];
  meetingItems: WorkActivityItem[];
}): string[] => {
  const completedSet = new Set(params.completedItems.map((item) => normalizeComparableText(item.title)).filter(Boolean));
  const used = new Set<string>();
  const plans: string[] = [];

  const pushPlan = (text: string): void => {
    const cleaned = text.trim();
    const normalized = normalizeComparableText(cleaned);
    if (!cleaned || !normalized || used.has(normalized)) return;
    used.add(normalized);
    plans.push(cleaned);
  };

  for (const item of params.inProgressItems) {
    const subject = stripActivityPrefix(item.title);
    const normalized = normalizeComparableText(subject);
    if (!subject || completedSet.has(normalized) || isMetaReportTask(subject)) continue;
    if (item.kind === 'file_saved' || item.kind === 'file_opened') continue;
    pushPlan(`继续推进${subject}`);
  }

  for (const item of params.riskItems) {
    const subject = stripActivityPrefix(item.title);
    const normalized = normalizeComparableText(subject);
    if (!subject || used.has(normalized) || isMetaReportTask(subject)) continue;
    pushPlan(`跟进${subject}`);
  }

  for (const item of params.nextPlanItems) {
    const subject = stripActivityPrefix(item.title);
    const normalized = normalizeComparableText(subject);
    if (!subject || completedSet.has(normalized) || used.has(normalized) || isMetaReportTask(subject)) continue;
    pushPlan(`推进${subject}`);
  }

  for (const item of params.meetingItems) {
    const subject = stripActivityPrefix(item.title);
    const normalized = normalizeComparableText(subject);
    if (!subject || used.has(normalized) || isMetaReportTask(subject)) continue;
    pushPlan(`跟进${subject}的后续事项`);
  }

  return plans.slice(0, 5);
};

const buildTomorrowSchedulePlans = (schedules: Array<{ title: string; date: string; startTime?: string; endTime?: string }>): string[] =>
  schedules.map((schedule) => {
    const timeRange =
      schedule.startTime && schedule.endTime
        ? `（${schedule.startTime}-${schedule.endTime}）`
        : schedule.startTime
          ? `（${schedule.startTime}）`
          : '';
    return `明日日程：${schedule.title}${timeRange}`;
  });

const buildUnfinishedTodoPlans = (
  todos: Array<{ content: string; plannedDate: string; priority?: 'low' | 'medium' | 'high' }>,
  tomorrowDate: string,
): string[] =>
  todos.map((todo) => {
    if (todo.plannedDate === tomorrowDate) return `未完成待办：${todo.content}`;
    if (todo.plannedDate < tomorrowDate) return `未完成待办：${todo.content}（原计划 ${todo.plannedDate}）`;
    return `未完成待办：${todo.content}（计划 ${todo.plannedDate}）`;
  });

const formatTomorrowPlanSection = (title: string, items: string[]): string[] => [
  `### ${title}`,
  ...(items.length ? items.map((item) => `- ${item}`) : ['- 暂无明确记录']),
];

const formatInsightCard = (card: InsightCard, index: number): string[] => [
  `### 洞察 ${index + 1}：${card.title}`,
  `- 现象证据：${card.evidence.join('；') || '暂无直接证据'}`,
  `- 当前不足：${card.gap}`,
  `- 影响判断：${card.impact}`,
  `- 下一步建议：${card.nextAction}`,
  `- 做事方法建议：${card.methodAdvice}`,
];

const createInsightCard = (card: InsightCard): InsightCard => card;

interface InsightTopicProfile {
  topic: string;
  completed: string[];
  inProgress: string[];
  risks: string[];
  plans: string[];
  activities: string[];
}

const appendProfileEntry = (items: string[], value: string): string[] => (items.includes(value) ? items : [...items, value]);

const buildInsightTopicProfiles = (params: {
  completed: string[];
  inProgress: string[];
  risks: string[];
  tomorrowPlanSections: TomorrowPlanSections;
  activities: WorkActivityItem[];
}): InsightTopicProfile[] => {
  const profiles = new Map<string, InsightTopicProfile>();
  const ensureProfile = (raw: string): InsightTopicProfile | undefined => {
    const topic = normalizeTopicText(raw);
    if (!topic || isMetaReportTask(raw) || isRuntimeMetaText(raw)) return undefined;
    const current = profiles.get(topic);
    if (current) return current;
    const created: InsightTopicProfile = {
      topic,
      completed: [],
      inProgress: [],
      risks: [],
      plans: [],
      activities: [],
    };
    profiles.set(topic, created);
    return created;
  };

  for (const item of params.completed) {
    const profile = ensureProfile(item);
    if (profile) profile.completed = appendProfileEntry(profile.completed, item);
  }
  for (const item of params.inProgress) {
    const profile = ensureProfile(item);
    if (profile) profile.inProgress = appendProfileEntry(profile.inProgress, item);
  }
  for (const item of params.risks) {
    const profile = ensureProfile(item);
    if (profile) profile.risks = appendProfileEntry(profile.risks, item);
  }
  for (const item of [...params.tomorrowPlanSections.unfinishedTodos, ...params.tomorrowPlanSections.followUps]) {
    const profile = ensureProfile(item);
    if (profile) profile.plans = appendProfileEntry(profile.plans, item);
  }
  for (const item of params.activities) {
    const title = stripActivityPrefix(item.title);
    const profile = ensureProfile(title);
    if (profile) profile.activities = appendProfileEntry(profile.activities, title);
  }

  return Array.from(profiles.values()).sort((left, right) => {
    const leftScore = left.inProgress.length + left.risks.length + left.plans.length + left.activities.length;
    const rightScore = right.inProgress.length + right.risks.length + right.plans.length + right.activities.length;
    return rightScore - leftScore;
  });
};

const buildMethodRecipe = (steps: string[]): string => steps.map((step, index) => `${index + 1}.${step}`).join(' ');

const buildInsightCards = (params: {
  completed: string[];
  inProgress: string[];
  risks: string[];
  meetings: string[];
  tomorrowPlanSections: TomorrowPlanSections;
  activities: WorkActivityItem[];
}): InsightCard[] => {
  const cards: InsightCard[] = [];
  const filteredActivities = params.activities.filter((item) => {
    const title = stripActivityPrefix(item.title);
    return title && !isMetaReportTask(title) && !isRuntimeMetaText(title);
  });
  const topicProfiles = buildInsightTopicProfiles({
    completed: params.completed,
    inProgress: params.inProgress,
    risks: params.risks,
    tomorrowPlanSections: params.tomorrowPlanSections,
    activities: filteredActivities,
  });

  const topicCount = new Map<string, number>();
  for (const item of filteredActivities) {
    const topic = normalizeTopicText(item.title);
    if (!topic) continue;
    topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
  }

  const repeatedTopics = Array.from(topicCount.entries())
    .filter(([, count]) => count >= 2)
    .map(([topic]) => topic)
    .slice(0, 3);
  const hasRepeatedInProgress = params.inProgress.length > 0 && params.tomorrowPlanSections.followUps.length > 0;
  const persistentProfile = topicProfiles.find(
    (profile) => profile.inProgress.length > 0 && (profile.risks.length > 0 || profile.plans.length > 0),
  );
  if (hasRepeatedInProgress || repeatedTopics.length > 0 || persistentProfile) {
    cards.push(
      createInsightCard({
        title: '当前推进更多停留在持续跟进，说明闭环设计而不是执行力度存在短板',
        evidence: uniqueStrings([
          ...(persistentProfile?.inProgress ?? []).slice(0, 2),
          ...(persistentProfile?.risks ?? []).slice(0, 1),
          ...(persistentProfile?.plans ?? []).slice(0, 1),
          ...params.inProgress.slice(0, 2),
          ...params.tomorrowPlanSections.followUps.slice(0, 2),
          ...repeatedTopics.map((topic) => `同一主题多次出现：${topic}`),
        ]).slice(0, 4),
        gap: '同一主题横跨进行中、风险和后续计划，说明问题不在于是否推进，而在于没有把任务设计成可验证、可退出、可关闭的闭环。',
        impact: '如果继续按“持续跟进”推进，任务会不断消耗注意力，但很难形成稳定的完成感和可复用的方法沉淀。',
        nextAction: '先挑出最反复出现的一个主题，补齐完成定义、验证动作、阻塞条件和退出标准，再按闭环方式推进。',
        methodAdvice: buildMethodRecipe([
          '先写清“什么状态算解决”',
          '再定义验证动作和证据',
          '最后补充阻塞条件与升级路径',
        ]),
      }),
    );
  }

  const temporarySignals = filteredActivities
    .map((item) => stripActivityPrefix(item.title))
    .filter((title) => /临时|授权|应急|补救|绕过/i.test(title));
  if (temporarySignals.length > 0) {
    cards.push(
      createInsightCard({
        title: '今天出现临时性处理动作，说明问题处理仍偏应急响应',
        evidence: uniqueStrings(temporarySignals).slice(0, 3),
        gap: '当前更强调先恢复可用，但对临时动作的失效条件、正式替代方案和回收动作记录还不够强。',
        impact: '短期能快速止损，但如果后续没有转正方案，容易沉积配置债、权限债和重复排查成本。',
        nextAction: '把所有临时处理动作补充为“为什么临时、保留多久、何时转正式、如何回收”的明确记录。',
        methodAdvice: buildMethodRecipe([
          '记录临时动作的触发原因',
          '写清保留时限和回收条件',
          '同步补一条正式替代方案',
        ]),
      }),
    );
  }

  const unfinishedCount = params.tomorrowPlanSections.unfinishedTodos.length;
  const scheduleCount = params.tomorrowPlanSections.schedules.length;
  if (unfinishedCount >= 3 || (unfinishedCount > 0 && scheduleCount > 0)) {
    cards.push(
      createInsightCard({
        title: '明日任务承接较满，优先级管理需要再前置一步',
        evidence: [
          `未完成待办 ${unfinishedCount} 项`,
          `明日日程 ${scheduleCount} 项`,
          ...params.tomorrowPlanSections.unfinishedTodos.slice(0, 2),
        ].slice(0, 4),
        gap: '明日计划中同时存在日程承诺和较多遗留待办，说明任务承接已经形成堆叠，但优先级取舍还不够显式。',
        impact: '如果明天继续按并行方式推进，容易出现每件事都在动，但真正高价值事项没有优先收口。',
        nextAction: '明天开始前先明确“必须完成、可以推进、可延后”三层优先级，先保证最关键事项有完整时间块。',
        methodAdvice: buildMethodRecipe([
          '先定 1-2 个必须完成项',
          '再安排时间块对应关键任务',
          '最后把其余事项归入推进或延后',
        ]),
      }),
    );
  }

  const optimizationSignals = uniqueStrings(
    [...params.inProgress, ...params.risks].filter((item) => /优化|策略|方案|日志|存储|架构/i.test(item)),
  );
  if (optimizationSignals.length > 0) {
    cards.push(
      createInsightCard({
        title: '优化类工作已经出现，但还需要更强的验收标准和沉淀意识',
        evidence: optimizationSignals.slice(0, 3),
        gap: '当前优化任务已经进入推进列表，但从记录上看，更多体现为“继续推进”，还缺少量化验收标准和方法沉淀。',
        impact: '这类工作如果没有明确指标，容易长期停留在优化中，最终难以判断是否真正完成或产生复用价值。',
        nextAction: '为每项优化任务补充结果指标，例如容量、性能、稳定性或可维护性目标，并同步记录可复用的方法。',
        methodAdvice: buildMethodRecipe([
          '先定义优化指标',
          '再确认验证方式',
          '最后把方案沉淀成可复用标准',
        ]),
      }),
    );
  }

  return cards.slice(0, 4);
};

export const diagnoseTodayWorkSources = (): WorkActivitySourceDiagnostic[] => {
  const { startAt, endAt } = getTodayRange();
  const persistedState = loadPersistedFileDashboardState();

  return [
    diagnoseAssistantTodayWork({ startAt, endAt }),
    ...diagnoseFileDashboardTodayWork({
      startAt,
      endAt,
      recentFiles: persistedState.recentFiles,
      todos: persistedState.todos,
      schedules: persistedState.schedules,
    }),
  ];
};

export const collectTodayWorkActivities = (): WorkActivityCollectionResult => {
  const { date, startAt, endAt } = getTodayRange();
  const persistedState = loadPersistedFileDashboardState();

  const diagnostics = diagnoseTodayWorkSources();
  const activities = dedupeActivities(
    sortActivities([
      ...collectAssistantTodayActivities({ startAt, endAt }),
      ...collectFileDashboardTodayActivities({
        startAt,
        endAt,
        recentFiles: persistedState.recentFiles,
        todos: persistedState.todos,
        schedules: persistedState.schedules,
      }),
    ]),
  );

  const sourceStats = activities.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.source] = (accumulator[item.source] || 0) + 1;
    return accumulator;
  }, {});

  return {
    date,
    diagnostics,
    activities,
    coverageScore: computeCoverageScore({ activities }),
    sourceStats,
  };
};

export const buildTodayWorkReportBrief = (): TodayWorkReportBrief => {
  const result = collectTodayWorkActivities();
  const persistedState = loadPersistedFileDashboardState();
  const tomorrowDate = toDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const completedItems = result.activities.filter(
    (item) => item.kind === 'task_completed' || item.kind === 'todo_completed',
  );
  const completedTopicSet = new Set(completedItems.map((item) => normalizeTopicText(item.title)).filter(Boolean));
  const inProgressItems = result.activities.filter((item) => {
    if (!(item.kind === 'todo_updated' || item.kind === 'file_saved' || item.kind === 'task_started')) return false;
    const normalizedTopic = normalizeTopicText(item.title);
    return !normalizedTopic || !completedTopicSet.has(normalizedTopic);
  });
  const meetingItems = result.activities.filter(
    (item) => item.kind === 'schedule_event' || looksLikeMeeting(`${item.title} ${item.detail || ''}`),
  );
  const riskItems = result.activities.filter((item) => looksLikeRisk(`${item.title} ${item.detail || ''}`));
  const nextPlanItems = result.activities.filter((item) => item.kind === 'todo_planned');
  const unfinishedTodos = persistedState.todos
    .filter((todo) => !todo.completed)
    .sort((left, right) => {
      if (left.plannedDate !== right.plannedDate) return left.plannedDate.localeCompare(right.plannedDate);
      const priorityScore = (priority?: 'low' | 'medium' | 'high'): number =>
        priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
      return priorityScore(right.priority) - priorityScore(left.priority) || right.updatedAt - left.updatedAt;
    });
  const tomorrowSchedules = persistedState.schedules
    .filter((schedule) => schedule.date === tomorrowDate)
    .sort((left, right) => (left.startTime || '').localeCompare(right.startTime || ''));

  const completed = pickTitles(completedItems);
  const inProgress = pickTitles(inProgressItems);
  const meetings = pickTitles(meetingItems);
  const risks = pickTitles(riskItems);
  const inferredNextPlan = buildNextPlanCandidates({
    completedItems,
    inProgressItems,
    nextPlanItems,
    riskItems,
    meetingItems,
  });
  const tomorrowPlanSections: TomorrowPlanSections = {
    schedules: buildTomorrowSchedulePlans(tomorrowSchedules),
    unfinishedTodos: buildUnfinishedTodoPlans(unfinishedTodos, tomorrowDate),
    followUps: inferredNextPlan,
  };
  const nextPlan = uniqueStrings([
    ...tomorrowPlanSections.schedules,
    ...tomorrowPlanSections.unfinishedTodos,
    ...tomorrowPlanSections.followUps,
  ]);
  const insightCards = buildInsightCards({
    completed,
    inProgress,
    risks,
    meetings,
    tomorrowPlanSections,
    activities: result.activities,
  });
  const evidenceSources = uniqueStrings(result.activities.map((item) => item.source));
  const emptySources = result.diagnostics.filter((item) => item.status === 'empty').map((item) => item.source);

  const reportMarkdown = [
    `# 今日日报（${result.date}）`,
    '',
    '## 一、今日完成',
    ...(completed.length ? completed.map((item) => `- ${item}`) : ['- 暂无明确记录']),
    '',
    '## 二、进行中事项',
    ...(inProgress.length ? inProgress.map((item) => `- ${item}`) : ['- 暂无明确记录']),
    '',
    '## 三、会议与沟通',
    ...(meetings.length ? meetings.map((item) => `- ${item}`) : ['- 暂无明确记录']),
    '',
    '## 四、问题与风险',
    ...(risks.length ? risks.map((item) => `- ${item}`) : ['- 暂无明确记录']),
    '',
    '## 五、明日计划',
    ...formatTomorrowPlanSection('明日日程', tomorrowPlanSections.schedules),
    '',
    ...formatTomorrowPlanSection('未完成待办', tomorrowPlanSections.unfinishedTodos),
    '',
    ...formatTomorrowPlanSection('风险跟进', tomorrowPlanSections.followUps),
    '',
    '## 六、证据来源',
    ...(evidenceSources.length ? evidenceSources.map((item) => `- ${item}`) : ['- 暂无命中来源']),
    '',
    '## 七、洞察分析',
    ...(insightCards.length
      ? insightCards.flatMap((card, index) => [...formatInsightCard(card, index), '']).slice(0, -1)
      : ['- 暂无明确洞察']),
  ].join('\n');

  return {
    date: result.date,
    completed,
    inProgress,
    meetings,
    risks,
    nextPlan,
    tomorrowPlanSections,
    insightCards,
    evidenceSources,
    coverageScore: result.coverageScore,
    diagnostics: result.diagnostics,
    reportMarkdown,
    methodTrace: {
      sourceOrder: ['assistant', 'workspace.file', 'dashboard'],
      usedSources: evidenceSources,
      emptySources,
    },
  };
};
