import assert from 'node:assert/strict';
import {
  buildFolderTitle,
  formatDate,
  isBookmarkableUrl,
  normalizeRootFolder,
  pickTabUrl,
  sanitizeFolderTitle,
  summarize,
  UNTITLED_GROUP,
} from './lib.js';

assert.equal(formatDate(new Date(2026, 10, 19)), '2026-11-19');
assert.equal(formatDate(new Date(2026, 0, 5)), '2026-01-05');

assert.equal(buildFolderTitle('主账号优化', true, new Date(2026, 10, 19)), '2026-11-19 主账号优化');
assert.equal(buildFolderTitle('主账号优化', false, new Date(2026, 10, 19)), '主账号优化');
assert.equal(buildFolderTitle('', true, new Date(2026, 10, 19)), `2026-11-19 ${UNTITLED_GROUP}`);
assert.equal(buildFolderTitle('  ', false), UNTITLED_GROUP);

assert.equal(sanitizeFolderTitle('a/b:c'), 'a／b：c');
assert.equal(sanitizeFolderTitle('  需求  '), '需求');
assert.equal(normalizeRootFolder(' 需求/归档 '), '需求／归档');
assert.equal(normalizeRootFolder(''), '需求归档');

assert.equal(isBookmarkableUrl('https://example.com/docx/abc'), true);
assert.equal(isBookmarkableUrl('http://figma.com/file/1'), true);
assert.equal(isBookmarkableUrl('file:///Users/x/a.pdf'), true);
assert.equal(isBookmarkableUrl('chrome://extensions'), false);
assert.equal(isBookmarkableUrl('chrome-extension://abc/popup.html'), false);
assert.equal(isBookmarkableUrl('devtools://devtools/bundled/x.html'), false);
assert.equal(isBookmarkableUrl(''), false);
assert.equal(isBookmarkableUrl(undefined), false);

assert.equal(pickTabUrl({ url: 'https://a.com', pendingUrl: 'https://b.com' }), 'https://a.com');
assert.equal(pickTabUrl({ pendingUrl: 'https://b.com' }), 'https://b.com');
assert.equal(pickTabUrl({}), '');

const totals = summarize([
  { added: 5, skipped: 1, failed: 0 },
  { added: 2, skipped: 0, failed: 1 },
]);
assert.deepEqual(totals, { added: 7, skipped: 1, failed: 1, groups: 2 });

console.log('lib.js 全部断言通过');
