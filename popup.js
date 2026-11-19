import {
  buildFolderTitle,
  defaultSettingsFor,
  isBookmarkableUrl,
  normalizeRootFolder,
  pickTabUrl,
  summarize,
} from './lib.js';
import {
  applyStaticI18n,
  defaultRootFolder,
  normalizeLanguage,
  t,
  untitledGroup,
} from './i18n.js';

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
  languageSwitch: document.getElementById('languageSwitch'),
};

let settings = defaultSettingsFor('en');
let groups = [];
let destinations = [];
let selectedByGroup = new Map();
let folderDrafts = new Map();
let folderEdited = new Set();
let busy = false;
let language = 'en';

init();

async function init() {
  const stored = (await chrome.storage.local.get('settings')).settings;
  language = normalizeLanguage(stored?.language, 'en');
  settings = { ...defaultSettingsFor(language), ...(stored || {}), language };
  if (!stored?.rootFolder) settings.rootFolder = defaultRootFolder(language);
  settings.rootFolder = normalizeRootFolder(settings.rootFolder, defaultRootFolder(language));
  settings.destinationFolderId = typeof settings.destinationFolderId === 'string' && settings.destinationFolderId
    ? settings.destinationFolderId
    : null;

  applyStaticI18n(language);
  els.datePrefix.checked = settings.datePrefix;
  els.closeAfterSave.checked = settings.closeAfterSave;
  els.rootFolder.value = settings.rootFolder;

  els.datePrefix.addEventListener('change', persistSettings);
  els.closeAfterSave.addEventListener('change', persistSettings);
  els.rootFolder.addEventListener('change', persistSettings);
  els.destination.addEventListener('change', persistSettings);
  els.refreshArchives.addEventListener('click', () => void loadArchives());
  els.saveAll.addEventListener('click', () => saveTargets(targetsFromGroups()));
  els.languageSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lang]');
    if (button) void changeLanguage(button.dataset.lang);
  });

  await loadDestinations();
  await render();
  await loadArchives();
}

async function changeLanguage(next) {
  const normalized = normalizeLanguage(next, language);
  if (busy || normalized === language) return;

  const oldDefault = defaultRootFolder(language);
  const nextDefault = defaultRootFolder(normalized);
  if (settings.rootFolder === oldDefault) settings.rootFolder = nextDefault;

  language = normalized;
  settings.language = normalized;
  settings.rootFolder = normalizeRootFolder(settings.rootFolder, nextDefault);
  applyStaticI18n(language);
  els.rootFolder.value = settings.rootFolder;
  if (els.destination.options[0]) {
    els.destination.options[0].text = t(language, 'defaultDestination', { folder: settings.rootFolder });
  }
  await chrome.storage.local.set({ settings });
  await render();
  await loadArchives();
}

async function send(message) {
  const reply = await chrome.runtime.sendMessage(message);
  if (!reply) throw new Error(t(language, 'noReply'));
  if (reply.ok === false) throw new Error(reply.error || t(language, 'operationFailed', { message: '' }));
  return reply;
}

async function persistSettings() {
  const destinationFolderId = els.destination.value || null;
  settings = {
    ...settings,
    datePrefix: els.datePrefix.checked,
    closeAfterSave: els.closeAfterSave.checked,
    rootFolder: normalizeRootFolder(els.rootFolder.value, defaultRootFolder(language)),
    destinationFolderId,
    language,
  };
  els.rootFolder.value = settings.rootFolder;
  refreshFolderNames();
  if (els.destination.options[0]) {
    els.destination.options[0].text = t(language, 'defaultDestination', { folder: settings.rootFolder });
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
  els.destination.append(new Option(t(language, 'defaultDestination', { folder: settings.rootFolder }), ''));
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

  const groupIds = new Set(groups.map((group) => group.id));
  for (const id of folderDrafts.keys()) {
    if (!groupIds.has(id)) {
      folderDrafts.delete(id);
      folderEdited.delete(id);
    }
  }
  for (const group of groups) {
    if (!folderEdited.has(group.id)) folderDrafts.set(group.id, defaultFolderTitle(group));
  }

  els.list.textContent = '';

  for (const group of groups) {
    selectedByGroup.set(
      group.id,
      new Set(group.tabs.filter((tab) => isBookmarkableUrl(pickTabUrl(tab))).map((tab) => tab.id)),
    );
  }

  if (!groups.length) {
    els.hint.textContent = t(language, 'noGroups');
  } else {
    els.hint.textContent = t(language, groups.length === 1 ? 'groupCountOne' : 'groupCount', { count: groups.length });
    for (const group of groups) els.list.append(groupRow(group));
  }
  updateActionLabels();
  setBusy(busy);
}

function defaultFolderTitle(group) {
  return buildFolderTitle(group.title, settings.datePrefix, new Date(), untitledGroup(language));
}

function destinationBasePath() {
  const selected = destinations.find((folder) => folder.id === settings.destinationFolderId);
  return selected?.path || `${t(language, 'bookmarksBar')} ${settings.rootFolder}`;
}

function pathPreviewText(group) {
  const input = els.list.querySelector(`[data-folder-input="${group.id}"]`);
  const folder = input?.value.trim() || defaultFolderTitle(group);
  return t(language, 'pathPreview', { path: destinationBasePath(), folder });
}

function refreshFolderNames() {
  for (const group of groups) {
    if (folderEdited.has(group.id)) continue;
    const value = defaultFolderTitle(group);
    folderDrafts.set(group.id, value);
    const input = els.list.querySelector(`[data-folder-input="${group.id}"]`);
    if (input) input.value = value;
  }
  refreshPathPreviews();
}

function refreshPathPreviews() {
  for (const group of groups) {
    const preview = els.list.querySelector(`[data-path-preview="${group.id}"]`);
    if (preview) preview.textContent = pathPreviewText(group);
  }
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
  name.textContent = group.title || untitledGroup(language);
  name.title = group.title || untitledGroup(language);

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = t(language, group.tabs.length === 1 ? 'pageCountOne' : 'pageCount', { count: group.tabs.length });

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'save-group';
  saveButton.dataset.groupButton = String(group.id);
  saveButton.title = t(language, 'archiveTitle');
  saveButton.addEventListener('click', () => {
    const tabIds = [...(selectedByGroup.get(group.id) || [])];
    void saveTargets([{ groupId: group.id, tabIds, folderTitle: folderDrafts.get(group.id) || '' }]);
  });

  head.append(dot, name, count, saveButton);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'link-button group-toggle';
  toggle.textContent = t(language, 'select');
  toggle.title = t(language, 'selectTitle');
  const tabsBox = document.createElement('div');
  tabsBox.className = 'tabs';
  tabsBox.hidden = true;

  toggle.addEventListener('click', () => {
    tabsBox.hidden = !tabsBox.hidden;
    toggle.textContent = t(language, tabsBox.hidden ? 'select' : 'collapse');
    toggle.title = t(language, tabsBox.hidden ? 'selectTitle' : 'collapseTitle');
  });

  const tools = document.createElement('div');
  tools.className = 'tabs-tools';
  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.className = 'link-button';
  selectAll.textContent = t(language, 'selectAll');
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.className = 'link-button';
  clearAll.textContent = t(language, 'clear');
  tools.append(selectAll, clearAll);

  const folderRow = document.createElement('label');
  folderRow.className = 'folder-row';
  const folderLabel = document.createElement('span');
  folderLabel.textContent = t(language, 'folderName');
  const folderInput = document.createElement('input');
  folderInput.type = 'text';
  folderInput.className = 'folder-input';
  folderInput.dataset.folderInput = String(group.id);
  folderInput.value = folderDrafts.get(group.id) || defaultFolderTitle(group);
  folderInput.placeholder = t(language, 'folderNamePlaceholder');
  folderInput.spellcheck = false;
  folderInput.addEventListener('input', () => {
    folderDrafts.set(group.id, folderInput.value);
    folderEdited.add(group.id);
    refreshPathPreviews();
  });
  folderRow.append(folderLabel, folderInput);

  const pathPreview = document.createElement('div');
  pathPreview.className = 'path-preview';
  pathPreview.dataset.pathPreview = String(group.id);
  pathPreview.textContent = t(language, 'pathPreview', {
    path: destinationBasePath(),
    folder: folderInput.value.trim() || defaultFolderTitle(group),
  });

  tabsBox.append(folderRow, pathPreview, tools);
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
    text.textContent = tab.title || url || t(language, 'untitledPage');
    text.title = url || text.textContent;
    const badge = document.createElement('span');
    badge.className = 'tab-state';
    badge.textContent = supported ? '' : t(language, 'unsupported');
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
    .map((group) => ({
      groupId: group.id,
      tabIds: [...(selectedByGroup.get(group.id) || [])],
      folderTitle: folderDrafts.get(group.id) || '',
    }))
    .filter((target) => target.tabIds.length > 0);
}

function updateActionLabels() {
  let total = 0;
  for (const group of groups) {
    const count = selectedByGroup.get(group.id)?.size || 0;
    total += count;
    const button = els.list.querySelector(`[data-group-button="${group.id}"]`);
    if (button) {
      button.textContent = t(language, count ? 'archiveCount' : 'archive', { count });
      button.disabled = busy || count === 0;
    }
  }
  els.saveAll.disabled = busy || total === 0;
  els.saveAll.textContent = total
    ? t(language, 'archiveAllCount', { count: total })
    : t(language, 'archiveAll');
}

function setBusy(value) {
  busy = value;
  for (const el of document.querySelectorAll('button, input, select')) {
    el.disabled = value || (el.matches?.('input[data-unsupported="1"]'));
  }
  if (value) {
    els.saveAll.textContent = t(language, 'saving');
    return;
  }
  updateActionLabels();
  for (const row of els.list.querySelectorAll('.group')) {
    const save = row.querySelector('.save-group');
    if (save) save.disabled = !row.querySelector('input[data-tab-id]:checked');
  }
}

async function saveTargets(targets) {
  if (busy) return;
  if (!targets.length) {
    showError(t(language, 'needSelection'));
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
      empty.textContent = t(language, 'emptyArchives');
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
      count.textContent = t(language, folder.count === 1 ? 'pageCountOne' : 'pageCount', { count: folder.count });
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'link-button';
      open.textContent = t(language, 'openAsGroup');
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
    const reply = await send({ type: 'openArchive', folderId, language });
    await render();
    await loadArchives();
    els.result.hidden = false;
    els.result.textContent = t(language, 'openResult', { title: reply.title, count: reply.opened });
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
  const separator = language === 'zh' ? '，' : ', ';

  const summary = document.createElement('div');
  summary.className = failed ? 'warn' : added ? 'ok' : 'warn';
  const parts = [t(language, added === 1 ? 'addedOne' : 'added', { count: added })];
  if (failed) parts.push(t(language, 'failed', { count: failed }));
  if (skipped) parts.push(t(language, 'skipped', { count: skipped }));
  summary.textContent = parts.join(separator);
  els.result.append(summary);

  for (const item of results) {
    const line = document.createElement('div');
    const details = [
      t(language, 'addedShort', { count: item.added }),
      t(language, 'skippedShort', { count: item.skipped }),
    ];
    if (item.failed) details.push(t(language, 'failedShort', { count: item.failed }));
    if (item.closed) details.push(t(language, 'deleted'));
    if (item.error) details.push(`${t(language, 'errorLabel')}: ${item.error}`);
    const title = item.folderTitle || t(language, 'groupFallback', { id: item.groupId });
    line.textContent = `· ${title}: ${details.join(separator)}`;
    if (item.folderId) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'link-button';
      open.textContent = t(language, 'openAsGroup');
      open.addEventListener('click', () => void openArchive(item.folderId));
      line.append(' ', open);
    }
    els.result.append(line);
  }
}

function showError(error) {
  els.result.hidden = false;
  els.result.textContent = t(language, 'operationFailed', { message: error?.message || error });
}
