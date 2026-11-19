// 中英文文案与运行时语言切换；不依赖 chrome.*，便于 Node 测试。

export const SUPPORTED_LANGUAGES = ['en', 'zh'];

const MESSAGES = {
  en: {
    appTitle: 'Tab Group Archiver',
    appHint: 'Select pages to archive into bookmarks',
    settingsTitle: 'Settings',
    folderName: 'Folder name',
    folderNamePlaceholder: 'Leave blank for automatic name',
    pathPreview: 'Will archive to: {path} / {folder}',
    datePrefix: 'Prefix folder with date (YYYY-MM-DD)',
    closeAfterSave: 'Delete archived tabs after saving',
    archiveTo: 'Archive to',
    defaultDir: 'Default folder',
    bookmarksBar: 'Bookmarks bar /',
    settingsHint: 'Choose a folder to put dated group folders directly inside it. The default folder is used only when Archive to is Default.',
    archivesTitle: 'Archive history',
    refresh: 'Refresh',
    noGroups: 'No tab groups in this window',
    groupCount: '{count} tab groups in this window',
    groupCountOne: '1 tab group in this window',
    pageCount: '{count} pages',
    pageCountOne: '1 page',
    untitled: 'Untitled group',
    untitledPage: 'Untitled page',
    unsupported: 'Not bookmarkable',
    archive: 'Archive',
    archiveCount: 'Archive {count}',
    archiveTitle: 'Archive only the selected pages',
    select: 'Select',
    collapse: 'Collapse',
    selectTitle: 'Show page selection',
    collapseTitle: 'Hide page selection',
    selectAll: 'All',
    clear: 'Clear',
    defaultDestination: 'Default: Bookmarks bar / {folder}',
    emptyArchives: 'No archives yet',
    openAsGroup: 'Open as tab group',
    archiveAll: 'Archive all selected',
    archiveAllCount: 'Archive all selected ({count})',
    saving: 'Saving…',
    needSelection: 'Select at least one bookmarkable page',
    noReply: 'The background did not respond',
    operationFailed: 'Operation failed: {message}',
    added: 'Archived {count} bookmarks',
    addedOne: 'Archived 1 bookmark',
    failed: 'failed {count}',
    skipped: 'skipped {count} (duplicate or unsupported pages)',
    addedShort: 'added {count}',
    skippedShort: 'skipped {count}',
    failedShort: 'failed {count}',
    deleted: 'deleted archived tabs',
    errorLabel: 'Error',
    errorPrefix: 'Error: ',
    groupFallback: 'Group {id}',
    openResult: 'Opened “{title}” as a tab group ({count} pages)',
    restoreResult: 'Restored {count} pages to the original tab group',
    alreadyInGroup: 'These pages are already in the original tab group',
    restoreTabs: 'Undo archive',
    errorNoTargets: 'No pages selected to archive',
    errorDestinationMissing: 'The destination bookmark folder no longer exists. Choose another folder.',
    errorBookmarksBar: 'Could not find the Bookmarks bar',
    errorArchiveMissing: 'The archive folder does not exist',
    errorArchiveEmpty: 'This archive has no openable pages',
    errorArchiveInvalid: 'Invalid archive folder',
    defaultRoot: 'Archive',
  },
  zh: {
    appTitle: '收录标签组',
    appHint: '选择要归档的页面，存成书签文件夹',
    settingsTitle: '设置',
    folderName: '文件夹名',
    folderNamePlaceholder: '留空使用自动名称',
    pathPreview: '将归档到：{path} / {folder}',
    datePrefix: '文件夹名带日期（YYYY-MM-DD）',
    closeAfterSave: '归档成功后删除已收录页面',
    archiveTo: '归档到',
    defaultDir: '默认目录',
    bookmarksBar: '书签栏 /',
    settingsHint: '选择具体文件夹后，日期子文件夹直接建在该文件夹下；默认目录仅在「归档到」为默认时使用。',
    archivesTitle: '历史归档',
    refresh: '刷新',
    noGroups: '当前窗口没有标签组',
    groupCount: '当前窗口有 {count} 个标签组',
    groupCountOne: '当前窗口有 1 个标签组',
    pageCount: '{count} 个页面',
    pageCountOne: '1 个页面',
    untitled: '未命名组',
    untitledPage: '未命名页面',
    unsupported: '不可收藏',
    archive: '收录',
    archiveCount: '收录 {count}',
    archiveTitle: '只收录当前选中的页面',
    select: '选择',
    collapse: '收起',
    selectTitle: '展开页面选择',
    collapseTitle: '收起页面选择',
    selectAll: '全选',
    clear: '清空',
    defaultDestination: '默认：书签栏 / {folder}',
    emptyArchives: '暂无归档',
    openAsGroup: '以标签组打开',
    archiveAll: '收录全部选中',
    archiveAllCount: '收录全部选中（{count} 个页面）',
    saving: '收录中…',
    needSelection: '请先选择至少一个可收藏页面',
    noReply: '后台没有返回结果',
    operationFailed: '操作失败：{message}',
    added: '已收录 {count} 个书签',
    addedOne: '已收录 1 个书签',
    failed: '失败 {count} 个',
    skipped: '跳过 {count} 个（重复或不可收藏页面）',
    addedShort: '新增 {count}',
    skippedShort: '跳过 {count}',
    failedShort: '失败 {count}',
    deleted: '已删除已收录页面',
    errorLabel: '错误',
    errorPrefix: '错误：',
    groupFallback: '组 {id}',
    openResult: '已打开「{title}」为标签组，共 {count} 个页面',
    restoreResult: '已将 {count} 个页面恢复到原标签组',
    alreadyInGroup: '这些页面已经在原标签组中',
    restoreTabs: '撤销归档',
    errorNoTargets: '没有选择要收录的页面',
    errorDestinationMissing: '目标书签文件夹不存在或已被删除，请重新选择',
    errorBookmarksBar: '找不到书签栏',
    errorArchiveMissing: '归档文件夹不存在',
    errorArchiveEmpty: '这个归档里没有可打开的页面',
    errorArchiveInvalid: '归档文件夹无效',
    defaultRoot: '需求归档',
  },
};

export function normalizeLanguage(value, fallback = 'en') {
  return SUPPORTED_LANGUAGES.includes(value) ? value : fallback;
}

export function t(language, key, params = {}) {
  const table = MESSAGES[normalizeLanguage(language)] || MESSAGES.en;
  const template = table[key] ?? MESSAGES.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

export function defaultRootFolder(language) {
  return t(language, 'defaultRoot');
}

export function untitledGroup(language) {
  return t(language, 'untitled');
}

export function applyStaticI18n(language, root = document) {
  const lang = normalizeLanguage(language);
  root.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(lang, el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(lang, el.dataset.i18nTitle);
  }
  for (const button of root.querySelectorAll('[data-lang]')) {
    const active = button.dataset.lang === lang;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}
