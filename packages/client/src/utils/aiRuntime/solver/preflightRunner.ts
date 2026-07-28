import type { AIRuntimeEvent } from '../types';
import { executeAITool } from '../tools';
import type { AIToolContext, AIToolRegistry } from '../tools';
import { observeToolResult } from './toolObserver';
import type { AITaskCompletionCriteria } from './completionCriteria';
import { evaluateAIEvidencePlan, summarizeAIEvidencePlan, type AIEvidencePlan } from './evidencePlan';
import { planRecoveryActions } from './recoveryPlanner';
import { formatSourceCandidates, generateSourceCandidates } from './sourceCandidateGenerator';
import type { AITaskProfile } from './taskProfile';
import type { AIIntentDetectionResult, AIProblemPolicy, AIPreflightRunResult, AIPreflightToolResult } from './types';

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const todayKey = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractDateKey = (input: string): string | undefined => input.match(/\d{4}-\d{2}-\d{2}/)?.[0];

const extractDays = (input: string): number | undefined => {
  const match = input.match(/(\d+)\s*天/);
  if (!match) return undefined;
  return Math.max(1, Math.min(7, Number(match[1])));
};

const buildToolInput = (
  toolName: string,
  userInput: string,
  detection: AIIntentDetectionResult,
): Record<string, unknown> | null => {
  switch (toolName) {
    case 'weather-forecast':
      return {
        city:
          detection.entities?.city ||
          userInput.replace(/最近|未来|这几天|今天|明天|后天|天气|预报|\d+\s*天/g, '').trim() ||
          userInput,
        days: extractDays(userInput) || 3,
      };
    case 'web-search':
      return {
        query: userInput,
        alternateQueries: [`${userInput} 最新`, `${userInput} 2026`, `${userInput} 官方`, `${userInput} 来源`],
        domainHints: ['官方', '新闻', '数据来源'],
        maxResults: 5,
      };
    case 'web-fetch':
      return detection.entities?.url ? { url: detection.entities.url } : null;
    case 'search-knowledge':
      return { query: userInput, maxSnippets: 5 };
    case 'list-todos': {
      const date = extractDateKey(userInput) || todayKey();
      return { plannedDate: date, status: 'all', maxItems: 100 };
    }
    case 'list-schedules': {
      const date = extractDateKey(userInput) || todayKey();
      return { date, maxItems: 100 };
    }
    case 'list-knowledge-notes': {
      const query = userInput.trim();
      return query ? { query, maxItems: 80 } : { maxItems: 80 };
    }
    case 'collect-daily-report-context': {
      const date = extractDateKey(userInput) || todayKey();
      return { date, refreshKnowledgeIndex: true };
    }
    case 'build-daily-report-brief': {
      const date = extractDateKey(userInput) || todayKey();
      return { date, refreshKnowledgeIndex: false, maxItems: 8 };
    }
    case 'collect-today-work-activities':
      return {};
    case 'build-today-work-report':
      return {};
    case 'search-files':
      return null;
    case 'read-file':
      return null;
    default:
      return null;
  }
};

const extractCandidateUrls = (output: unknown): string[] => {
  if (!output || typeof output !== 'object') return [];
  const results = (output as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string')
    .map((item) => String((item as Record<string, unknown>).url))
    .filter((url, index, list) => url.startsWith('http') && list.indexOf(url) === index)
    .slice(0, 5);
};

const summarizeOutput = (output: unknown): string => {
  try {
    const text = JSON.stringify(output, null, 2);
    return text.length > 6000 ? `${text.slice(0, 6000)}\n[preflight result truncated]` : text;
  } catch {
    return String(output);
  }
};

export const runPreflightTools = async (params: {
  userInput: string;
  detection: AIIntentDetectionResult;
  policy: AIProblemPolicy;
  taskProfile?: AITaskProfile;
  completionCriteria?: AITaskCompletionCriteria;
  evidencePlan?: AIEvidencePlan;
  registry: AIToolRegistry;
  allowedToolNames: string[];
  context?: AIToolContext;
  emit?: (event: AIRuntimeEvent) => void;
}): Promise<AIPreflightRunResult> => {
  const allowed = new Set(params.allowedToolNames);
  const results: AIPreflightToolResult[] = [];
  const recoveryActions: string[] = [];
  const sourceCandidates: string[] = [];
  const evidenceAttempts: string[] = [];
  let recoveryRounds = 0;
  let degraded = false;
  let degradedReason: string | undefined;

  const executePreflightTool = async (
    toolName: string,
    input: Record<string, unknown>,
    fallbackOf?: string,
  ): Promise<AIPreflightToolResult> => {
    const result = await executeAITool({
      registry: params.registry,
      call: {
        id: createId('preflight'),
        name: toolName,
        input,
      },
      context: params.context,
      emit: params.emit,
    });
    const observation = observeToolResult({
      toolName,
      output: result.output,
      error: result.error,
      policy: params.policy,
    });
    return {
      toolName,
      ok: observation.ok,
      output: result.output,
      error: result.error,
      observation,
      fallbackOf,
    };
  };

  for (const toolName of params.policy.requiredTools) {
    if (params.context?.signal?.aborted) break;
    if (!allowed.has(toolName)) continue;
    const input = buildToolInput(toolName, params.userInput, params.detection);
    if (!input) continue;

    const firstResult = await executePreflightTool(toolName, input);
    results.push(firstResult);

    if (!firstResult.observation?.shouldRetry) continue;

    const maxRecoveryAttempts = params.policy.maxRecoveryAttempts ?? params.policy.fallbackTools.length;
    const missingEvidenceKeys = params.evidencePlan
      ? evaluateAIEvidencePlan(params.evidencePlan, results)
          .needs.filter((need) => !need.satisfied)
          .map((need) => need.id)
      : [];
    const actions = planRecoveryActions({
      detection: params.detection,
      policy: params.policy,
      taskProfile: params.taskProfile,
      completionCriteria: params.completionCriteria,
      evidencePlan: params.evidencePlan,
      missingEvidenceKeys,
      failedResult: firstResult,
      previousResults: results,
      userInput: params.userInput,
    });
    let attempts = 0;
    for (const action of actions) {
      if (params.context?.signal?.aborted) break;
      if (action.type === 'degraded_answer') {
        degraded = true;
        degradedReason = action.reason;
        recoveryActions.push(`degraded_answer: ${action.reason}; ${action.userActions.join('；')}`);
        break;
      }
      if (action.type === 'ask_user') {
        recoveryActions.push(`ask_user: ${action.question} (${action.reason})`);
        continue;
      }
      if (action.type === 'use_available_context') {
        recoveryActions.push(`use_available_context: ${action.reason}`);
        continue;
      }
      if (action.type === 'produce_template') {
        recoveryActions.push(`produce_template: ${action.reason}\n${action.template}`);
        continue;
      }
      if (attempts >= maxRecoveryAttempts) break;
      if (!allowed.has(action.toolName)) continue;
      recoveryActions.push(`${action.type}: ${action.toolName} - ${action.reason}`);
      const fallbackResult = await executePreflightTool(action.toolName, action.input, toolName);
      results.push(fallbackResult);
      attempts += 1;
      if (fallbackResult.observation?.ok) break;
    }
  }

  let evaluatedEvidencePlan = params.evidencePlan ? evaluateAIEvidencePlan(params.evidencePlan, results) : undefined;
  let evidenceSummary = evaluatedEvidencePlan ? summarizeAIEvidencePlan(evaluatedEvidencePlan) : undefined;
  const missingEvidenceKeys = evaluatedEvidencePlan
    ? evaluatedEvidencePlan.needs.filter((need) => !need.satisfied).map((need) => need.id)
    : [];

  while (
    params.evidencePlan &&
    evidenceSummary?.missing.some((item) => item.startsWith('external_evidence')) &&
    recoveryRounds < 2 &&
    allowed.has('web-search')
  ) {
    if (params.context?.signal?.aborted) break;
    const candidates = generateSourceCandidates({
      userInput: params.userInput,
      taskProfile: params.taskProfile,
      evidencePlan: evaluatedEvidencePlan,
    });
    const newCandidates = formatSourceCandidates(candidates).filter((item) => !sourceCandidates.includes(item));
    sourceCandidates.push(...newCandidates);
    const query = candidates.find(
      (candidate) => candidate.query && !evidenceAttempts.includes(`search:${candidate.query}`),
    )?.query;
    if (!query) break;

    recoveryRounds += 1;
    evidenceAttempts.push(`search:${query}`);
    recoveryActions.push(`source_candidate_search: ${query}`);
    const searchResult = await executePreflightTool(
      'web-search',
      {
        query,
        alternateQueries: candidates.map((candidate) => candidate.query).filter(Boolean),
        domainHints: ['官方', '新闻', '数据来源'],
        maxResults: 5,
      },
      'source-candidate',
    );
    results.push(searchResult);

    const candidateUrls = extractCandidateUrls(searchResult.output);
    if (candidateUrls.length && allowed.has('web-fetch')) {
      evidenceAttempts.push(`fetch:${candidateUrls.join(',')}`);
      const fetchResult = await executePreflightTool(
        'web-fetch',
        { url: candidateUrls[0], candidateUrls },
        'source-candidate',
      );
      results.push(fetchResult);
    }

    evaluatedEvidencePlan = evaluateAIEvidencePlan(params.evidencePlan, results);
    evidenceSummary = summarizeAIEvidencePlan(evaluatedEvidencePlan);
    if (!evidenceSummary.missing.some((item) => item.startsWith('external_evidence'))) break;
  }

  const injectedContext = results.length
    ? [
        '# Preflight tool results',
        'The runtime executed required tools before asking the model to answer. Use these results as evidence. Do not claim the tools were unavailable if there is a successful result below.',
        ...results.map(
          (result) =>
            `## ${result.toolName}${result.fallbackOf ? ` (fallback of ${result.fallbackOf})` : ''}\nstatus: ${result.ok ? 'ok' : 'error'}\nobservation: ${result.observation?.summary || '-'}\nconfidence: ${result.observation?.confidence || 'low'}\n${result.ok ? summarizeOutput(result.output) : (result.error ?? summarizeOutput(result.output))}`,
        ),
        missingEvidenceKeys.length
          ? `# Missing evidence keys\n${missingEvidenceKeys.map((item) => `- ${item}`).join('\n')}`
          : '',
        evidenceSummary?.satisfied.length
          ? `# Satisfied evidence needs\n${evidenceSummary.satisfied.map((item) => `- ${item}`).join('\n')}`
          : '',
        evidenceSummary?.missing.length
          ? `# Missing evidence needs\n${evidenceSummary.missing.map((item) => `- ${item}`).join('\n')}`
          : '',
        sourceCandidates.length ? `# Source candidates\n${sourceCandidates.map((item) => `- ${item}`).join('\n')}` : '',
        evidenceAttempts.length ? `# Evidence attempts\n${evidenceAttempts.map((item) => `- ${item}`).join('\n')}` : '',
        recoveryActions.length
          ? `# Recovery actions\n${recoveryActions.map((action) => `- ${action}`).join('\n')}`
          : '',
        degraded ? `# Degraded completion\nreason: ${degradedReason || 'recovery exhausted'}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';

  return {
    results,
    injectedContext,
    recoveryActions,
    degraded,
    degradedReason,
    satisfiedEvidence: evidenceSummary?.satisfied,
    missingEvidence: evidenceSummary?.missing,
    missingEvidenceKeys,
    recoveryRounds,
    sourceCandidates,
    evidenceAttempts,
  };
};
