import { appDataDir } from '@tauri-apps/api/path';
import { mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import type {
  AIAgentPluginManifest,
  AIInstalledPluginRecord,
  AIPluginManifest,
  AISkillPluginManifest,
} from '../store/modal/aiAssistant';
import {
  validateAgentPluginManifest,
  validatePluginManifestBase,
  validateSkillPluginManifest,
  validateToolPluginManifest,
} from '../store/modal/aiAssistant';

const joinPath = (base: string, name: string): string => {
  const normalizedBase = base.replace(/[\\/]+$/, '');
  return `${normalizedBase}/${name}`;
};

const ensureDir = async (path: string): Promise<void> => {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    console.warn('确保目录存在失败:', path, error);
  }
};

const readJsonFile = async (path: string): Promise<Record<string, unknown> | null> => {
  try {
    const content = await readTextFile(path);
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    console.warn('读取插件 JSON 失败:', path, error);
    return null;
  }
};

const collectPluginDirs = async (basePath: string): Promise<string[]> => {
  try {
    const entries = await readDir(basePath);
    return entries.filter((entry) => entry.isDirectory).map((entry) => joinPath(basePath, entry.name || ''));
  } catch (error) {
    console.warn('读取插件目录失败:', basePath, error);
    return [];
  }
};

export interface LocalPluginManifestLoadResult {
  skills: AISkillPluginManifest[];
  agents: AIAgentPluginManifest[];
  errors: string[];
}

export const getPluginsRootDir = async (): Promise<string> => joinPath(await appDataDir(), 'plugins');

export const loadInstalledPluginManifests = async (): Promise<LocalPluginManifestLoadResult> => {
  const rootDir = await getPluginsRootDir();
  const skillsDir = joinPath(rootDir, 'skills');
  const agentsDir = joinPath(rootDir, 'agents');
  const toolsDir = joinPath(rootDir, 'tools');

  await ensureDir(skillsDir);
  await ensureDir(agentsDir);
  await ensureDir(toolsDir);

  const skills: AISkillPluginManifest[] = [];
  const agents: AIAgentPluginManifest[] = [];
  const errors: string[] = [];

  const skillDirs = await collectPluginDirs(skillsDir);
  for (const pluginDir of skillDirs) {
    const manifestPath = joinPath(pluginDir, 'manifest.json');
    const raw = await readJsonFile(manifestPath);
    if (!raw) continue;

    const validationErrors = validateSkillPluginManifest(raw);
    if (validationErrors.length) {
      errors.push(`Skill 插件校验失败(${pluginDir}): ${validationErrors.join(' ')}`);
      continue;
    }

    skills.push(raw as unknown as AISkillPluginManifest);
  }

  const agentDirs = await collectPluginDirs(agentsDir);
  for (const pluginDir of agentDirs) {
    const manifestPath = joinPath(pluginDir, 'manifest.json');
    const raw = await readJsonFile(manifestPath);
    if (!raw) continue;

    const validationErrors = validateAgentPluginManifest(raw);
    if (validationErrors.length) {
      errors.push(`Agent 插件校验失败(${pluginDir}): ${validationErrors.join(' ')}`);
      continue;
    }

    agents.push(raw as unknown as AIAgentPluginManifest);
  }

  return { skills, agents, errors };
};

export const normalizeGitHubManifestUrl = (inputUrl: string): string => {
  try {
    const url = new URL(inputUrl);
    if (url.hostname !== 'github.com' && url.hostname !== 'raw.githubusercontent.com') {
      return inputUrl;
    }

    if (url.hostname === 'raw.githubusercontent.com') {
      return inputUrl;
    }

    const parts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (parts.length < 2) return inputUrl;

    const [owner, repo, mode, ...rest] = parts;
    if (mode === 'blob' && rest.length >= 2) {
      const [branch, ...fileParts] = rest;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fileParts.join('/')}`;
    }

    if (mode === 'tree' && rest.length >= 1) {
      const [branch, ...dirParts] = rest;
      const basePath = dirParts.length ? `${dirParts.join('/')}/` : '';
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${basePath}manifest.json`;
    }

    return `https://raw.githubusercontent.com/${owner}/${repo}/main/manifest.json`;
  } catch (error) {
    return inputUrl;
  }
};

export const installPluginManifestFromSource = async (manifest: AIPluginManifest): Promise<AIInstalledPluginRecord> => {
  const rootDir = await getPluginsRootDir();
  const targetDir = joinPath(
    rootDir,
    manifest.kind === 'skill' ? 'skills' : manifest.kind === 'agent' ? 'agents' : 'tools',
  );
  const pluginDir = joinPath(targetDir, manifest.id);
  await ensureDir(pluginDir);
  await writeTextFile(joinPath(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return normalizeInstalledPluginRecord(manifest);
};

export const normalizeSkillHubManifestUrl = (inputUrl: string): string => {
  try {
    if (!inputUrl.startsWith('skillhub://')) {
      return normalizeGitHubManifestUrl(inputUrl);
    }

    const withoutScheme = inputUrl.replace(/^skillhub:\/\//, '');
    const segments = withoutScheme.replace(/^\/+/, '').split('/').filter(Boolean);

    if (segments.length >= 3) {
      const [namespace, kind, id] = segments;
      return `https://skillhub.dev/${namespace}/plugins/${kind}/${id}/manifest.json`;
    }

    if (segments.length === 2) {
      const [kind, id] = segments;
      return `https://skillhub.dev/plugins/${kind}/${id}/manifest.json`;
    }

    return inputUrl;
  } catch (error) {
    return inputUrl;
  }
};

export const installPluginFromSkillHubUrl = async (inputUrl: string) => {
  const manifestUrl = normalizeSkillHubManifestUrl(inputUrl);
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`获取 SkillHub 插件清单失败(${response.status})。`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const baseErrors = validatePluginManifestBase(raw);
  if (baseErrors.length) {
    throw new Error(`SkillHub 插件清单校验失败：${baseErrors.join(' ')}`);
  }

  const kind = raw.kind === 'tool' ? 'tool' : raw.kind === 'agent' ? 'agent' : 'skill';
  const validationErrors =
    kind === 'tool'
      ? validateToolPluginManifest(raw)
      : kind === 'agent'
        ? validateAgentPluginManifest(raw)
        : validateSkillPluginManifest(raw);
  if (validationErrors.length) {
    throw new Error(`SkillHub 插件清单校验失败：${validationErrors.join(' ')}`);
  }

  const manifest = raw as unknown as AIPluginManifest;
  const record = await installPluginManifestFromSource(manifest);
  return { manifest, record };
};

export const installPluginFromGitHubUrl = async (inputUrl: string) => {
  const manifestUrl = normalizeGitHubManifestUrl(inputUrl);
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`获取 GitHub 插件清单失败(${response.status})。`);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const baseErrors = validatePluginManifestBase(raw);
  if (baseErrors.length) {
    throw new Error(`GitHub 插件清单校验失败：${baseErrors.join(' ')}`);
  }

  const kind = raw.kind === 'tool' ? 'tool' : raw.kind === 'agent' ? 'agent' : 'skill';
  const validationErrors =
    kind === 'tool'
      ? validateToolPluginManifest(raw)
      : kind === 'agent'
        ? validateAgentPluginManifest(raw)
        : validateSkillPluginManifest(raw);
  if (validationErrors.length) {
    throw new Error(`GitHub 插件清单校验失败：${validationErrors.join(' ')}`);
  }

  const manifest = raw as unknown as AIPluginManifest;
  const record = await installPluginManifestFromSource(manifest);
  return { manifest, record };
};

export const uninstallPluginDir = async (kind: AIPluginManifest['kind'], id: string): Promise<void> => {
  const rootDir = await getPluginsRootDir();
  const targetDir = joinPath(rootDir, kind === 'skill' ? 'skills' : 'agents');
  const pluginDir = joinPath(targetDir, id);

  try {
    await remove(pluginDir, { recursive: true });
  } catch (error) {
    console.warn('卸载插件目录失败:', pluginDir, error);
  }
};

export const normalizeInstalledPluginRecord = (manifest: AIPluginManifest) => ({
  id: manifest.id,
  kind: manifest.kind,
  name: manifest.name,
  version: manifest.version,
  sourceType: manifest.sourceType,
  sourceUrl: manifest.sourceUrl,
  installedAt: Date.now(),
  updatedAt: Date.now(),
});
