import {
  BOOKMARKS_BAR_ID,
  DEFAULT_SETTINGS,
  buildFolderTitle,
  isBookmarkableUrl,
  pickTabUrl,
  summarize,
} from './lib.js';

const COLOR_HEX = {
  grey: '#9aa0a6',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#1e8e3e',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#fa903e',
};

const els = {
  hint: document.getElementById('hint'),
  list: document.getElementById('list'),
  result: document.getElementById('result'),
  saveAll: document.getElementById('saveAll'),
  datePrefix: document.getElementById('datePrefix'),
  closeAfterSave: document.getElementById('closeAfterSave'),
  rootFolder: document.getElementById('rootFolder'),
};

let settings = { ...DEFAULT_SETTINGS };
let groups = [];

init();

async function init() {
  const stored = (await chrome.storage.local.get('settings')).settings;
  settings = { ...DEFAULT_SETTINGS, ...stored };
  els.datePrefix.checked = settings.datePrefix;
  els.closeAfterSave.checked = settings.closeAfterSave;
  els.rootFolder.value = settings.rootFolder;

  els.datePrefix.addEventListener('change', persistSettings);
  els.closeAfterSave.addEventListener('change', persistSettings);
  els.rootFolder.addEventListener('change', persistSettings);
  els.saveAll.addEventListener('click', () => saveGroups(groups));

  await render();
}

async function persistSettings() {
  settings = {
    datePrefix: els.datePrefix.checked,
    closeAfterSave: els.closeAfterSave.checked,
    rootFolder: els.rootFolder.value.trim() || DEFAULT_SETTINGS.rootFolder,
  };
  await chrome.storage.local.set({ settings });
}

async function loadGroups() {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!active) return [];
  const found = await chrome.tabGroups.query({ windowId: active.windowId });
  const loaded = [];
  for (const group of found) {
    const tabs = await chrome.tabs.query({ groupId: group.id });
    if (tabs.length) loaded.push({ ...group, tabs });
  }
  return loaded;
}

async function render() {
  groups = await loadGroups();
  els.list.textContent = '';

  if (!groups.length) {
    els.hint.textContent = '当前窗口没有标签组';
    els.saveAll.disabled = true;
    els.saveAll.textContent = '收录本窗口全部组';
    return;
  }

  els.hint.textContent = `当前窗口有 ${groups.length} 个标签组`;
  els.saveAll.disabled = false;
  els.saveAll.textContent = `收录本窗口全部 ${groups.length} 个组`;
  for (const group of groups) els.list.append(groupRow(group));
}

function groupRow(group) {
  const row = document.createElement('div');
  row.className = 'group';

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = COLOR_HEX[group.color] || COLOR_HEX.grey;

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = group.title || '未命名组';
  name.title = group.title || '未命名组';

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = `${group.tabs.length} 个页面`;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '收录';
  button.addEventListener('click', () => saveGroups([group]));

  row.append(dot, name, count, button);
  return row;
}

async function saveGroups(list) {
  els.saveAll.disabled = true;
  const results = [];
  let error = null;
  try {
    const rootId = await ensureFolder(BOOKMARKS_BAR_ID, settings.rootFolder || DEFAULT_SETTINGS.rootFolder);
    for (const group of list) {
      results.push(await saveGroup(group, rootId));
    }
  } catch (caught) {
    error = caught;
  }
  await render();
  if (error) showError(error);
  else showResults(results);
}

async function ensureFolder(parentId, title) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const found = children.find((node) => !node.url && node.title === title);
  if (found) return found.id;
  const created = await chrome.bookmarks.create({ parentId, title });
  return created.id;
}

async function saveGroup(group, rootId) {
  const folderTitle = buildFolderTitle(group.title, settings.datePrefix);
  const folderId = await ensureFolder(rootId, folderTitle);
  const existing = new Set(
    (await chrome.bookmarks.getChildren(folderId)).map((node) => node.url).filter(Boolean),
  );

  let added = 0;
  let skipped = 0;
  for (const tab of group.tabs) {
    const url = pickTabUrl(tab);
    if (!isBookmarkableUrl(url) || existing.has(url)) {
      skipped += 1;
      continue;
    }
    await chrome.bookmarks.create({ parentId: folderId, title: tab.title || url, url });
    existing.add(url);
    added += 1;
  }

  if (settings.closeAfterSave) {
    await chrome.tabs.remove(group.tabs.map((tab) => tab.id));
  }

  return { folderTitle, added, skipped };
}

function showResults(results) {
  els.result.hidden = false;
  els.result.textContent = '';

  if (!results.length) return;
  const { added, skipped } = summarize(results);

  const summary = document.createElement('div');
  summary.className = added ? 'ok' : 'warn';
  summary.textContent = `已收录 ${added} 个书签${skipped ? `，跳过 ${skipped} 个（重复或不可收藏页面）` : ''}`;
  els.result.append(summary);

  for (const item of results) {
    const line = document.createElement('div');
    line.textContent = `· ${item.folderTitle}：新增 ${item.added}，跳过 ${item.skipped}`;
    els.result.append(line);
  }
}

function showError(error) {
  els.result.hidden = false;
  els.result.textContent = `收录失败：${error?.message || error}`;
}
