import type { AIRuntimeMessage } from './types';
import type { AITranscriptRecord } from './transcript';

export interface UIMessageLike {
  id?: string;
  conversationId: string;
  role: AIRuntimeMessage['role'];
  content: string;
  status?: string;
  createdAt?: number;
}

export const uiMessageToRuntimeMessage = (message: UIMessageLike): AIRuntimeMessage => ({
  id: message.id,
  role: message.role,
  content: message.content,
  status: message.status === 'failed' ? 'failed' : message.status === 'streaming' ? 'streaming' : 'completed',
  createdAt: message.createdAt,
});

export const uiMessageToTranscriptRecord = (message: UIMessageLike, options?: { parentId?: string; visible?: boolean; apiVisible?: boolean }): AITranscriptRecord => ({
  id: message.id || `message-${Date.now()}`,
  parentId: options?.parentId,
  conversationId: message.conversationId,
  role: message.role,
  content: message.content,
  status: message.status,
  visible: options?.visible ?? true,
  apiVisible: options?.apiVisible ?? message.role !== 'tool',
  createdAt: message.createdAt ?? Date.now(),
});
