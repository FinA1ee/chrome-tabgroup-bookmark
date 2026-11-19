import {
  DEFAULT_SETTINGS,
  isBookmarkableUrl,
  normalizeRootFolder,
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
  destination: document.getElementById('destination'),
  archives: document.getElementById('archives'),
  refreshArchives: document.getElementById('refreshArchives'),
};

let settings = { ...DEFAULT_SETTINGS };
let groups = [];
let destinations = [];
let selectedByGroup = new Map();
let busy = false;

init();

async function init() {
  const stored = (await chrome.storage.local.get('settings')).settings;
  settings = { ...DEFAULT_SETTINGS, ...stored };
  settings.rootFolder = normalizeRootFolder(settings.rootFolder);
  settings.destinationFolderId = typeof settings.destinationFolderId === 'string' && settings.destinationFolderId
    ? settings.destinationFolderId
    : null;

  els.datePrefix.checked = settings.datePrefix;
  els.closeAfterSave.checked = settings.closeAfterSave;
  els.rootFolder.value = settings.rootFolder;

  els.datePrefix.addEventListener('change', persistSettings);
  els.closeAfterSave.addEventListener('change', persistSettings);
  els.rootFolder.addEventListener('change', persistSettings);
  els.destination.addEventListener('change', persistSettings);
  els.refreshArchives.addEventListener('click', () => void loadArchives());
  els.saveAll.addEventListener('click', () => saveTargets(targetsFromGroups()));

  await loadDestinations();
  await render();
  await loadArchives();
}

async function send(message) {
  const reply = await chrome.runtime.sendMessage(message);
  if (!reply) throw new Error('后台没有返回结果');
  if (reply.ok === false) throw new Error(reply.error || '操作失败');
  return reply;
}

async function persistSettings() {
  const destinationFolderId = els.destination.value || null;
  settings = {
    ...settings,
    datePrefix: els.datePrefix.checked,
    closeAfterSave: els.closeAfterSave.checked,
    rootFolder: normalizeRootFolder(els.rootFolder.value),
    destinationFolderId,
  };
  els.rootFolder.value = settings.rootFolder;
  if (els.destination.options[0]) {
    els.destination.options[0].text = `默认：书签栏 / ${settings.rootFolder}`;
  }
  await chrome.storage.local.set({ settings });
  await loadArchives();
}

async function loadDestinations() {
  try {
    const reply = await send({ type: 'listDestinations' });
    destinations = reply.folders || [];
  } catch {
    destinations = [];
  }

  els.destination.textContent = '';
  els.destination.append(new Option(`默认：书签栏 / ${settings.rootFolder}`, ''));
  for (const folder of destinations) {
    const option = new Option(`${'　'.repeat(folder.depth)}${folder.title}`, folder.id);
    option.title = folder.path;
    els.destination.append(option);
  }

  const exists = destinations.some((folder) => folder.id === settings.destinationFolderId);
  const value = settings.destinationFolderId && exists ? settings.destinationFolderId : '';
  els.destination.value = value;
  if (value !== settings.destinationFolderId) {
    settings.destinationFolderId = value || null;
    await chrome.storage.local.set({ settings });
  }
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
  selectedByGroup = new Map();
  els.list.textContent = '';

  for (const group of groups) {
    selectedByGroup.set(
      group.id,
      new Set(group.tabs.filter((tab) => isBookmarkableUrl(pickTabUrl(tab))).map((tab) => tab.id)),
    );
  }

  if (!groups.length) {
    els.hint.textContent = '当前窗口没有标签组';
  } else {
    els.hint.textContent = `当前窗口有 ${groups.length} 个标签组`;
    for (const group of groups) els.list.append(groupRow(group));
  }
  updateActionLabels();
  setBusy(busy);
}

function groupRow(group) {
  const row = document.createElement('div');
  row.className = 'group';

  const head = document.createElement('div');
  head.className = 'group-head';

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

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'save-group';
  saveButton.dataset.groupButton = String(group.id);
  saveButton.title = '只收录当前选中的页面';
  saveButton.addEventListener('click', () => {
    const tabIds = [...(selectedByGroup.get(group.id) || [])];
    void saveTargets([{ groupId: group.id, tabIds }]);
  });

  head.append(dot, name, count, saveButton);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'link-button group-toggle';
  toggle.textContent = '选择';
  toggle.title = '展开页面选择';
  const tabsBox = document.createElement('div');
  tabsBox.className = 'tabs';
  tabsBox.hidden = true;

  toggle.addEventListener('click', () => {
    tabsBox.hidden = !tabsBox.hidden;
    toggle.textContent = tabsBox.hidden ? '选择' : '收起';
    toggle.title = tabsBox.hidden ? '展开页面选择' : '收起页面选择';
  });

  const tools = document.createElement('div');
  tools.className = 'tabs-tools';
  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.className = 'link-button';
  selectAll.textContent = '全选';
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.className = 'link-button';
  clearAll.textContent = '清空';
  tools.append(selectAll, clearAll);
  tabsBox.append(tools);
  head.append(toggle);

  for (const tab of group.tabs) {
    const url = pickTabUrl(tab);
    const supported = isBookmarkableUrl(url);
    const label = document.createElement('label');
    label.className = `tab-row${supported ? '' : ' disabled'}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = supported;
    checkbox.disabled = !supported;
    checkbox.dataset.tabId = String(tab.id);
    checkbox.dataset.unsupported = supported ? '0' : '1';
    checkbox.addEventListener('change', () => {
      const selected = selectedByGroup.get(group.id);
      if (checkbox.checked) selected.add(tab.id);
      else selected.delete(tab.id);
      updateActionLabels();
    });
    const text = document.createElement('span');
    text.className = 'tab-title';
    text.textContent = tab.title || url || '未命名页面';
    text.title = url || text.textContent;
    const badge = document.createElement('span');
    badge.className = 'tab-state';
    badge.textContent = supported ? '' : '不可收藏';
    label.append(checkbox, text, badge);
    tabsBox.append(label);
  }

  selectAll.addEventListener('click', () => {
    const selected = selectedByGroup.get(group.id);
    for (const checkbox of tabsBox.querySelectorAll('input[data-tab-id]')) {
      if (checkbox.disabled) continue;
      checkbox.checked = true;
      selected.add(Number(checkbox.dataset.tabId));
    }
    updateActionLabels();
  });
  clearAll.addEventListener('click', () => {
    for (const checkbox of tabsBox.querySelectorAll('input[data-tab-id]')) {
      checkbox.checked = false;
    }
    selectedByGroup.set(group.id, new Set());
    updateActionLabels();
  });

  if (!group.tabs.some((tab) => isBookmarkableUrl(pickTabUrl(tab)))) {
    saveButton.disabled = true;
    toggle.disabled = true;
  }

  row.append(head, tabsBox);
  return row;
}

function targetsFromGroups() {
  return groups
    .map((group) => ({ groupId: group.id, tabIds: [...(selectedByGroup.get(group.id) || [])] }))
    .filter((target) => target.tabIds.length > 0);
}

function updateActionLabels() {
  let total = 0;
  for (const group of groups) {
    const count = selectedByGroup.get(group.id)?.size || 0;
    total += count;
    const button = els.list.querySelector(`[data-group-button="${group.id}"]`);
    if (button) {
      button.textContent = count ? `收录 ${count}` : '收录';
      button.disabled = busy || count === 0;
    }
  }
  els.saveAll.disabled = busy || total === 0;
  els.saveAll.textContent = total ? `收录全部选中（${total} 个页面）` : '收录全部选中';
}

function setBusy(value) {
  busy = value;
  for (const el of document.querySelectorAll('button, input, select')) {
    el.disabled = value || (el.matches?.('input[data-unsupported="1"]'));
  }
  if (!value) {
    updateActionLabels();
    for (const row of els.list.querySelectorAll('.group')) {
      const save = row.querySelector('.save-group');
      if (save) save.disabled = !row.querySelector('input[data-tab-id]:checked');
    }
  }
}

async function saveTargets(targets) {
  if (busy) return;
  if (!targets.length) {
    showError('请先选择至少一个可收藏页面');
    return;
  }

  setBusy(true);
  els.result.hidden = true;
  try {
    const reply = await send({ type: 'archive', targets, settings });
    await render();
    await loadArchives();
    showResults(reply.results || []);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function loadArchives() {
  els.archives.textContent = '';
  try {
    const reply = await send({ type: 'listArchives', settings });
    const folders = reply.folders || [];
    if (!folders.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '暂无归档';
      els.archives.append(empty);
      return;
    }
    for (const folder of folders.slice(0, 12)) {
      const row = document.createElement('div');
      row.className = 'archive-row';
      const name = document.createElement('span');
      name.className = 'archive-name';
      name.textContent = folder.title;
      name.title = folder.title;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${folder.count} 个页面`;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'link-button';
      open.textContent = '以标签组打开';
      open.addEventListener('click', () => void openArchive(folder.id));
      row.append(name, count, open);
      els.archives.append(row);
    }
  } catch (error) {
    const failed = document.createElement('div');
    failed.className = 'empty';
    failed.textContent = String(error?.message || error);
    els.archives.append(failed);
  }
}

async function openArchive(folderId) {
  if (busy) return;
  setBusy(true);
  try {
    const reply = await send({ type: 'openArchive', folderId });
    await render();
    await loadArchives();
    els.result.hidden = false;
    els.result.textContent = `已打开「${reply.title}」为标签组，共 ${reply.opened} 个页面`;
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

function showResults(results) {
  els.result.hidden = false;
  els.result.textContent = '';

  if (!results.length) return;
  const { added, skipped, failed } = summarize(results);

  const summary = document.createElement('div');
  summary.className = failed ? 'warn' : added ? 'ok' : 'warn';
  const parts = [`已收录 ${added} 个书签`];
  if (failed) parts.push(`失败 ${failed} 个`);
  if (skipped) parts.push(`跳过 ${skipped} 个（重复或不可收藏页面）`);
  summary.textContent = parts.join('，');
  els.result.append(summary);

  for (const item of results) {
    const line = document.createElement('div');
    const details = [`新增 ${item.added}`, `跳过 ${item.skipped}`];
    if (item.failed) details.push(`失败 ${item.failed}`);
    if (item.closed) details.push('已删除已收录页面');
    if (item.error) details.push(`错误：${item.error}`);
    line.textContent = `· ${item.folderTitle || `组 ${item.groupId}`}：${details.join('，')}`;
    if (item.folderId) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'link-button';
      open.textContent = '以标签组打开';
      open.addEventListener('click', () => void openArchive(item.folderId));
      line.append(' ', open);
    }
    els.result.append(line);
  }
}

function showError(error) {
  els.result.hidden = false;
  els.result.textContent = `操作失败：${error?.message || error}`;
}
