const SENSITIVE_FILE_PATTERNS = [
  /(^|[\\/])\.env(\.|$)?/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.pypirc$/i,
  /(^|[\\/])\.netrc$/i,
  /(^|[\\/])id_rsa$/i,
  /(^|[\\/])id_ed25519$/i,
  /(^|[\\/])credentials?\.(json|ya?ml|txt)$/i,
  /(^|[\\/])secrets?\.(json|ya?ml|txt)$/i,
  /(^|[\\/])private[-_]?key/i,
];

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
];

export const isSensitiveFilePath = (path: string): boolean => SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(path));

export const assertSafeFileReadPath = (path: string): void => {
  if (isSensitiveFilePath(path)) {
    throw new Error(`拒绝读取敏感文件：${path}`);
  }
};

export const assertSafeFileWritePath = (path: string): void => {
  if (isSensitiveFilePath(path)) {
    throw new Error(`拒绝写入敏感文件：${path}`);
  }
};

export const isPrivateNetworkHost = (host: string): boolean => PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host));

export const assertSafePublicUrl = (input: string): void => {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('只允许访问 http/https URL。');
  }
  if (isPrivateNetworkHost(url.hostname)) {
    throw new Error(`拒绝通过 WebFetch 访问本地或内网地址：${url.hostname}`);
  }
};
