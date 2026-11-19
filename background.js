import {
  DEFAULT_SETTINGS,
  buildFolderTitle,
  isBookmarkableUrl,
  normalizeRootFolder,
  pickTabUrl,
} from './lib.js';

// 收录是写操作，放在 service worker 里执行；弹窗失焦关闭不会中断已经开始的写入。
let queue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type === 'archive') {
    const targets = normalizeTargets(message.targets);
    const settings = normalizeSettings(message.settings);
    enqueue(() => archiveGroups(targets, settings))
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: textOf(error) }));
    return true;
  }

  if (message?.type === 'listDestinations') {
    listDestinations()
      .then((folders) => sendResponse({ ok: true, folders }))
      .catch((error) => sendResponse({ ok: false, error: textOf(error) }));
    return true;
  }

  if (message?.type === 'listArchives') {
    listArchives(normalizeSettings(message.settings))
      .then((folders) => sendResponse({ ok: true, folders }))
      .catch((error) => sendResponse({ ok: false, error: textOf(error) }));
    return true;
  }

  if (message?.type === 'openArchive') {
    openArchive(message.folderId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: textOf(error) }));
    return true;
  }

  return false;
});

// 同一时间只跑一个收录任务，避免两个弹窗/两次点击同时创建同名文件夹或书签。
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function normalizeTargets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((target) => ({
      groupId: Number(target?.groupId),
      tabIds: Array.isArray(target?.tabIds)
        ? [...new Set(target.tabIds.filter((id) => Number.isInteger(id) && id > 0))]
        : [],
    }))
    .filter((target) => Number.isInteger(target.groupId) && target.groupId > 0 && target.tabIds.length > 0);
}

function normalizeSettings(raw) {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw && typeof raw === 'object' ? raw : {}),
    rootFolder: normalizeRootFolder(raw?.rootFolder),
    destinationFolderId: typeof raw?.destinationFolderId === 'string' && raw.destinationFolderId
      ? raw.destinationFolderId
      : null,
    datePrefix: raw?.datePrefix !== false,
    closeAfterSave: raw?.closeAfterSave !== false,
  };
}

async function archiveGroups(targets, settings) {
  if (!targets.length) throw new Error('没有选择要收录的页面');

  const parent = await resolveArchiveParent(settings, true);
  const results = [];

  for (const target of targets) {
    try {
      results.push(await archiveGroup(target, parent.id, settings));
    } catch (error) {
      results.push({
        groupId: target.groupId,
        folderId: null,
        folderTitle: '',
        added: 0,
        skipped: 0,
        failed: 1,
        closed: false,
        error: textOf(error),
      });
    }
  }

  return results;
}

async function archiveGroup(target, parentId, settings) {
  const group = await chrome.tabGroups.get(target.groupId);
  const selected = new Set(target.tabIds);
  const tabs = (await chrome.tabs.query({ groupId: target.groupId }))
    .filter((tab) => selected.has(tab.id));
  const folderTitle = buildFolderTitle(group.title, settings.datePrefix);
  const folder = await ensureFolder(parentId, folderTitle);
  const folderId = folder.id;
  const existing = new Set(
    (await chrome.bookmarks.getChildren(folderId))
      .map((node) => node.url)
      .filter(Boolean),
  );

  let added = 0;
  let skipped = 0;
  let failed = 0;
  const archivedTabIds = [];

  for (const tab of tabs) {
    const url = pickTabUrl(tab);
    if (!isBookmarkableUrl(url)) {
      skipped += 1;
      continue;
    }
    if (existing.has(url)) {
      // 目标文件夹已有该 URL，视为已归档；之后可以安全关闭这个重复页面。
      skipped += 1;
      archivedTabIds.push(tab.id);
      continue;
    }

    try {
      await chrome.bookmarks.create({
        parentId: folderId,
        title: bookmarkTitle(tab.title, url),
        url,
      });
      existing.add(url);
      added += 1;
      archivedTabIds.push(tab.id);
    } catch {
      // 单条失败不阻断同组其他页面；最后汇总给用户。
      failed += 1;
    }
  }

  // 有失败时不删除任何页面，避免用户丢掉还没来得及确认的页面。
  let closed = false;
  if (settings.closeAfterSave && failed === 0 && archivedTabIds.length > 0) {
    try {
      await chrome.tabs.remove(archivedTabIds);
      closed = true;
    } catch {
      closed = false;
    }
  }

  return { groupId: target.groupId, folderId, folderTitle, added, skipped, failed, closed };
}

async function resolveArchiveParent(settings, createDefault) {
  if (settings.destinationFolderId) {
    const [node] = await chrome.bookmarks.get(settings.destinationFolderId).catch(() => []);
    if (!node || node.url) {
      throw new Error('目标书签文件夹不存在或已被删除，请重新选择');
    }
    return node;
  }

  const bar = await findBookmarksBar();
  const title = normalizeRootFolder(settings.rootFolder);
  if (createDefault) return ensureFolder(bar.id, title);
  return findFolder(bar.id, title);
}

async function findBookmarksBar() {
  const [root] = await chrome.bookmarks.getTree();
  const children = root?.children || [];
  // folderType 比固定 ID 更稳；旧版本 Chrome 没有该字段时回退到标准 ID 1。
  const bar = children.find((node) => node.folderType === 'bookmarks-bar')
    || children.find((node) => node.id === '1')
    || children[0];
  if (!bar) throw new Error('找不到书签栏');
  return bar;
}

async function findFolder(parentId, title) {
  const children = await chrome.bookmarks.getChildren(parentId);
  return children.find((node) => !node.url && node.title === title) || null;
}

async function ensureFolder(parentId, title) {
  const found = await findFolder(parentId, title);
  if (found) return found;
  return chrome.bookmarks.create({ parentId, title });
}

async function listDestinations() {
  const [root] = await chrome.bookmarks.getTree();
  const folders = [];
  const walk = (nodes, parentPath, depth) => {
    for (const node of nodes || []) {
      if (node.url) continue;
      const path = parentPath ? `${parentPath} / ${node.title}` : node.title;
      folders.push({ id: node.id, title: node.title, path, depth });
      walk(node.children, path, depth + 1);
      if (folders.length >= 500) return;
    }
  };
  walk(root?.children, '', 0);
  return folders;
}

async function listArchives(settings) {
  const parent = await resolveArchiveParent(settings, false);
  if (!parent) return [];
  const children = await chrome.bookmarks.getChildren(parent.id);
  const folders = children.filter((node) => !node.url).sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  const result = [];
  for (const folder of folders.slice(0, 100)) {
    const bookmarks = await chrome.bookmarks.getChildren(folder.id);
    result.push({
      id: folder.id,
      title: folder.title,
      count: bookmarks.filter((node) => node.url && isBookmarkableUrl(node.url)).length,
      dateAdded: folder.dateAdded || 0,
    });
  }
  return result;
}

async function openArchive(folderId) {
  if (typeof folderId !== 'string' || !folderId) throw new Error('归档文件夹无效');
  const [folder] = await chrome.bookmarks.get(folderId).catch(() => []);
  if (!folder || folder.url) throw new Error('归档文件夹不存在');

  const children = await chrome.bookmarks.getChildren(folderId);
  const urls = [...new Set(children
    .map((node) => node.url)
    .filter((url) => isBookmarkableUrl(url)))];

  if (!urls.length) throw new Error('这个归档里没有可打开的页面');
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const windowId = active?.windowId;
  const tabIds = [];

  for (const url of urls) {
    const tab = await chrome.tabs.create({
      url,
      active: false,
      ...(windowId ? { windowId } : {}),
    });
    tabIds.push(tab.id);
  }

  const groupOptions = { tabIds };
  if (windowId) groupOptions.createProperties = { windowId };
  const groupId = await chrome.tabs.group(groupOptions);
  await chrome.tabGroups.update(groupId, { title: String(folder.title).slice(0, 50), collapsed: false });
  return { groupId, opened: tabIds.length, title: folder.title };
}

function bookmarkTitle(title, url) {
  const cleaned = String(title || '').replace(/\s+/g, ' ').trim();
  return (cleaned || url).slice(0, 512);
}

function textOf(error) {
  return String(error?.message || error);
}
