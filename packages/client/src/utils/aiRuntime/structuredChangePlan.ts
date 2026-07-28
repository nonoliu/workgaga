import type { AIToolStructuredChangePlan } from './tools';

const createPlanId = (text: string): string => {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `plan-${Math.abs(hash).toString(36)}`;
};

const extractListValues = (text: string, labels: string[]): string[] => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const values: string[] = [];

  for (const line of lines) {
    const normalized = line.toLowerCase();
    if (!labels.some((label) => normalized.includes(label))) continue;
    const value = line
      .replace(/^[-*\d.\s]+/, '')
      .replace(/^(文件|files?|原因|reason|依据|evidence|验证|verification|test|check)[:：]/i, '')
      .trim();
    if (value) values.push(value);
  }

  return values;
};

const extractFilePaths = (text: string): string[] => {
  const explicit = extractListValues(text, ['文件', 'file', 'path']);
  const matched = Array.from(text.matchAll(/(?:\/[^\s:'"`]+|[\w./-]+\.(?:ts|tsx|js|jsx|vue|json|md|css|scss))/g)).map((match) => match[0]);
  return Array.from(new Set([...explicit, ...matched])).slice(0, 10);
};

export const parseStructuredChangePlan = (text?: string): AIToolStructuredChangePlan | undefined => {
  if (!text) return undefined;
  const normalized = text.toLowerCase();
  if (!/修改计划|change plan|structured change plan|代码修改计划/.test(normalized)) return undefined;

  const files = extractFilePaths(text);
  const reasons = extractListValues(text, ['原因', 'reason', 'why', '修复', 'because']);
  const evidence = extractListValues(text, ['依据', 'evidence', '已读', 'read']);
  const verification = extractListValues(text, ['验证', 'verification', 'test', 'check', 'build']);

  if (!files.length || !reasons.length || !verification.length) return undefined;

  return {
    id: createPlanId(`${files.join('|')}|${reasons.join('|')}|${verification.join('|')}`),
    files,
    reasons,
    evidence,
    verification,
  };
};
