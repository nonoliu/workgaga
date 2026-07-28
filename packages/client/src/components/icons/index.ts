// 图标组件库索引文件
export { default as FileIcon } from './FileIcon.vue';
export { default as FolderIcon } from './FolderIcon.vue';
export { default as ArrowIcon } from './ArrowIcon.vue';
export { default as AddIcon } from './AddIcon.vue';
export { default as RefreshIcon } from './RefreshIcon.vue';
export { default as GraphIcon } from './GraphIcon.vue';
export { default as DashboardIcon } from './DashboardIcon.vue';
export { default as AiIcon } from './AiIcon.vue';
export { default as LinkIcon } from './LinkIcon.vue';
export { default as CheckIcon } from './CheckIcon.vue';
export { default as TrashIcon } from './TrashIcon.vue';
export { default as RestoreIcon } from './RestoreIcon.vue';

// 图标类型定义
export interface IconProps {
  size?: number;
  color?: string;
  class?: string;
}

// 图标尺寸常量
export const ICON_SIZES = {
  SMALL: 12,
  MEDIUM: 16,
  LARGE: 20,
  XLARGE: 24,
} as const;

// 图标颜色常量
export const ICON_COLORS = {
  DEFAULT: 'currentColor',
  PRIMARY: '#007bff',
  SECONDARY: '#6c757d',
  SUCCESS: '#28a745',
  DANGER: '#dc3545',
  WARNING: '#ffc107',
  INFO: '#17a2b8',
} as const;
