const RAW_PASSPHRASE = 'workgaga-llm-channel-api-key@2026';
const RAW_SALT = 'workgaga-llm-channel-api-key-salt-v1';
const ITERATIONS = 120_000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let cachedKey: CryptoKey | null = null;

const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const getCrypto = (): Crypto => {
  if (typeof globalThis.crypto !== 'undefined') {
    return globalThis.crypto;
  }
  throw new Error('当前环境不可用 Web Crypto API。');
};

const deriveKey = async (): Promise<CryptoKey> => {
  if (cachedKey) return cachedKey;

  const crypto = getCrypto();
  const baseKey = await crypto.subtle.importKey('raw', textEncoder.encode(RAW_PASSPHRASE), 'PBKDF2', false, [
    'deriveKey',
  ]);

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: textEncoder.encode(RAW_SALT),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );

  return cachedKey;
};

export interface EncryptedApiKeyRecord {
  version: 'v1';
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

const storageKey = (channelId: string): string => `workgaga_llm_channel_api_key:${channelId}`;

export const encryptApiKey = async (value: string): Promise<EncryptedApiKeyRecord> => {
  const crypto = getCrypto();
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(value));

  return {
    version: 'v1',
    iv: toBase64(iv.buffer),
    ciphertext: toBase64(encrypted),
    updatedAt: Date.now(),
  };
};

export const decryptApiKey = async (record: EncryptedApiKeyRecord): Promise<string> => {
  const crypto = getCrypto();
  const key = await deriveKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(record.iv) },
    key,
    fromBase64(record.ciphertext),
  );
  return textDecoder.decode(decrypted);
};

export const saveEncryptedChannelApiKey = async (
  channelId: string,
  value: string,
): Promise<EncryptedApiKeyRecord | null> => {
  const trimmed = value.trim();
  if (!trimmed) {
    removeEncryptedChannelApiKey(channelId);
    return null;
  }

  const record = await encryptApiKey(trimmed);
  localStorage.setItem(storageKey(channelId), JSON.stringify(record));
  return record;
};

export const loadEncryptedChannelApiKeyRecord = (channelId: string): EncryptedApiKeyRecord | null => {
  const raw = localStorage.getItem(storageKey(channelId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as EncryptedApiKeyRecord;
  } catch (error) {
    console.warn('读取加密 API Key 记录失败:', error);
    return null;
  }
};

export const getDecryptedChannelApiKey = async (channelId: string): Promise<string | null> => {
  const record = loadEncryptedChannelApiKeyRecord(channelId);
  if (!record) return null;

  try {
    return await decryptApiKey(record);
  } catch (error) {
    console.warn('解密渠道 API Key 失败:', error);
    return null;
  }
};

export const hasEncryptedChannelApiKey = (channelId: string): boolean =>
  Boolean(loadEncryptedChannelApiKeyRecord(channelId));

export const removeEncryptedChannelApiKey = (channelId: string): void => {
  localStorage.removeItem(storageKey(channelId));
};
