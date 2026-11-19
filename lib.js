// 纯函数集合：不依赖 chrome.* API，便于在 node 下直接跑测试。

import { defaultRootFolder, untitledGroup } from './i18n.js';

export const UNTITLED_GROUP = '未命名组';
export const DEFAULT_SETTINGS = {
  rootFolder: '需求归档',
  destinationFolderId: null,
  datePrefix: false,
  closeAfterSave: true,
  language: 'en',
};

export function defaultSettingsFor(language) {
  return {
    ...DEFAULT_SETTINGS,
    language,
    rootFolder: defaultRootFolder(language),
  };
}

export function formatDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 书签树里不允许 / 出现在文件夹名中会产生层级歧义，统一换成全角
export function sanitizeFolderTitle(title) {
  return String(title ?? '')
    .replace(/[\\/:*?"<>|]/g, (ch) => ({ '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '＜', '>': '＞', '|': '｜' })[ch])
    .trim();
}

// 归档目录是单层文件夹，不把用户输入当成书签路径解析。
export function normalizeRootFolder(title, fallback = DEFAULT_SETTINGS.rootFolder) {
  return sanitizeFolderTitle(title) || fallback;
}

export function buildFolderTitle(groupTitle, withDate, date = new Date(), untitled = UNTITLED_GROUP) {
  const name = sanitizeFolderTitle(groupTitle) || untitled;
  return withDate ? `${formatDate(date)} ${name}` : name;
}

export function isBookmarkableUrl(url) {
  return typeof url === 'string' && /^(https?|file|ftp):/i.test(url);
}

export function pickTabUrl(tab) {
  return tab.url || tab.pendingUrl || '';
}

export function summarize(results) {
  const added = results.reduce((sum, r) => sum + r.added, 0);
  const skipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const failed = results.reduce((sum, r) => sum + (r.failed || 0), 0);
  return { added, skipped, failed, groups: results.length };
}
