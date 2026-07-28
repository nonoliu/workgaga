import type { AICodeChangePlanGate, AICodeEvidenceRunResult, AIIntentDetectionResult } from './types';

const writeTools = ['write-file', 'apply-patch'];

export const buildCodeChangePlanGate = (params: {
  detection: AIIntentDetectionResult;
  codeEvidence?: AICodeEvidenceRunResult;
}): AICodeChangePlanGate => {
  const required = params.detection.intent === 'code_modification' || params.detection.intent === 'troubleshooting';
  const evidenceReady = Boolean(params.codeEvidence?.ok);
  const instructions = required
    ? [
      'Before using write-file or apply-patch, produce a concise structured code change plan in the assistant response or tool rationale.',
      'The plan must include files to change, reasons, evidence that was read, and verification expectations so Runtime can parse an active plan.',
      'If code evidence is missing, ask for the project path or relevant file before writing.',
      'Do not write broad unrelated changes. Write tools may only modify files explicitly listed in the structured plan.',
    ]
    : [];

  return {
    required,
    blockingTools: required ? writeTools : [],
    evidenceReady,
    instructions,
    context: required
      ? [
        '# Code change plan gate',
        `required: ${required}`,
        `evidenceReady: ${evidenceReady}`,
        `blockedWriteTools: ${writeTools.join(', ')}`,
        'Required plan fields:',
        '- files to change',
        '- reason for each change',
        '- evidence already read',
        '- verification to run or limitation if verification is unavailable',
      ].join('\n')
      : '',
  };
};
