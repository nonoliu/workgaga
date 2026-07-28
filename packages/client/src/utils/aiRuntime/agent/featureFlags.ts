export interface AIAgentFeatureFlags {
  enabled: boolean;
  autoRouteEnabled: boolean;
  verifierEnabled: boolean;
  customAgentsEnabled: boolean;
  backgroundEnabled: boolean;
  promptGuidanceEnabled: boolean;
  taskProfileEnabled: boolean;
  evidencePlanEnabled: boolean;
  recoveryPlannerV2Enabled: boolean;
  clarificationLoopEnabled: boolean;
}

export const DEFAULT_AI_AGENT_FEATURE_FLAGS: AIAgentFeatureFlags = {
  enabled: true,
  autoRouteEnabled: true,
  verifierEnabled: true,
  customAgentsEnabled: true,
  backgroundEnabled: true,
  promptGuidanceEnabled: true,
  taskProfileEnabled: true,
  evidencePlanEnabled: true,
  recoveryPlannerV2Enabled: true,
  clarificationLoopEnabled: true,
};

const STORAGE_KEY = 'aiRuntime.agent.featureFlags';

const readOverrides = (): Partial<AIAgentFeatureFlags> => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AIAgentFeatureFlags>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'boolean'),
    ) as Partial<AIAgentFeatureFlags>;
  } catch {
    return {};
  }
};

export const getAIAgentFeatureFlags = (): AIAgentFeatureFlags => ({
  ...DEFAULT_AI_AGENT_FEATURE_FLAGS,
  ...readOverrides(),
});

export const setAIAgentFeatureFlags = (flags: Partial<AIAgentFeatureFlags>): void => {
  if (typeof localStorage === 'undefined') return;
  const next = {
    ...readOverrides(),
    ...flags,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const resetAIAgentFeatureFlags = (): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
};
