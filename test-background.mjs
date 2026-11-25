import assert from 'node:assert/strict';
import { formatDate } from './lib.js';

const today = formatDate(new Date());
const nodes = new Map();
const children = new Map();
const tabsByGroup = new Map([
  [7, [
    { id: 1, title: 'A', url: 'https://a.example' },
    { id: 2, title: 'B', url: 'https://b.example' },
    { id: 3, title: 'C', url: 'https://c.example' },
  ]],
  [8, [{ id: 4, title: '失败', url: 'https://fail.example' }]],
  [9, [{ id: 5, title: '目标', url: 'https://dest.example' }]],
  [10, [{ id: 6, title: '不删', url: 'https://keep.example' }]],
  [11, [
    { id: 11, title: '整组保留', url: 'https://whole-1.example' },
    { id: 12, title: '整组未选', url: 'https://whole-2.example' },
    { id: 13, title: '整组也未选', url: 'https://whole-3.example' },
  ]],
]);
const groupTitles = new Map([[7, '测试组'], [8, '失败组'], [9, '目标组'], [10, '保留组'], [11, '整组']]);
const state = { folders: [], bookmarks: [], removed: [], opened: [], groupUpdates: [] };
let listener;

function node(id, title, extra = {}) {
  const value = { id, title, ...extra };
  nodes.set(id, value);
  return value;
}

node('1', '书签栏', { folderType: 'bookmarks-bar' });
node('2', '其他书签');
node('root', '需求归档');
node('dest', '项目归档');
node('folder-today', `${today} 测试组`);
node('folder-open', `${today} 打开组`);
node('existing-a', 'A', { url: 'https://a.example' });
children.set('1', [nodes.get('root'), nodes.get('dest')]);
children.set('root', [nodes.get('folder-today'), nodes.get('folder-open')]);
children.set('folder-today', [nodes.get('existing-a')]);
children.set('folder-open', [nodes.get('existing-a')]);
children.set('dest', []);
children.set('2', []);

globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    onMessage: { addListener: (fn) => { listener = fn; } },
  },
  storage: {
    session: {
      _data: {},
      async get(key) { return { [key]: this._data[key] }; },
      async set(values) { Object.assign(this._data, values); },
    },
  },
  bookmarks: {
    getTree: async () => [{
      id: '0',
      children: [nodes.get('1'), nodes.get('2')].map((item) => ({
        ...item,
        children: (children.get(item.id) || []).map((child) => ({ ...child })),
      })),
    }],
    get: async (id) => {
      const value = nodes.get(id);
      return value ? [value] : [];
    },
    getChildren: async (id) => children.get(id) || [],
    create: async ({ parentId, title, url }) => {
      if (url) {
        if (url === 'https://fail.example') throw new Error('模拟书签写入失败');
        const created = { id: `bookmark-${state.bookmarks.length + 1}`, title, url };
        state.bookmarks.push({ parentId, ...created });
        if (!children.has(parentId)) children.set(parentId, []);
        children.get(parentId).push(created);
        return created;
      }
      const created = node(`folder-${state.folders.length + 1}`, title);
      state.folders.push({ parentId, title });
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(created);
      children.set(created.id, []);
      return created;
    },
  },
  tabGroups: {
    get: async (id) => ({ id, title: groupTitles.get(id) || '' }),
    update: async (id, update) => { state.groupUpdates.push({ id, ...update }); },
  },
  tabs: {
    query: async (query) => {
      if (query?.active) return [{ id: 99, windowId: 1 }];
      return tabsByGroup.get(query?.groupId) || [];
    },
    remove: async (ids) => {
      state.removed.push(...ids);
      const selected = new Set(ids);
      for (const [groupId, tabs] of tabsByGroup) {
        tabsByGroup.set(groupId, tabs.filter((tab) => !selected.has(tab.id)));
      }
    },
    create: async ({ url, windowId, active }) => {
      const tab = { id: 100 + state.opened.length, url, windowId, active };
      state.opened.push(tab);
      return tab;
    },
    group: async ({ tabIds, groupId }) => {
      state.groupedTabIds = tabIds;
      state.groupTarget = groupId || null;
      return groupId || 55;
    },
  },
};

await import('./background.js');

function call(message) {
  return new Promise((resolve, reject) => {
    const returned = listener(message, { id: 'test-extension' }, resolve);
    if (returned !== true) reject(new Error('listener 没有保持消息通道'));
  });
}

const locations = await call({ type: 'listDestinations' });
assert.equal(locations.ok, true);
assert.ok(locations.folders.some((folder) => folder.id === 'dest'));

const archives = await call({ type: 'listArchives', settings: { rootFolder: '需求归档' } });
assert.equal(archives.ok, true);
assert.equal(archives.folders[0].title, `${today} 测试组`);
assert.equal(archives.folders[0].count, 1);

const partial = await call({
  type: 'archive',
  targets: [{ groupId: 7, tabIds: [1, 3] }],
  settings: { rootFolder: '需求归档', datePrefix: true, closeAfterSave: true },
});
assert.equal(partial.ok, true);
assert.deepEqual(
  {
    added: partial.results[0].added,
    skipped: partial.results[0].skipped,
    failed: partial.results[0].failed,
    closed: partial.results[0].closed,
  },
  { added: 1, skipped: 1, failed: 0, closed: true },
);
assert.deepEqual(state.removed, [1, 3]);
assert.ok(!state.bookmarks.some((bookmark) => bookmark.url === 'https://b.example'));

const failed = await call({
  type: 'archive',
  targets: [{ groupId: 8, tabIds: [4] }],
  settings: { rootFolder: '需求归档', closeAfterSave: true, closeWholeGroup: true },
});
assert.equal(failed.ok, true);
assert.equal(failed.results[0].failed, 1);
assert.equal(failed.results[0].closed, false);
assert.equal(failed.results[0].closedWholeGroup, false);
assert.ok(!state.removed.includes(4));

const destination = await call({
  type: 'archive',
  targets: [{ groupId: 9, tabIds: [5], folderTitle: 'Custom archive' }],
  settings: { rootFolder: '需求归档', destinationFolderId: 'dest', closeAfterSave: false },
});
assert.equal(destination.ok, true);
assert.equal(destination.results[0].folderTitle, 'Custom archive');
assert.ok(state.folders.some((folder) => folder.parentId === 'dest' && folder.title === 'Custom archive'));
assert.ok(!state.removed.includes(5));

const wholeGroup = await call({
  type: 'archive',
  targets: [{ groupId: 11, tabIds: [11] }],
  settings: { rootFolder: '需求归档', closeAfterSave: false, closeWholeGroup: true },
});
assert.equal(wholeGroup.ok, true);
assert.equal(wholeGroup.results[0].added, 1);
assert.equal(wholeGroup.results[0].closed, true);
assert.equal(wholeGroup.results[0].closedWholeGroup, true);
assert.ok([11, 12, 13].every((id) => state.removed.includes(id)));

const opened = await call({ type: 'openArchive', folderId: 'folder-today', language: 'en' });
assert.equal(opened.ok, true);
assert.equal(opened.opened, 2);
assert.equal(opened.groupId, 7);
assert.equal(opened.restoredToGroup, true);
assert.deepEqual(state.groupedTabIds, [100, 101]);
assert.equal(state.groupTarget, 7);
assert.deepEqual(state.groupUpdates[0], { id: 7, title: '测试组', collapsed: false });

console.log('background.js 收录与重开断言通过');
