const { app, BrowserWindow, Menu, dialog, ipcMain, shell, net, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');

const APP_VERSION = require('../package.json').version;
const VERSION_MATCH = APP_VERSION.match(/^(\d+\.\d+\.\d+)-(\d{8})$/);
const APP_VERSION_DISPLAY = VERSION_MATCH
  ? `v${VERSION_MATCH[1]} (Date ${VERSION_MATCH[2]})`
  : `v${APP_VERSION}`;
const ROOT = path.join(__dirname, '..');
const ZH = require('./locales/zh-CN.json');
const EN = require('./locales/en-US.json');
let currentLanguage = 'zh-CN';
function t(key) {
  return (currentLanguage === 'en-US' ? EN : ZH)[key] || ZH[key] || key;
}
function tText(text) {
  if (currentLanguage !== 'en-US' || typeof text !== 'string') return text;
  const hit = Object.keys(ZH).find((key) => ZH[key] === text);
  return hit ? EN[hit] || text : text;
}

const MD_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']);
const THEME_BG = { light: '#ffffff', dark: '#191a1d', sepia: '#f6f1e5' };

const rawArgs = process.argv.slice(app.isPackaged ? 1 : 2);
const flagValue = (name) => {
  const hit = rawArgs.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ARTIFACT_DIR = app.isPackaged
  ? path.join(app.getPath('userData'), 'test-output')
  : path.join(ROOT, 'test', 'output');
const artifact = (p) => (p ? (path.isAbsolute(p) ? p : path.join(ARTIFACT_DIR, p)) : null);
const capturePath = artifact(flagValue('capture'));
const pdfOut = artifact(flagValue('pdf-out'));
const scrollVal = Number(flagValue('scroll')) || 0;
const themeFlag = flagValue('theme');
const findText = flagValue('find');
const imgOut = artifact(flagValue('img-out'));
const fontFlag = flagValue('font');
const editFlag = rawArgs.includes('--edit');
const editTest = rawArgs.includes('--edit-test');
const insertTest = rawArgs.includes('--insert-test');
const syncTest = rawArgs.includes('--sync-test');
const wysiwygTest = rawArgs.includes('--wysiwyg-test');
const overlayShot = rawArgs.includes('--overlay-shot');
const imageShot = rawArgs.includes('--image-shot');
const clickTest = rawArgs.includes('--click-test');
const hoverShot = rawArgs.includes('--hover-shot');
const undoTest = rawArgs.includes('--undo-test');
const hoverTableShot = rawArgs.includes('--hover-table-shot');
const colorReadTest = rawArgs.includes('--color-read-test');
const colorFocusTest = rawArgs.includes('--color-focus-test');
const colorPanelTest = rawArgs.includes('--color-panel-test');
const colorPanelShot = rawArgs.includes('--color-panel-shot');
const floatTest = rawArgs.includes('--float-test');
const floatShot = rawArgs.includes('--float-shot');
const focusTest = rawArgs.includes('--focus-test');
const focusShot = rawArgs.includes('--focus-shot');
const treeTest = rawArgs.includes('--tree-test');
const treeShot = rawArgs.includes('--tree-shot');
const replaceTest = rawArgs.includes('--replace-test');
const replaceShot = rawArgs.includes('--replace-shot');
const typoTest = rawArgs.includes('--typo-test');
const typoShot = rawArgs.includes('--typo-shot');
const edgeTest = rawArgs.includes('--edge-test');
const dirtyExport = rawArgs.includes('--dirty-export');
const updateTest = rawArgs.includes('--update-test');
const updateMockNewer = rawArgs.includes('--update-mock-newer');
const linkTest = rawArgs.includes('--link-test');
const rapidTest = rawArgs.includes('--rapid-test');
const linkShot = rawArgs.includes('--link-shot');
const listTest = rawArgs.includes('--list-test');
const pasteTest = rawArgs.includes('--paste-test');
const tableTest = rawArgs.includes('--table-test');
const breakTest = rawArgs.includes('--break-test');
const wideShot = rawArgs.includes('--wide-shot');
const featTest = rawArgs.includes('--feat-test');
const uxTest = rawArgs.includes('--ux-test');
const audit2Test = rawArgs.includes('--audit2-test');
const audit3Test = rawArgs.includes('--audit3-test');
const audit4Test = rawArgs.includes('--audit4-test');
const audit5Test = rawArgs.includes('--audit5-test');
const pandocMock = rawArgs.includes('--pandoc-mock');
const uploadMock = rawArgs.includes('--upload-mock');
const devTestMode = rawArgs.some((a) => a.startsWith('--') && /(test|shot|mock)/.test(a));
const htmlOut = artifact(flagValue('html-out'));
if (capturePath || pdfOut || imgOut || htmlOut) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
const watchTest = rawArgs.includes('--watch-test');
const noRestore = rawArgs.includes('--no-restore');
const fileArg = rawArgs.find(
  (a) => !a.startsWith('--') && a !== '.' && MD_EXTS.has(path.extname(a).toLowerCase()) && fs.existsSync(a)
);

let win = null;
let currentFile = null;
let watcher = null;
let watchTimer = null;
let autoOpenDone = false;
let devPdfTarget = null;
let devPdfResolve = null;
let devImgTarget = null;
let devImgResolve = null;
let devHtmlTarget = null;
let devHtmlResolve = null;
let devPandocTarget = null;
const externalOpens = [];
let devRunStarted = false;
let devOriginalLanguage = null;
let editMode = false;
let selfWrite = null;

const config = { theme: 'light', font: 'sans', zoom: 0, sidebar: true, wide: false, spellcheck: false, language: 'auto', direction: 'auto', customCssEnabled: true, snapshotEnabled: true, snapshotMax: 50, snapshotDays: 30, pandocPath: '', imageUploadCommand: '', recent: [], lastFile: null, window: null };
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const customCssPath = () => path.join(app.getPath('userData'), 'custom.css');

function resolvedLanguage() {
  if (config.language === 'en-US' || config.language === 'zh-CN') return config.language;
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}
function setLanguage(lang) {
  config.language = lang;
  currentLanguage = resolvedLanguage();
  saveConfig();
  buildMenu();
  win?.webContents.send('language:set', currentLanguage);
}
function ensureCustomCss() {
  try {
    if (!fs.existsSync(customCssPath())) fs.writeFileSync(customCssPath(), ZH.customCssTemplate, 'utf8');
  } catch {}
}
function sanitizeCustomCss(css) {
  return String(css || '')
    .replace(/@import[^;]+;/gi, '')
    .replace(/url\(\s*(['"]?)(?:https?:|\/\/)[^)]+\)\1/gi, 'none');
}
function sendCustomCss() {
  let css = '';
  try { css = fs.readFileSync(customCssPath(), 'utf8'); } catch {}
  win?.webContents.send('customCss:set', { enabled: config.customCssEnabled !== false, css: sanitizeCustomCss(css) });
}
function sendDirection() {
  win?.webContents.send('direction:set', config.direction || 'auto');
}

const historyRoot = () => path.join(app.getPath('userData'), 'history');
const historyDir = (file) => path.join(historyRoot(), crypto.createHash('sha256').update(path.resolve(file)).digest('hex').slice(0, 20));
async function writeAtomic(file, content) {
  const tmp = file + '.tmp-' + process.pid;
  await fs.promises.writeFile(tmp, content, 'utf8');
  await fs.promises.rename(tmp, file);
}
async function captureSnapshot(file, content) {
  if (!config.snapshotEnabled || !file || typeof content !== 'string') return;
  const dir = historyDir(file);
  await fs.promises.mkdir(dir, { recursive: true });
  let names = [];
  try { names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith('.md')).sort().reverse(); } catch {}
  if (names.length) {
    try { if ((await fs.promises.readFile(path.join(dir, names[0]), 'utf8')) === content) return; } catch {}
  }
  const id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  await writeAtomic(path.join(dir, id + '.md'), content);
  names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith('.md')).sort().reverse();
  const cutoff = Date.now() - Math.max(1, Number(config.snapshotDays) || 30) * 86400000;
  const max = Math.max(1, Number(config.snapshotMax) || 50);
  for (let i = names.length - 1; i >= 0; i--) {
    const name = names[i];
    const stamp = parseInt(name.split('-')[0], 36) * 1000;
    if (i >= max || stamp < cutoff) await fs.promises.rm(path.join(dir, name), { force: true });
  }
}
async function listSnapshots(file) {
  const dir = historyDir(file);
  let names = [];
  try { names = (await fs.promises.readdir(dir)).filter((n) => n.endsWith('.md')).sort().reverse(); } catch { return []; }
  const items = [];
  for (const name of names.slice(0, Math.max(1, Number(config.snapshotMax) || 50))) {
    try {
      const full = path.join(dir, name);
      const st = await fs.promises.stat(full);
      const text = await fs.promises.readFile(full, 'utf8');
      items.push({ id: name.slice(0, -3), time: st.mtimeMs, size: st.size, preview: text.slice(0, 500) });
    } catch {}
  }
  return items;
}
async function restoreSnapshot(file, id) {
  if (typeof file !== 'string' || typeof id !== 'string' || !/^[a-z0-9-]+$/i.test(id)) return { saved: false };
  const snap = path.join(historyDir(file), id + '.md');
  let content;
  try { content = await fs.promises.readFile(snap, 'utf8'); } catch { return { saved: false }; }
  let current = null;
  try { current = await fs.promises.readFile(file, 'utf8'); } catch {}
  if (current !== null && current !== content) await captureSnapshot(file, current);
  await writeAtomic(file, content);
  selfWrite = content;
  win?.webContents.send('file:changed', { content });
  return { saved: true };
}
ipcMain.handle('history:list', (e, file) => listSnapshots(file));
ipcMain.handle('history:restore', (e, file, id) => restoreSnapshot(file, id));

async function pandocStatus() {
  if (pandocMock) return { available: true, version: 'mock', path: 'mock-pandoc' };
  const exe = config.pandocPath || 'pandoc';
  return new Promise((resolve) => {
    const child = spawn(exe, ['--version'], { shell: false, windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { child.kill(); resolve({ available: false, version: '', path: exe }); }, 5000);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => { clearTimeout(timer); resolve({ available: false, version: '', path: exe }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ available: code === 0, version: out.split('\n')[0] || '', path: exe }); });
  });
}
ipcMain.handle('pandoc:status', () => pandocStatus());
ipcMain.handle('pandoc:export', async (e, format) => {
  if (!win || !currentFile) return { canceled: true };
  const map = { docx: ['docx', 'Word 文档'], odt: ['odt', 'OpenDocument'], rtf: ['rtf', 'RTF'], epub: ['epub', 'Epub'], latex: ['tex', 'LaTeX'] };
  const spec = map[format];
  if (!spec) return { error: 'Unsupported format' };
  let output = devPandocTarget;
  if (output) devPandocTarget = null;
  else {
    const base = path.basename(currentFile, path.extname(currentFile));
    const res = await dialog.showSaveDialog(win, { title: t('pandocExport'), defaultPath: path.join(path.dirname(currentFile), base + '.' + spec[0]), filters: [{ name: spec[1], extensions: [spec[0]] }] });
    if (res.canceled || !res.filePath) return { canceled: true };
    output = res.filePath;
  }
  if (pandocMock) {
    await writeAtomic(output, 'mock pandoc export: ' + format);
    return { saved: true, path: output };
  }
  const status = await pandocStatus();
  if (!status.available) return { error: t('pandocUnavailable') };
  const temp = path.join(os.tmpdir(), `markview-${process.pid}-${Date.now()}.md`);
  try {
    await fs.promises.writeFile(temp, await fs.promises.readFile(currentFile, 'utf8'), 'utf8');
    await new Promise((resolve, reject) => {
      const child = spawn(status.path, ['--from=gfm', '--to=' + format, temp, '-o', output], { shell: false, windowsHide: true });
      let err = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 60000);
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(err || ('exit ' + code))); });
    });
    return { saved: true, path: output };
  } catch (err) {
    return { error: err.message || String(err) };
  } finally {
    await fs.promises.rm(temp, { force: true });
  }
});

function loadConfig() {
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(configPath(), 'utf8')));
  } catch {}
}

let saveTimer = null;
function saveConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
    } catch {}
  }, 250);
}
function beginDevLanguageIsolation() {
  if (!devTestMode || devOriginalLanguage !== null) return;
  devOriginalLanguage = config.language;
  config.language = 'zh-CN';
  currentLanguage = 'zh-CN';
  buildMenu();
  win?.webContents.send('language:set', 'zh-CN');
}
function restoreDevLanguageIsolation() {
  if (devOriginalLanguage === null) return;
  config.language = devOriginalLanguage;
  currentLanguage = resolvedLanguage();
  buildMenu();
  try { fs.writeFileSync(configPath(), JSON.stringify(config, null, 2)); } catch {}
  devOriginalLanguage = null;
}

function applyZoom() {
  win?.webContents.setZoomLevel(config.zoom);
}

function setZoom(level) {
  config.zoom = Math.max(-3, Math.min(4, level));
  saveConfig();
  applyZoom();
  win?.webContents.send('zoom:changed', config.zoom);
}

function setTheme(theme) {
  config.theme = theme;
  saveConfig();
  buildMenu();
  win?.setBackgroundColor(THEME_BG[theme] || THEME_BG.light);
  win?.webContents.send('theme:set', theme);
}

function setFont(font) {
  config.font = font;
  saveConfig();
  buildMenu();
  win?.webContents.send('font:set', font);
}

function createWindow() {
  const b = config.window || {};
  win = new BrowserWindow({
    width: b.width || 1200,
    height: b.height || 800,
    x: b.x,
    y: b.y,
    minWidth: 860,
    minHeight: 560,
    show: false,
    backgroundColor: THEME_BG[config.theme] || THEME_BG.light,
    title: 'MarkView',
    icon: path.join(ROOT, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  win.webContents.session.setSpellCheckerLanguages(config.spellcheck ? ['en-US'] : []);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (devTestMode) win.webContents.setBackgroundThrottling(false);
  win.once('ready-to-show', () => {
    win.show();
    applyZoom();
  });
  win.webContents.on('did-finish-load', () => {
    applyZoom();
    win?.webContents.send('language:set', currentLanguage);
    sendCustomCss();
    sendDirection();
  });
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    console.log(`[renderer] ${message} (${sourceId}:${line})`);
  });

  let boundsTimer = null;
  const saveBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (win && !win.isMinimized() && !win.isMaximized()) {
        config.window = win.getBounds();
        saveConfig();
      }
    }, 400);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('closed', () => {
    stopWatch();
    win = null;
  });

  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('found-in-page', (e, result) => {
    win?.webContents.send('find:result', { active: result.activeMatchOrdinal, total: result.matches });
  });
}

function buildMenu() {
  const recentItems = config.recent.length
    ? [
        ...config.recent.map((p) => ({ label: path.basename(p), click: () => openPath(p) })),
        { type: 'separator' },
        {
          label: '清空最近打开',
          click: () => {
            config.recent = [];
            config.lastFile = null;
            saveConfig();
            buildMenu();
            win?.webContents.send('recent:cleared');
          },
        },
      ]
    : [{ label: '（无）', enabled: false }];

  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => openDialog() },
        { label: '最近打开', submenu: recentItems },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => win?.webContents.send('menu:save') },
        { label: '版本历史…', id: 'history-open', click: () => win?.webContents.send('menu:history') },
        { label: '自动快照', id: 'snapshot-toggle', type: 'checkbox', checked: config.snapshotEnabled !== false, click: (mi) => { config.snapshotEnabled = mi.checked; saveConfig(); } },
        { type: 'separator' },
        { label: '导出为 PDF…', accelerator: 'CmdOrCtrl+P', click: () => win?.webContents.send('pdf:prepare') },
        { label: '导出为长图…', accelerator: 'CmdOrCtrl+Shift+E', click: () => win?.webContents.send('image:prepare') },
        { label: '导出为 HTML…', accelerator: 'CmdOrCtrl+Shift+H', click: () => win?.webContents.send('html:prepare') },
        { label: '导出 HTML（无样式）…', click: () => win?.webContents.send('html:prepare-bare') },
        {
          label: 'Pandoc 导出',
          submenu: [
            { label: 'Word (.docx)', id: 'pandoc-docx', click: () => win?.webContents.send('pandoc:export', 'docx') },
            { label: 'OpenDocument (.odt)', id: 'pandoc-odt', click: () => win?.webContents.send('pandoc:export', 'odt') },
            { label: 'RTF (.rtf)', id: 'pandoc-rtf', click: () => win?.webContents.send('pandoc:export', 'rtf') },
            { label: 'Epub (.epub)', id: 'pandoc-epub', click: () => win?.webContents.send('pandoc:export', 'epub') },
            { label: 'LaTeX (.tex)', id: 'pandoc-latex', click: () => win?.webContents.send('pandoc:export', 'latex') },
          ],
        },
        {
          label: 'Pandoc / 图床设置…',
          id: 'integration-settings',
          click: () => win?.webContents.send('menu:integration-settings'),
        },
        { type: 'separator' },
        { label: '关闭窗口', role: 'close' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => win?.webContents.send('menu:undo') },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', click: () => win?.webContents.send('menu:redo') },
        { type: 'separator' },
        { label: '查找…', accelerator: 'CmdOrCtrl+F', click: () => win?.webContents.send('menu:find') },
        { type: 'separator' },
        { label: '复制', role: 'copy' },
        { label: '复制为 Markdown', click: () => win?.webContents.send('menu:copy-md') },
        { label: '复制为 HTML', click: () => win?.webContents.send('menu:copy-html') },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '插入',
      submenu: [
        {
          label: '标题',
          submenu: [
            { label: '一级标题', accelerator: 'CmdOrCtrl+1', click: () => win?.webContents.send('menu:insert', 'h1') },
            { label: '二级标题', accelerator: 'CmdOrCtrl+2', click: () => win?.webContents.send('menu:insert', 'h2') },
            { label: '三级标题', accelerator: 'CmdOrCtrl+3', click: () => win?.webContents.send('menu:insert', 'h3') },
            { label: '四级标题', accelerator: 'CmdOrCtrl+4', click: () => win?.webContents.send('menu:insert', 'h4') },
            { label: '五级标题', accelerator: 'CmdOrCtrl+5', click: () => win?.webContents.send('menu:insert', 'h5') },
            { label: '六级标题', accelerator: 'CmdOrCtrl+6', click: () => win?.webContents.send('menu:insert', 'h6') },
          ],
        },
        { type: 'separator' },
        { label: '加粗', accelerator: 'CmdOrCtrl+B', click: () => win?.webContents.send('menu:insert', 'bold') },
        { label: '斜体', accelerator: 'CmdOrCtrl+I', click: () => win?.webContents.send('menu:insert', 'italic') },
        { label: '删除线', click: () => win?.webContents.send('menu:insert', 'strike') },
        { label: '下划线', click: () => win?.webContents.send('menu:insert', 'underline') },
        { label: '高亮', click: () => win?.webContents.send('menu:insert', 'mark') },
        { label: '上标', click: () => win?.webContents.send('menu:insert', 'sup') },
        { label: '下标', click: () => win?.webContents.send('menu:insert', 'sub') },
        { label: '行内代码', click: () => win?.webContents.send('menu:insert', 'code') },
        { label: '代码块', accelerator: 'CmdOrCtrl+Shift+C', click: () => win?.webContents.send('menu:insert', 'codeblock') },
        { label: '文字颜色…', click: () => win?.webContents.send('menu:insert', 'color:panel') },
        { type: 'separator' },
        { label: '链接', accelerator: 'CmdOrCtrl+K', click: () => win?.webContents.send('menu:insert', 'link') },
        { label: '图片…', accelerator: 'CmdOrCtrl+Shift+P', click: () => win?.webContents.send('menu:insert', 'image') },
        { label: '表格', click: () => win?.webContents.send('menu:insert', 'table') },
        { type: 'separator' },
        { label: '无序列表', click: () => win?.webContents.send('menu:insert', 'ul') },
        { label: '有序列表', click: () => win?.webContents.send('menu:insert', 'ol') },
        { label: '任务列表', click: () => win?.webContents.send('menu:insert', 'task') },
        { label: '引用', click: () => win?.webContents.send('menu:insert', 'quote') },
        { label: '分隔线', click: () => win?.webContents.send('menu:insert', 'hr') },
        { label: '数学公式', click: () => win?.webContents.send('menu:insert', 'math') },
        { label: '行内公式', click: () => win?.webContents.send('menu:insert', 'imath') },
        { label: '脚注', click: () => win?.webContents.send('menu:insert', 'footnote') },
        { type: 'separator' },
        { label: 'Mermaid 流程图', click: () => win?.webContents.send('menu:insert', 'mflow') },
        { label: 'Mermaid 时序图', click: () => win?.webContents.send('menu:insert', 'mseq') },
        { label: 'Mermaid 饼图', click: () => win?.webContents.send('menu:insert', 'mpie') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '源码模式',
          type: 'checkbox',
          checked: editMode,
          accelerator: 'CmdOrCtrl+E',
          click: () => win?.webContents.send('menu:toggle-edit'),
        },
        {
          label: '英文拼写检查',
          id: 'spellcheck-toggle',
          type: 'checkbox',
          checked: config.spellcheck === true,
          click: (mi) => {
            config.spellcheck = mi.checked;
            saveConfig();
            win?.webContents.session.setSpellCheckerLanguages(mi.checked ? ['en-US'] : []);
            win?.webContents.send('spellcheck:set', mi.checked);
          },
        },
        {
          label: '宽屏视图',
          type: 'checkbox',
          checked: config.wide === true,
          click: (mi) => {
            config.wide = mi.checked;
            saveConfig();
            win?.webContents.send('wide:set', mi.checked);
          },
        },
        {
          label: '聚焦模式',
          type: 'checkbox',
          checked: config.focusMode === true,
          accelerator: 'F8',
          click: (mi) => {
            config.focusMode = mi.checked;
            saveConfig();
            win?.webContents.send('focus:set', mi.checked);
          },
        },
        {
          label: '打字机模式',
          type: 'checkbox',
          checked: config.typewriterMode === true,
          accelerator: 'F9',
          click: (mi) => {
            config.typewriterMode = mi.checked;
            saveConfig();
            win?.webContents.send('typewriter:set', mi.checked);
          },
        },
        { label: '大纲侧栏', accelerator: 'CmdOrCtrl+Shift+L', click: () => win?.webContents.send('menu:toggle-sidebar') },
        { type: 'separator' },
        { label: '浅色主题', type: 'radio', checked: config.theme === 'light', click: () => setTheme('light') },
        { label: '深色主题', type: 'radio', checked: config.theme === 'dark', click: () => setTheme('dark') },
        { label: '护眼主题', type: 'radio', checked: config.theme === 'sepia', click: () => setTheme('sepia') },
        { type: 'separator' },
        { label: '黑体', type: 'radio', checked: config.font !== 'serif', click: () => setFont('sans') },
        { label: '衬线', type: 'radio', checked: config.font === 'serif', click: () => setFont('serif') },
        { label: '字体与排版…', click: () => win?.webContents.send('menu:typography') },
        {
          label: '语言',
          submenu: [
            { label: '简体中文', id: 'language-zh', type: 'radio', checked: currentLanguage === 'zh-CN', click: () => setLanguage('zh-CN') },
            { label: 'English', id: 'language-en', type: 'radio', checked: currentLanguage === 'en-US', click: () => setLanguage('en-US') },
          ],
        },
        {
          label: '正文方向',
          submenu: [
            { label: '自动', id: 'direction-auto', type: 'radio', checked: (config.direction || 'auto') === 'auto', click: () => { config.direction = 'auto'; saveConfig(); sendDirection(); } },
            { label: '从左到右 (LTR)', id: 'direction-ltr', type: 'radio', checked: config.direction === 'ltr', click: () => { config.direction = 'ltr'; saveConfig(); sendDirection(); } },
            { label: '从右到左 (RTL)', id: 'direction-rtl', type: 'radio', checked: config.direction === 'rtl', click: () => { config.direction = 'rtl'; saveConfig(); sendDirection(); } },
          ],
        },
        {
          label: '自定义 CSS…',
          submenu: [
            { label: '打开自定义 CSS', click: () => { ensureCustomCss(); shell.openPath(customCssPath()); } },
            { label: '启用自定义 CSS', id: 'custom-css-toggle', type: 'checkbox', checked: config.customCssEnabled !== false, click: (mi) => { config.customCssEnabled = mi.checked; saveConfig(); sendCustomCss(); } },
            { label: '重新加载自定义 CSS', click: sendCustomCss },
          ],
        },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => setZoom(config.zoom + 0.5) },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => setZoom(config.zoom - 0.5) },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+0', click: () => setZoom(0) },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
        { label: '开发者工具', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '检查更新…', click: () => win?.webContents.send('menu:check-update') },
        {
          label: '关于 MarkView',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: '关于 MarkView',
              message: APP_VERSION_DISPLAY,
              detail: '简洁的本地 Markdown 阅读与编辑工具。\n支持大纲导航、主题切换、代码高亮、数学公式、图表与 PDF 导出。',
              buttons: ['好'],
            }),
        },
      ],
    },
  ];
  const translate = (items) => {
    for (const item of items) {
      if (item.label) item.label = tText(item.label);
      if (item.submenu) translate(item.submenu);
    }
  };
  translate(template);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openDialog() {
  const res = await dialog.showOpenDialog(win, {
    title: '打开 Markdown 文件',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (!res.canceled && res.filePaths[0]) openPath(res.filePaths[0]);
}

async function openPath(p) {
  if (!win) return;
  p = path.resolve(p);
  let content;
  try {
    content = await fs.promises.readFile(p, 'utf8');
  } catch (err) {
    dialog.showErrorBox('无法打开文件', `${p}\n\n${err.message}`);
    return;
  }
  currentFile = p;
  config.lastFile = p;
  config.recent = [p, ...config.recent.filter((x) => x !== p)].slice(0, 10);
  saveConfig();
  buildMenu();
  win.setTitle(`${path.basename(p)} — MarkView`);
  win.webContents.send('file:opened', { path: p, dir: path.dirname(p), name: path.basename(p), content });
  watchFile(p);
}

function stopWatch() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  clearTimeout(watchTimer);
}

function watchFile(p) {
  stopWatch();
  const pushUpdate = async () => {
    if (currentFile !== p || !win) return;
    try {
      const content = await fs.promises.readFile(p, 'utf8');
      if (selfWrite !== null && content === selfWrite) {
        selfWrite = null;
        return;
      }
      win.webContents.send('file:changed', { content });
    } catch {}
  };
  const start = () => {
    try {
      watcher = fs.watch(p, { persistent: false }, (event) => {
        if (event === 'rename') {
          // 编辑器常用“原子保存”（先写临时文件再改名），需要重新挂载监听
          stopWatch();
          setTimeout(() => {
            if (currentFile === p && fs.existsSync(p)) {
              start();
              pushUpdate();
            }
          }, 300);
          return;
        }
        clearTimeout(watchTimer);
        watchTimer = setTimeout(pushUpdate, 250);
      });
      watcher.on('error', stopWatch);
    } catch {}
  };
  start();
}

const PDF_OPTIONS = {
  printBackground: true,
  pageSize: 'A4',
  margins: { top: 0.7, bottom: 0.7, left: 0.6, right: 0.6 },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font-size:9px;color:#999999;text-align:center;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
};

ipcMain.handle('dialog:open', () => openDialog());
ipcMain.handle('file:open', (e, p) => {
  if (typeof p === 'string') openPath(p);
});
ipcMain.handle('config:get', () => config);
function parseVer(v) {
  const m = String(v).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-(\d{8}))?$/);
  return m ? [+m[1], +m[2], +m[3], +(m[4] || 0)] : null;
}
function isNewer(a, b) {
  const pa = parseVer(a);
  const pb = parseVer(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 4; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
}
function displayVer(tag) {
  const m = String(tag).match(/^(\d+\.\d+\.\d+)-(\d{8})$/);
  return m ? `v${m[1]} (Date ${m[2]})` : String(tag);
}
ipcMain.handle('update:check', async () => {
  if (updateMockNewer) {
    return { current: APP_VERSION_DISPLAY, latest: '9.9.9-20991231', latestDisplay: 'v9.9.9 (Date 20991231)', url: 'https://github.com/Weirdo341/MarkView/releases/latest', newer: true };
  }
  try {
    const res = await net.fetch('https://api.github.com/repos/Weirdo341/MarkView/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MarkView-update-check' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { error: 'HTTP ' + res.status };
    const j = await res.json();
    const tag = String(j.tag_name || '').replace(/^v/, '');
    if (!parseVer(tag)) return { error: t('invalidRemoteVersion') + tag };
    return { current: APP_VERSION_DISPLAY, latest: tag, latestDisplay: displayVer(tag), url: j.html_url, newer: isNewer(tag, APP_VERSION) };
  } catch (e) {
    return { error: (e && e.message) || '网络不可达' };
  }
});
ipcMain.handle('fs:tree', async (e, dir) => {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const zh = (a, b) => a.localeCompare(b, 'zh');
    const dirs = entries.filter((x) => x.isDirectory() && !x.name.startsWith('.')).map((x) => x.name).sort(zh);
    const files = entries.filter((x) => x.isFile() && MD_EXTS.has(path.extname(x.name).toLowerCase())).map((x) => x.name).sort(zh);
    return { dirs, files };
  } catch {
    return { dirs: [], files: [] };
  }
});
ipcMain.handle('fs:articles', async (e, dir) => {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isFile() || !MD_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
      const full = path.join(dir, entry.name);
      const st = await fs.promises.stat(full);
      items.push({ path: full, name: entry.name, mtime: st.mtimeMs });
    }
    return items.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name, 'zh'));
  } catch {
    return [];
  }
});

const SEARCH_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'package', '.runtime', 'release']);
async function searchMarkdown(dir, query, root, results, budget) {
  if (results.length >= 200 || budget.files >= 2000) return;
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  for (const entry of entries) {
    if (results.length >= 200 || budget.files >= 2000) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !SEARCH_SKIP_DIRS.has(entry.name)) await searchMarkdown(full, query, root, results, budget);
      continue;
    }
    if (!entry.isFile() || !MD_EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    budget.files++;
    try {
      const st = await fs.promises.stat(full);
      if (st.size > 2 * 1024 * 1024) continue;
      const text = await fs.promises.readFile(full, 'utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length && results.length < 200; i++) {
        const at = lines[i].toLowerCase().indexOf(query.toLowerCase());
        if (at < 0) continue;
        results.push({
          path: full,
          name: path.relative(root, full).replace(/\\/g, '/'),
          line: i + 1,
          preview: lines[i].trim().slice(0, 180),
        });
        if (results.filter((x) => x.path === full).length >= 5) break;
      }
    } catch {}
  }
}
ipcMain.handle('fs:search', async (e, dir, query) => {
  if (typeof dir !== 'string' || typeof query !== 'string') return [];
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  const results = [];
  await searchMarkdown(path.resolve(dir), q, path.resolve(dir), results, { files: 0 });
  return results;
});

ipcMain.handle('html:imageData', async (e, p) => {
  if (typeof p !== 'string') return null;
  const mime = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp',
  }[path.extname(p).toLowerCase()];
  if (!mime) return null;
  try { return `data:${mime};base64,` + (await fs.promises.readFile(p)).toString('base64'); }
  catch { return null; }
});

ipcMain.handle('customCss:get', () => {
  let css = '';
  try { css = fs.readFileSync(customCssPath(), 'utf8'); } catch {}
  return { enabled: config.customCssEnabled !== false, css: sanitizeCustomCss(css) };
});
ipcMain.handle('customCss:reload', () => { sendCustomCss(); return true; });

ipcMain.handle('config:set', (e, patch) => {
  if (patch && typeof patch === 'object') {
    Object.assign(config, patch);
    saveConfig();
    if (patch.theme) {
      win?.setBackgroundColor(THEME_BG[config.theme] || THEME_BG.light);
      buildMenu();
    }
    if (patch.zoom != null) applyZoom();
    if (patch.spellcheck !== undefined) {
      win?.webContents.session.setSpellCheckerLanguages(patch.spellcheck ? ['en-US'] : []);
      win?.webContents.send('spellcheck:set', !!patch.spellcheck);
    }
    if (patch.language !== undefined) {
      currentLanguage = resolvedLanguage();
      buildMenu();
      win?.webContents.send('language:set', currentLanguage);
    }
    if (patch.direction !== undefined) sendDirection();
    if (patch.customCssEnabled !== undefined) sendCustomCss();
    if (patch.recent || patch.lastFile !== undefined) buildMenu();
  }
  return config;
});
ipcMain.handle('app:samplePath', () => path.join(ROOT, 'assets', 'sample.md'));
ipcMain.handle('app:version', () => APP_VERSION_DISPLAY);
ipcMain.handle('app:locale', () => currentLanguage);
ipcMain.handle('dialog:image', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'] }],
  });
  return res.canceled ? null : res.filePaths[0];
});
ipcMain.handle('image:savePaste', async (e, payload) => {
  if (!currentFile || !payload || typeof payload.b64 !== 'string') return null;
  const dir = path.join(path.dirname(currentFile), 'assets');
  await fs.promises.mkdir(dir, { recursive: true });
  const ext = String(payload.ext || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
  const name = `pasted-${Date.now()}.${ext}`;
  await fs.promises.writeFile(path.join(dir, name), Buffer.from(payload.b64, 'base64'));
  return { rel: 'assets/' + name, abs: path.join(dir, name) };
});
function parseCommandTemplate(template) {
  const args = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(template))) args.push(m[1] ?? m[2] ?? m[3]);
  return args;
}
ipcMain.handle('image:upload', async (e, file) => {
  if (typeof file !== 'string' || !fs.existsSync(file)) return { error: t('pathUnavailable') };
  if (uploadMock) return { url: 'https://example.com/uploaded.png' };
  const template = String(config.imageUploadCommand || '').trim();
  if (!template) return { error: t('uploadNotConfigured') };
  const parts = parseCommandTemplate(template);
  if (!parts.length || !parts.some((x) => x.includes('{file}'))) return { error: t('uploadCommandInvalid') };
  const exe = parts[0];
  const args = parts.slice(1).map((x) => x.split('{file}').join(file));
  return new Promise((resolve) => {
    const child = spawn(exe, args, { shell: false, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); resolve({ error: t('uploadTimeout') }); }, 30000);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ error: e.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { resolve({ error: err || ('exit ' + code) }); return; }
      const match = out.match(/https?:\/\/[^\s'"<>]+/i);
      resolve(match ? { url: match[0] } : { error: t('uploadNoUrl') });
    });
  });
});
ipcMain.handle('file:save', async (e, content) => {
  if (!currentFile || typeof content !== 'string') return { saved: false };
  let previous = null;
  try { previous = await fs.promises.readFile(currentFile, 'utf8'); } catch {}
  if (previous !== null && previous !== content) await captureSnapshot(currentFile, previous);
  await writeAtomic(currentFile, content);
  selfWrite = content;
  return { saved: true };
});
ipcMain.on('edit:changed', (e, on) => {
  editMode = Boolean(on);
  buildMenu();
});
ipcMain.handle('shell:openExternal', (e, url) => {
  if (typeof url !== 'string' || !/^https?:/i.test(url)) return;
  if (featTest) { externalOpens.push(url); return; }
  shell.openExternal(url);
});
ipcMain.handle('shell:openPath', (e, p) => {
  if (typeof p === 'string' && fs.existsSync(p)) return shell.openPath(p);
  return 'file not found';
});
ipcMain.handle('zoom:set', (e, level) => {
  if (typeof level === 'number') setZoom(level);
});
ipcMain.on('find:start', (e, text, opts) => {
  if (!win) return;
  if (text) win.webContents.findInPage(text, opts || {});
  else win.webContents.stopFindInPage('clearSelection');
});
ipcMain.on('find:stop', () => win?.webContents.stopFindInPage('clearSelection'));

ipcMain.handle('pdf:export', async () => {
  if (!win || !currentFile) return { canceled: true };
  const data = await win.webContents.printToPDF(PDF_OPTIONS);
  if (devPdfTarget) {
    const target = devPdfTarget;
    devPdfTarget = null;
    await fs.promises.writeFile(target, data);
    if (devPdfResolve) devPdfResolve();
    devPdfResolve = null;
    return { saved: true, path: target };
  }
  const defaultName = path.basename(currentFile, path.extname(currentFile)) + '.pdf';
  const res = await dialog.showSaveDialog(win, {
    title: '导出 PDF',
    defaultPath: path.join(path.dirname(currentFile), defaultName),
    filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  await fs.promises.writeFile(res.filePath, data);
  return { saved: true, path: res.filePath };
});

ipcMain.handle('image:export', async (e, dims) => {
  if (!win || !currentFile) return { canceled: true };
  const width = Number(dims && dims.width);
  const height = Number(dims && dims.height);
  if (!width || !height) return { canceled: true };
  const dbg = win.webContents.debugger;
  let attached = false;
  try {
    if (!dbg.isAttached()) {
      dbg.attach('1.3');
      attached = true;
    }
  } catch (err) {
    return { error: err.message };
  }
  try {
    const { data } = await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 2 },
    });
    const buf = Buffer.from(data, 'base64');
    if (devImgTarget) {
      const target = devImgTarget;
      devImgTarget = null;
      await fs.promises.writeFile(target, buf);
      if (devImgResolve) devImgResolve();
      devImgResolve = null;
      return { saved: true, path: target };
    }
    const defaultName = path.basename(currentFile, path.extname(currentFile)) + '.png';
    const res = await dialog.showSaveDialog(win, {
      title: '导出长图',
      defaultPath: path.join(path.dirname(currentFile), defaultName),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    await fs.promises.writeFile(res.filePath, buf);
    return { saved: true, path: res.filePath };
  } catch (err) {
    return { error: err.message };
  } finally {
    if (attached) dbg.detach();
  }
});

ipcMain.handle('clipboard:write', (e, text) => {
  if (typeof text !== 'string') return false;
  clipboard.writeText(text);
  return clipboard.readText() === text;
});
ipcMain.handle('html:export', async (e, html) => {
  if (!win || !currentFile || typeof html !== 'string') return { canceled: true };
  if (devHtmlTarget) {
    const target = devHtmlTarget;
    devHtmlTarget = null;
    await fs.promises.writeFile(target, html, 'utf8');
    if (devHtmlResolve) devHtmlResolve();
    devHtmlResolve = null;
    return { saved: true, path: target };
  }
  const defaultName = path.basename(currentFile, path.extname(currentFile)) + '.html';
  const res = await dialog.showSaveDialog(win, {
    title: '导出 HTML',
    defaultPath: path.join(path.dirname(currentFile), defaultName),
    filters: [{ name: 'HTML 文档', extensions: ['html'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  await fs.promises.writeFile(res.filePath, html, 'utf8');
  return { saved: true, path: res.filePath };
});

ipcMain.handle('html:assets', async () => {
  const out = {};
  try {
    const dir = path.join(ROOT, 'dist');
    for (const name of await fs.promises.readdir(dir)) {
      if (!name.endsWith('.woff2')) continue;
      out[name] = 'data:font/woff2;base64,' + (await fs.promises.readFile(path.join(dir, name))).toString('base64');
    }
  } catch {}
  return out;
});

ipcMain.on('render:done', async (e, info) => {
  const hasFile = Boolean(info && info.hasFile);
  if (!autoOpenDone) {
    autoOpenDone = true;
    const target =
      fileArg || (!noRestore && config.lastFile && fs.existsSync(config.lastFile) ? config.lastFile : null);
    if (target) {
      openPath(target);
      return;
    }
  }
  if ((capturePath || pdfOut || imgOut) && !devRunStarted && (hasFile || !fileArg)) {
    devRunStarted = true;
    setTimeout(async () => {
      try {
        beginDevLanguageIsolation();
        if (dirtyExport && currentFile) {
          win.webContents.send('focus:set', true);
          win.webContents.send('typewriter:set', true);
          await new Promise((r) => setTimeout(r, 300));
          await win.webContents.executeJavaScript(
            `(() => { const blk = document.getElementById('content').children[4];
               const w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
               const tn = w.nextNode(); if (!tn) return false;
               document.getElementById('content').focus();
               const r = document.createRange(); r.setStart(tn, 0); r.collapse(true);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(r);
               document.getElementById('btn-search').click();
               const i = document.getElementById('search-input');
               i.value = '引用'; i.dispatchEvent(new Event('input'));
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 900));
        }
        if (pdfOut) {
          await new Promise((resolve) => {
            devPdfResolve = resolve;
            devPdfTarget = path.resolve(pdfOut);
            setTimeout(resolve, 20000);
            win.webContents.send('pdf:prepare');
          });
        }
        if (imgOut) {
          await new Promise((resolve) => {
            devImgResolve = resolve;
            devImgTarget = path.resolve(imgOut);
            setTimeout(resolve, 20000);
            win.webContents.send('image:prepare');
          });
        }
        if ((editFlag || editTest || insertTest || syncTest) && currentFile) {
          win.webContents.send('menu:toggle-edit');
          await new Promise((r) => setTimeout(r, 600));
        }
        if (insertTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          win.webContents.send('menu:insert', 'h1');
          win.webContents.send('menu:insert', 'bold');
          win.webContents.send('menu:insert', 'color:#cf222e');
          await new Promise((r) => setTimeout(r, 1000));
          const val = await win.webContents.executeJavaScript(`document.getElementById('editor').value`);
          const hasColorSpan = await win.webContents.executeJavaScript(`!!document.querySelector('#content span[data-color]')`);
          console.log('insert test:', val.includes('# **{#cf222e}(标题)**') && hasColorSpan ? 'PASS' : 'FAIL', 'colorSpan=', hasColorSpan);
          const inEditMode = await win.webContents.executeJavaScript(`document.body.classList.contains('edit-mode')`);
          if (inEditMode) {
            win.webContents.send('menu:toggle-edit');
            await new Promise((r) => setTimeout(r, 400));
          }
          await new Promise((r) => setTimeout(r, 1200));
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 1200));
        }
        if (syncTest && currentFile) {
          const inEdit2 = await win.webContents.executeJavaScript(`document.body.classList.contains('edit-mode')`);
          if (!inEdit2) {
            win.webContents.send('menu:toggle-edit');
            await new Promise((r) => setTimeout(r, 1000));
          }
          await win.webContents.executeJavaScript(
            `(() => { const t = document.getElementById('editor');
               t.scrollTop = (t.scrollHeight - t.clientHeight) * 0.5; })()`
          );
          await new Promise((r) => setTimeout(r, 1200));
          await win.webContents.executeJavaScript(
            `(() => { const t = document.getElementById('editor');
               t.scrollTop = (t.scrollHeight - t.clientHeight) * 0.5;
               t.dispatchEvent(new Event('scroll')); })()`
          );
          await new Promise((r) => setTimeout(r, 700));
          const ratios = await win.webContents.executeJavaScript(
            `(() => { const t = document.getElementById('editor'); const p = document.getElementById('scroll');
               const r = (el) => el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
               return [r(t), r(p), t.scrollHeight - t.clientHeight, p.scrollHeight - p.clientHeight, document.body.classList.contains('edit-mode')]; })()`
          );
          console.log('sync test:', Math.abs(ratios[0] - ratios[1]) < 0.02 ? 'PASS' : 'FAIL', ratios);
          if (ratios[4]) {
            win.webContents.send('menu:toggle-edit');
            await new Promise((r) => setTimeout(r, 600));
          }
        }
        if (editTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await new Promise((r) => setTimeout(r, 200));
          await win.webContents.executeJavaScript(
            `(() => { const t = document.getElementById('editor');
               t.value += '\\n\\n自动保存测试行。\\n';
               t.dispatchEvent(new Event('input')); })()`
          );
          await new Promise((r) => setTimeout(r, 2200));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          console.log('autosave test:', now.includes('自动保存测试行') ? 'PASS' : 'FAIL');
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 600));
        }
        if (wysiwygTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await new Promise((r) => setTimeout(r, 200));
          await win.webContents.executeJavaScript(
            `(async () => {
               const p = document.querySelector('#content p[data-blk]');
               const r = p.getBoundingClientRect();
               const opt = { bubbles: true, clientX: r.x + 80, clientY: r.y + 12, button: 0 };
               p.dispatchEvent(new MouseEvent('mousedown', opt));
               p.dispatchEvent(new MouseEvent('click', opt));
               await new Promise((res) => setTimeout(res, 400));
               const cr = document.caretRangeFromPoint(opt.clientX, opt.clientY);
               if (cr) { const s0 = document.getSelection(); s0.removeAllRanges(); s0.addRange(cr); }
               const sel = document.getSelection();
               sel.modify('move', 'forward', 'character');
               sel.modify('extend', 'forward', 'character');
               sel.deleteFromDocument();
               p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
               return true;
             })()`
          );
          await new Promise((r) => setTimeout(r, 1800));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          if (now !== orig) {
            const a = orig.split('\n');
            const b = now.split('\n');
            const diffs = [];
            for (let l = 0; l < Math.max(a.length, b.length); l++) {
              if (a[l] !== b[l]) diffs.push(l + ': ' + JSON.stringify(a[l]) + ' -> ' + JSON.stringify(b[l]));
            }
            console.log('wysiwyg diffs:', diffs.slice(0, 8).join(' | '));
          }
          console.log('wysiwyg test:', now.length === orig.length - 1 && now !== orig ? 'PASS' : 'FAIL', orig.length, now.length);
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 1200));
          await win.webContents.executeJavaScript(
            `(async () => {
               const td = document.querySelector('#content table td');
               const r = td.getBoundingClientRect();
               const opt = { bubbles: true, clientX: r.x + 10, clientY: r.y + 10, button: 0 };
               td.dispatchEvent(new MouseEvent('mousedown', opt));
               td.dispatchEvent(new MouseEvent('click', opt));
               await new Promise((res) => setTimeout(res, 400));
               const cr = document.caretRangeFromPoint(opt.clientX, opt.clientY);
               if (cr) { const s0 = document.getSelection(); s0.removeAllRanges(); s0.addRange(cr); }
               const sel = document.getSelection();
               sel.modify('move', 'forward', 'character');
               sel.modify('extend', 'forward', 'character');
               sel.deleteFromDocument();
               document.querySelector('#content .table-wrap')
                 .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
               return true;
             })()`
          );
          await new Promise((r) => setTimeout(r, 1800));
          const now2 = await fs.promises.readFile(currentFile, 'utf8');
          console.log('table edit test:', now2.length === orig.length - 1 && now2 !== orig ? 'PASS' : 'FAIL', orig.length, now2.length);
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 600));
        }
        if (imageShot && currentFile) {
          await win.webContents.executeJavaScript(
            `(() => { const img = document.querySelector('#content img');
               const r = img.getBoundingClientRect();
               img.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + 40, clientY: r.y + 40 })); })()`
          );
          await new Promise((r) => setTimeout(r, 500));
        }
        if (overlayShot && currentFile) {
          await win.webContents.executeJavaScript(
            `(() => { const c = document.querySelector('#content .code-block');
               const r = c.getBoundingClientRect();
               c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + 60, clientY: r.y + 60 })); })()`
          );
          await new Promise((r) => setTimeout(r, 500));
        }
        if (clickTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await new Promise((r) => setTimeout(r, 200));
          const dbg = win.webContents.debugger;
          if (!dbg.isAttached()) dbg.attach('1.3');
          const pt = await win.webContents.executeJavaScript(
            `(() => { const p = document.querySelector('#content p[data-blk]');
               const r = p.getBoundingClientRect(); return { x: r.x + 80, y: r.y + 12 }; })()`
          );
          await dbg.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
          await dbg.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
          await new Promise((r) => setTimeout(r, 300));
          const st = await win.webContents.executeJavaScript(
            `(() => { const a = document.activeElement; const s = document.getSelection();
               return { editable: !!(a && a.isContentEditable), inside: !!(a && s.anchorNode && a.contains(s.anchorNode)) }; })()`
          );
          await dbg.sendCommand('Input.insertText', { text: 'X' });
          await new Promise((r) => setTimeout(r, 300));
          await win.webContents.executeJavaScript(
            `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))`
          );
          await new Promise((r) => setTimeout(r, 1500));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          if (now.length !== orig.length + 1) {
            const a = orig.split('\n');
            const b = now.split('\n');
            const diffs = [];
            for (let l = 0; l < Math.max(a.length, b.length); l++) {
              if (a[l] !== b[l]) diffs.push(l + ': ' + JSON.stringify((a[l] || '').slice(0, 40)) + ' -> ' + JSON.stringify((b[l] || '').slice(0, 40)));
            }
            console.log('click diffs:', diffs.slice(0, 6).join(' | '));
          }
          console.log('single-click test:', st.editable && st.inside && now.length === orig.length + 1 ? 'PASS' : 'FAIL', JSON.stringify(st), orig.length, now.length);
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          if (dbg.isAttached()) dbg.detach();
          await new Promise((r) => setTimeout(r, 600));
        }
        if (hoverShot && currentFile) {
          const dbg = win.webContents.debugger;
          if (!dbg.isAttached()) dbg.attach('1.3');
          const pt = await win.webContents.executeJavaScript(
            `(() => { const p = document.querySelector('#content p[data-blk]');
               const r = p.getBoundingClientRect(); return { x: r.x + 60, y: r.y + 10 }; })()`
          );
          await dbg.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
          await new Promise((r) => setTimeout(r, 400));
          if (dbg.isAttached()) dbg.detach();
        }
        if (wideShot && currentFile) {
          win.webContents.send('wide:set', true);
          await new Promise((r) => setTimeout(r, 400));
        }
        const waitFor = async (fn, ms) => {
          const t0 = Date.now();
          while (Date.now() - t0 < ms) {
            if (await fn()) return true;
            await new Promise((r) => setTimeout(r, 200));
          }
          return false;
        };
        const resetUi = async () => {
          await win.webContents.executeJavaScript(
            `(() => { for (const card of [...document.querySelectorAll('.link-modal:not([hidden]) .link-card')]) {
                 const b = [...card.querySelectorAll('button')].find((x) => x.textContent === '取消');
                 if (b) b.click();
               }
               document.getElementById('scroll').scrollTop = 0;
               const s = document.getSelection(); s.removeAllRanges();
               return true; })()`
          );
          await openPath(currentFile);
          await new Promise((r) => setTimeout(r, 600));
        };
        if (colorReadTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await new Promise((r) => setTimeout(r, 200));
          await win.webContents.executeJavaScript(
            `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')]
                 .find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4));
               const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= 4);
               const r = document.createRange();
               r.setStart(tn, 0); r.setEnd(tn, 4);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(r);
               return true; })()`
          );
          win.webContents.send('menu:insert', 'color:#cf222e');
          await new Promise((r) => setTimeout(r, 1200));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          console.log('color-read test:', now.includes('{#cf222e}(') ? 'PASS' : 'FAIL');
          const ae = await win.webContents.executeJavaScript(`(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : 'none'; })()`);
          console.log('color-read activeElement before undo:', ae);
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1200));
          const undone = await fs.promises.readFile(currentFile, 'utf8');
          console.log('color-read undo:', undone === orig ? 'PASS' : 'FAIL');
          if (undone !== orig) {
            console.log('color-read undo diff:', JSON.stringify(undoned.slice(0, 200)), 'orig:', JSON.stringify(orig.slice(0, 200)));
          }
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (colorFocusTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await win.webContents.executeJavaScript(
            `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')]
                 .find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4));
               document.getElementById('content').focus();
               const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= 4);
               const r = document.createRange();
               r.setStart(tn, 0); r.setEnd(tn, 4);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(r);
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 200));
          await win.webContents.executeJavaScript(`document.getElementById('btn-search').focus()`);
          await new Promise((r) => setTimeout(r, 1600));
          win.webContents.send('menu:insert', 'color:#cf222e');
          await new Promise((r) => setTimeout(r, 1400));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          const stillRead = await win.webContents.executeJavaScript(`!document.body.classList.contains('edit-mode')`);
          const colored = now.includes('{#cf222e}(');
          console.log('color-focus test:', colored && stillRead ? 'PASS' : 'FAIL', 'colored=', colored, 'read=', stillRead);
          console.log('color-focus head:', JSON.stringify(now.slice(0, 160)));
          const ae2 = await win.webContents.executeJavaScript(`(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : 'none'; })()`);
          console.log('color-focus activeElement before undo:', ae2);
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1400));
          const undone = await fs.promises.readFile(currentFile, 'utf8');
          console.log('color-focus undo:', undone === orig ? 'PASS' : 'FAIL');
          if (undone !== orig) {
            const a = orig.split('\n');
            const b = undone.split('\n');
            for (let l = 0; l < Math.max(a.length, b.length); l++) {
              if (a[l] !== b[l]) {
                console.log('color-focus undo diff at line', l, JSON.stringify(a[l]), '->', JSON.stringify(b[l]));
                break;
              }
            }
          }
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (colorPanelTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          const selectJs = `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')]
               .find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4));
             document.getElementById('content').focus();
             const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= 4);
             const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 4);
             const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`;
          await win.webContents.executeJavaScript(selectJs);
          await new Promise((r) => setTimeout(r, 200));
          await win.webContents.executeJavaScript(`document.getElementById('btn-search').focus()`);
          await new Promise((r) => setTimeout(r, 1200));
          win.webContents.send('menu:insert', 'color:panel');
          await new Promise((r) => setTimeout(r, 600));
          const panelOk = await win.webContents.executeJavaScript(`!!document.querySelector('.cp-card')`);
          const eyeOk = await win.webContents.executeJavaScript(`!!window.EyeDropper`);
          await win.webContents.executeJavaScript(
            `(() => { const b = [...document.querySelectorAll('.cp-swatch')].find((x) => x.title === '#0070c0'); if (b) b.click(); return !!b; })()`
          );
          await new Promise((r) => setTimeout(r, 1200));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          const stillRead = await win.webContents.executeJavaScript(`!document.body.classList.contains('edit-mode')`);
          console.log('color-panel test:', panelOk && now.includes('{#0070c0}(') && stillRead ? 'PASS' : 'FAIL', 'panel=', panelOk, 'eyedropper=', eyeOk, 'read=', stillRead);
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1200));
          await win.webContents.executeJavaScript(selectJs);
          await new Promise((r) => setTimeout(r, 200));
          win.webContents.send('menu:insert', 'color:panel');
          await new Promise((r) => setTimeout(r, 600));
          await win.webContents.executeJavaScript(
            `(() => { const i = document.querySelector('.cp-hex'); if (!i) return false;
               i.value = '#00ff00'; i.dispatchEvent(new Event('input'));
               const b = [...document.querySelectorAll('.cp-card .link-btns button')].find((x) => x.textContent === '应用');
               if (b) b.click(); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1200));
          const now2 = await fs.promises.readFile(currentFile, 'utf8');
          console.log('color-panel hex:', now2.includes('{#00ff00}(') ? 'PASS' : 'FAIL');
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1200));
          const undone = await fs.promises.readFile(currentFile, 'utf8');
          console.log('color-panel undo:', undone === orig ? 'PASS' : 'FAIL');
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (floatTest && currentFile) {
          await resetUi();
          await new Promise((r) => setTimeout(r, 400));
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          const selectJs = `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')]
               .find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4));
             document.getElementById('content').focus();
             const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= 4);
             const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 4);
             const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`;
          await win.webContents.executeJavaScript(selectJs);
          const barOk = await waitFor(
            () => win.webContents.executeJavaScript(`!document.getElementById('float-bar').hidden`), 3000
          );
          await win.webContents.executeJavaScript(`document.querySelector('#float-bar button[data-fmt="bold"]').click()`);
          await new Promise((r) => setTimeout(r, 1000));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          const boldOk = now.includes('**这是一份**');
          await win.webContents.executeJavaScript(`document.querySelector('#float-bar button[data-fmt="bold"]').click()`);
          await new Promise((r) => setTimeout(r, 1000));
          const now2 = await fs.promises.readFile(currentFile, 'utf8');
          const unwrapOk = now2 === orig;
          await win.webContents.executeJavaScript(selectJs);
          await new Promise((r) => setTimeout(r, 400));
          await win.webContents.executeJavaScript(`document.querySelector('#float-bar button[data-fmt="color"]').click()`);
          await new Promise((r) => setTimeout(r, 500));
          await win.webContents.executeJavaScript(
            `(() => { const b = [...document.querySelectorAll('.cp-swatch')].find((x) => x.title === '#1a7f37'); if (b) b.click(); return !!b; })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          const now3 = await fs.promises.readFile(currentFile, 'utf8');
          const colorOk = now3.includes('{#1a7f37}(这是一份)');
          await win.webContents.executeJavaScript(
            `(() => { const sp = document.querySelector('#content span[data-color]'); if (!sp) return false;
               document.getElementById('content').focus();
               const r = document.createRange(); r.selectNodeContents(sp);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 400));
          await win.webContents.executeJavaScript(`document.querySelector('#float-bar button[data-fmt="clear"]').click()`);
          await new Promise((r) => setTimeout(r, 1000));
          const now4 = await fs.promises.readFile(currentFile, 'utf8');
          const clearOk = now4 === orig;
          await win.webContents.executeJavaScript(selectJs);
          await new Promise((r) => setTimeout(r, 400));
          await win.webContents.executeJavaScript(`document.querySelector('#float-bar button[data-fmt="link"]').click()`);
          await new Promise((r) => setTimeout(r, 500));
          await win.webContents.executeJavaScript(
            `(() => { const card = document.querySelector('.link-modal:not([hidden]) .link-card'); if (!card) return false;
               const inputs = card.querySelectorAll('input');
               inputs[1].value = 'https://example.com';
               card.querySelector('button.primary').click(); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          const now5 = await fs.promises.readFile(currentFile, 'utf8');
          const linkOk = now5.includes('[这是一份](https://example.com)');
          await win.webContents.executeJavaScript(selectJs);
          await new Promise((r) => setTimeout(r, 400));
          const swatchBtnOk = await win.webContents.executeJavaScript(
            `(() => { const b = document.querySelector('#float-bar button[data-color="#0969da"]'); if (b) b.click(); return !!b; })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          const now6 = await fs.promises.readFile(currentFile, 'utf8');
          const swatchOk = swatchBtnOk && now6.includes('{#0969da}(放在项目)');
          console.log('float test:', barOk && boldOk && unwrapOk && colorOk && clearOk && linkOk && swatchOk ? 'PASS' : 'FAIL',
            JSON.stringify({ barOk, boldOk, unwrapOk, colorOk, clearOk, linkOk, swatchOk }));
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (focusTest && currentFile) {
          await resetUi();
          await new Promise((r) => setTimeout(r, 400));
          const caretAt = (idx) => `(() => { const blk = document.getElementById('content').children[${idx}];
             if (!blk) return false;
             const w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
             const tn = w.nextNode(); if (!tn) return false;
             document.getElementById('content').focus();
             const r = document.createRange(); r.setStart(tn, 0); r.collapse(true);
             const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`;
          win.webContents.send('focus:set', true);
          await new Promise((r) => setTimeout(r, 300));
          await win.webContents.executeJavaScript(caretAt(2));
          await new Promise((r) => setTimeout(r, 500));
          const f1 = await win.webContents.executeJavaScript(
            `(() => { const c = document.getElementById('content');
               return { mode: document.body.classList.contains('focus-mode'),
                 focused: c.children[2].classList.contains('is-focus'),
                 dim: getComputedStyle(c.children[1]).opacity,
                 lit: getComputedStyle(c.children[2]).opacity }; })()`
          );
          await win.webContents.executeJavaScript(caretAt(4));
          await new Promise((r) => setTimeout(r, 500));
          const f2 = await win.webContents.executeJavaScript(
            `(() => { const c = document.getElementById('content');
               return { moved: c.children[4].classList.contains('is-focus'), old: c.children[2].classList.contains('is-focus') }; })()`
          );
          win.webContents.send('focus:set', false);
          await new Promise((r) => setTimeout(r, 400));
          const f3 = await win.webContents.executeJavaScript(
            `getComputedStyle(document.getElementById('content').children[1]).opacity`
          );
          const focusOk = f1.mode && f1.focused && f1.dim === '0.25' && f1.lit === '1' && f2.moved && !f2.old && f3 === '1';
          console.log('focus test:', focusOk ? 'PASS' : 'FAIL', JSON.stringify({ f1, f2, f3 }));
          win.webContents.send('typewriter:set', true);
          await new Promise((r) => setTimeout(r, 300));
          await win.webContents.executeJavaScript(caretAt(12));
          const twOk = await waitFor(
            () => win.webContents.executeJavaScript(
              `(() => { const blk = document.getElementById('content').children[12];
                 const r = blk.getBoundingClientRect();
                 const s = document.getElementById('scroll').getBoundingClientRect();
                 return Math.abs((r.top + r.height / 2) - (s.top + s.height / 2)) < 100; })()`
            ), 5000
          );
          const tw = await win.webContents.executeJavaScript(
            `(() => { const blk = document.getElementById('content').children[12];
               const r = blk.getBoundingClientRect();
               const s = document.getElementById('scroll').getBoundingClientRect();
               return Math.abs((r.top + r.height / 2) - (s.top + s.height / 2)); })()`
          );
          console.log('typewriter test:', twOk ? 'PASS' : 'FAIL', 'centerDelta=', Math.round(tw));
          if (!twOk) {
            console.log('tw diag:', await win.webContents.executeJavaScript(
              `(() => { const c = document.getElementById('content');
                 const s = document.getElementById('scroll');
                 const sel = document.getSelection();
                 const aEl = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
                 const blk = aEl && aEl.closest('[data-blk]');
                 return { edit: document.body.classList.contains('edit-mode'),
                   tw: document.body.classList.contains('typewriter-mode'),
                   scrollTop: s.scrollTop, scrollH: s.scrollHeight, clientH: s.clientHeight,
                   caretBlk: blk ? [...c.children].indexOf(blk) : -1,
                   overflow: getComputedStyle(s).overflowY }; })()`
            ));
          }
          win.webContents.send('typewriter:set', false);
          win.webContents.send('focus:set', false);
          await new Promise((r) => setTimeout(r, 300));
        }
        if (treeTest && currentFile) {
          await win.webContents.executeJavaScript(`document.getElementById('tab-files').click()`);
          await new Promise((r) => setTimeout(r, 700));
          const t1 = await win.webContents.executeJavaScript(
            `(() => { const rows = [...document.querySelectorAll('#file-tree .tree-row')];
               return { root: (document.querySelector('.tree-root') || {}).textContent,
                 dirs: rows.filter((r) => r.classList.contains('tree-dir')).map((r) => r.querySelector('.tree-name').textContent),
                 active: (document.querySelector('#file-tree .tree-file.active') || {}).textContent }; })()`
          );
          await win.webContents.executeJavaScript(
            `(() => { const row = [...document.querySelectorAll('#file-tree .tree-dir')].find((r) => r.querySelector('.tree-name').textContent === 'assets'); if (row) row.click(); return !!row; })()`
          );
          await new Promise((r) => setTimeout(r, 700));
          const t2 = await win.webContents.executeJavaScript(
            `[...document.querySelectorAll('#file-tree .tree-file')].map((r) => r.textContent.trim())`
          );
          await win.webContents.executeJavaScript(
            `(() => { const row = [...document.querySelectorAll('#file-tree .tree-file')].find((r) => r.textContent.trim() === 'sample.md'); if (row) row.click(); return !!row; })()`
          );
          await new Promise((r) => setTimeout(r, 1500));
          const t3 = await win.webContents.executeJavaScript(
            `(() => ({ title: document.getElementById('file-title').textContent,
               root: (document.querySelector('.tree-root') || {}).textContent,
               active: (document.querySelector('#file-tree .tree-file.active') || {}).textContent }))()`
          );
          const ok = t1.root === 'MarkView' && t1.dirs.includes('assets') && (t1.active || '').trim() === 'README.md' &&
            t2.includes('sample.md') && t3.title === 'sample.md' && t3.root === 'assets' && (t3.active || '').trim() === 'sample.md';
          console.log('tree test:', ok ? 'PASS' : 'FAIL', JSON.stringify({ t1, t2, t3 }));
          await win.webContents.executeJavaScript(`document.getElementById('tab-toc').click()`);
          await new Promise((r) => setTimeout(r, 300));
        }
        if (replaceTest && currentFile) {
          await resetUi();
          await new Promise((r) => setTimeout(r, 400));
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          const setQ = (q) => win.webContents.executeJavaScript(
            `(() => { const i = document.getElementById('search-input'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); return true; })()`
          );
          await win.webContents.executeJavaScript(`document.getElementById('btn-search').click()`);
          await setQ('主题');
          await new Promise((r) => setTimeout(r, 1200));
          const c1 = await win.webContents.executeJavaScript(`document.getElementById('search-count').textContent`);
          const hl1 = await win.webContents.executeJavaScript(`CSS.highlights.get('mv-find').size`);
          await win.webContents.executeJavaScript(`document.getElementById('btn-search-next').click()`);
          await new Promise((r) => setTimeout(r, 200));
          const c2 = await win.webContents.executeJavaScript(`document.getElementById('search-count').textContent`);
          await win.webContents.executeJavaScript(
            `(() => { document.getElementById('replace-input').value = '配色'; document.getElementById('btn-replace').click(); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 900));
          const now1 = await fs.promises.readFile(currentFile, 'utf8');
          const r1 = now1.includes('三套主题') && now1.includes('配色看看');
          await win.webContents.executeJavaScript(
            `(() => { document.getElementById('replace-input').value = '题材'; document.getElementById('btn-replace-all').click(); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1200));
          const now2 = await fs.promises.readFile(currentFile, 'utf8');
          const r2 = !now2.includes('主题') && now2.includes('三套题材');
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          const now3 = await fs.promises.readFile(currentFile, 'utf8');
          const r3 = now3 === now1;
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          const now4 = await fs.promises.readFile(currentFile, 'utf8');
          const r4 = now4 === orig;
          await setQ('markview');
          await new Promise((r) => setTimeout(r, 800));
          await win.webContents.executeJavaScript(`document.getElementById('btn-search-case').click()`);
          await new Promise((r) => setTimeout(r, 800));
          const cCase = await win.webContents.executeJavaScript(`document.getElementById('search-count').textContent`);
          await win.webContents.executeJavaScript(`document.getElementById('btn-search-case').click()`);
          await new Promise((r) => setTimeout(r, 800));
          const cNoCase = await win.webContents.executeJavaScript(`document.getElementById('search-count').textContent`);
          await setQ('console');
          await new Promise((r) => setTimeout(r, 800));
          await win.webContents.executeJavaScript(
            `(() => { document.getElementById('replace-input').value = 'print'; document.getElementById('btn-replace-all').click(); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1200));
          const now5 = await fs.promises.readFile(currentFile, 'utf8');
          const r5 = now5.includes('print.log(') && now5.includes('```javascript');
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          win.webContents.send('menu:toggle-edit');
          await new Promise((r) => setTimeout(r, 600));
          await setQ('演示');
          await new Promise((r) => setTimeout(r, 800));
          await win.webContents.executeJavaScript(
            `(() => { document.getElementById('replace-input').value = '示例'; document.getElementById('btn-replace-all').click(); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1200));
          const now6 = await fs.promises.readFile(currentFile, 'utf8');
          const r6 = now6.includes('全格式示例文档');
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          const now7 = await fs.promises.readFile(currentFile, 'utf8');
          const r7 = now7 === orig;
          win.webContents.send('menu:toggle-edit');
          await new Promise((r) => setTimeout(r, 800));
          await win.webContents.executeJavaScript(`document.getElementById('btn-search-close').click()`);
          const ok = c1 === '1/2' && hl1 === 2 && c2 === '2/2' && r1 && r2 && r3 && r4 &&
            cCase === '无结果' && cNoCase !== '无结果' && r5 && r6 && r7;
          console.log('replace test:', ok ? 'PASS' : 'FAIL', JSON.stringify({ c1, hl1, c2, r1, r2, r3, r4, cCase, cNoCase, r5, r6, r7 }));
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (typoTest && currentFile) {
          win.webContents.send('menu:typography');
          await new Promise((r) => setTimeout(r, 500));
          const open = await win.webContents.executeJavaScript(`!document.getElementById('typo-modal').hidden`);
          await win.webContents.executeJavaScript(
            `(() => { const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); };
               set('typo-size', '22'); set('typo-lh', '2.2'); set('typo-ps', '1.6'); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 600));
          const vars = await win.webContents.executeJavaScript(
            `(() => { const r = document.documentElement.style; const cs = getComputedStyle(document.getElementById('content'));
               return { size: r.getPropertyValue('--doc-font-size').trim(), fs: cs.fontSize, lh: cs.lineHeight }; })()`
          );
          const cfg = await win.webContents.executeJavaScript(`window.api.getConfig()`);
          const persisted = !!(cfg.typography && cfg.typography.size === 22 && cfg.typography.lineHeight === 2.2);
          await win.webContents.executeJavaScript(`document.getElementById('typo-reset').click()`);
          await new Promise((r) => setTimeout(r, 400));
          const vars2 = await win.webContents.executeJavaScript(
            `document.documentElement.style.getPropertyValue('--doc-font-size').trim()`
          );
          await win.webContents.executeJavaScript(`document.getElementById('typo-close').click()`);
          await new Promise((r) => setTimeout(r, 300));
          const closed = await win.webContents.executeJavaScript(`document.getElementById('typo-modal').hidden`);
          const ok = open && vars.size === '22px' && vars.fs === '22px' && persisted && vars2 === '17px' && closed;
          console.log('typo test:', ok ? 'PASS' : 'FAIL', JSON.stringify({ open, vars, persisted, vars2, closed }));
        }
        if (updateTest && currentFile) {
          win.webContents.send('menu:check-update');
          await new Promise((r) => setTimeout(r, 2500));
          const t = await win.webContents.executeJavaScript(`document.getElementById('toast').textContent`);
          const modal = await win.webContents.executeJavaScript(`!!document.querySelector('.link-modal:not([hidden])')`);
          console.log('update test:', !modal && t.includes('已是最新版本') ? 'PASS' : 'FAIL', JSON.stringify(t));
        }
        if (updateMockNewer && currentFile) {
          win.webContents.send('menu:check-update');
          await new Promise((r) => setTimeout(r, 1000));
          const ok = await win.webContents.executeJavaScript(
            `(() => { const c = document.querySelector('.link-modal:not([hidden]) .link-card'); if (!c) return false;
               const txt = c.textContent;
               const b = [...c.querySelectorAll('button')].find((x) => x.textContent === '稍后');
               if (b) b.click();
               return txt.includes('发现新版本') && txt.includes('9.9.9'); })()`
          );
          await new Promise((r) => setTimeout(r, 300));
          const closed = await win.webContents.executeJavaScript(`!document.querySelector('.link-modal:not([hidden])')`);
          console.log('update-mock test:', ok && closed ? 'PASS' : 'FAIL');
        }
        if (featTest && currentFile) {
          const mainFile = currentFile;
          clipboard.writeText('mv-clip-probe');
          const clipOk = clipboard.readText() === 'mv-clip-probe';
          if (!clipOk) console.log('feat clipboard: UNAVAILABLE in this session (OS-level) — copy assertions skipped');
          const fx = path.join(ARTIFACT_DIR, 'feat-110.md');
          const fxSrc = '# 标题一\n\n==高亮== 与 ^上标^ 与 ~下标~\n\n## 标题二\n\n[toc]\n\n正文自动链 https://example.com/auto 结束\n\n[示例](https://example.com/target)\n';
          await fs.promises.writeFile(fx, fxSrc, 'utf8');
          await openPath(fx);
          await new Promise((r) => setTimeout(r, 1200));
          const ej = (js) => win.webContents.executeJavaScript(js);
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const r = {};
          r.mark = await ej(`!!document.querySelector('#content mark')`);
          r.sup = await ej(`!!document.querySelector('#content sup')`);
          r.sub = await ej(`!!document.querySelector('#content sub')`);
          r.toc = await ej(`document.querySelectorAll('#content .toc-inline a').length === 2`);
          r.linkify = await ej(`!!document.querySelector('#content a[href="https://example.com/auto"]')`);
          await ej(
            `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')].find((x) => x.textContent.includes('正文自动链'));
               const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes('正文'));
               document.getElementById('content').focus();
               const rg = document.createRange(); rg.setStart(tn, 0); rg.collapse(true);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(rg);
               document.execCommand('insertText', false, 'X'); return true; })()`
          );
          await wait(900);
          let now = await fs.promises.readFile(fx, 'utf8');
          r.roundtrip = now.includes('==高亮==') && now.includes('^上标^') && now.includes('~下标~') && now.includes('[toc]') && now.includes('X正文自动链');
          win.webContents.send('menu:undo');
          await wait(900);
          await ej(
            `(() => { const m = document.querySelector('#content mark'); if (!m) return false;
               document.getElementById('content').focus();
               const rg = document.createRange(); rg.selectNodeContents(m.parentElement);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(rg); return true; })()`
          );
          win.webContents.send('menu:copy-md');
          await wait(400);
          if (clipOk) r.copyMd = clipboard.readText().includes('==高亮==');
          win.webContents.send('menu:copy-html');
          await wait(400);
          if (clipOk) r.copyHtml = clipboard.readText().includes('<mark>');
          externalOpens.length = 0;
          await ej(
            `(() => { const a = document.querySelector('#content a[href="https://example.com/target"]');
               a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })); return true; })()`
          );
          await wait(400);
          r.ctrlClick = externalOpens.includes('https://example.com/target');
          r.noModal = await ej(`!document.querySelector('.link-modal:not([hidden])')`);
          await ej(
            `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')].find((x) => x.textContent.includes('正文自动链'));
               const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes('正文'));
               document.getElementById('content').focus();
               const rg = document.createRange(); rg.setStart(tn, 0); rg.setEnd(tn, 2);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(rg);
               const dt = new DataTransfer(); dt.setData('text/plain', 'https://example.com/pasted');
               p.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`
          );
          await wait(900);
          now = await fs.promises.readFile(fx, 'utf8');
          r.pasteUrl = now.includes('[正文](https://example.com/pasted)');
          win.webContents.send('menu:undo');
          await wait(900);
          await ej(
            `(() => { const m = document.querySelector('#content mark'); if (!m) return false;
               document.getElementById('content').focus();
               const rg = document.createRange(); rg.selectNodeContents(m);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(rg); return true; })()`
          );
          win.webContents.send('menu:insert', 'mark');
          await wait(900);
          now = await fs.promises.readFile(fx, 'utf8');
          r.markToggle = !now.includes('==高亮==') && now.includes('高亮 与');
          win.webContents.send('menu:undo');
          await wait(900);
          if (htmlOut) {
            await new Promise((resolve) => {
              devHtmlResolve = resolve;
              devHtmlTarget = path.resolve(htmlOut);
              setTimeout(resolve, 15000);
              win.webContents.send('html:prepare');
            });
            let html = '';
            try { html = await fs.promises.readFile(path.resolve(htmlOut), 'utf8'); } catch {}
            r.htmlExport = html.includes('<mark>') && html.includes('<style>') && html.includes('标题一');
          }
          console.log('feat test:', Object.values(r).every((v) => v === true) ? 'PASS' : 'FAIL', JSON.stringify(r));
          await openPath(mainFile);
          await wait(800);
        }
        if (uxTest && currentFile) {
          await resetUi();
          const ej = (js) => win.webContents.executeJavaScript(js);
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const r = {};
          win.webContents.send('menu:typography');
          await wait(500);
          r.typoFocus = await ej(`document.activeElement && document.activeElement.id === 'typo-size'`);
          await ej(`document.getElementById('btn-search').focus()`);
          await ej(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
          await wait(400);
          r.typoEsc = await ej(`document.getElementById('typo-modal').hidden`);
          await ej(
            `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')]
                 .find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4));
               const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= 4);
               if (!tn) return false;
               document.getElementById('content').focus();
               const rg = document.createRange(); rg.setStart(tn, 0); rg.setEnd(tn, 4);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(rg); return true; })()`
          );
          await wait(400);
          await ej(`document.querySelector('#float-bar button[data-fmt="link"]').click()`);
          await waitFor(() => ej(`!!document.querySelector('.link-modal:not([hidden]) .link-card')`), 3000);
          for (let i = 0; i < 12; i++) {
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
            await wait(60);
          }
          r.trap = await ej(`!!document.activeElement.closest('.link-card')`);
          await ej(`document.getElementById('btn-search').click()`);
          await wait(300);
          r.z = await ej(
            `(() => { const m = document.querySelector('.link-modal:not([hidden])'); const s = document.getElementById('search-bar');
               return !!m && Number(getComputedStyle(m).zIndex) > Number(getComputedStyle(s).zIndex); })()`
          );
          await ej(`document.getElementById('btn-search-close').click()`);
          await ej(`document.getElementById('btn-search').focus()`);
          await ej(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
          await wait(400);
          r.linkEsc = await ej(`!document.querySelector('.link-modal:not([hidden])')`);
          win.webContents.send('menu:check-update');
          await wait(120);
          win.webContents.send('menu:check-update');
          await wait(500);
          r.toast = await ej(`(() => { const t = document.getElementById('toast'); return !t.hidden && t.textContent.length > 0; })()`);
          await ej(`document.getElementById('btn-search').click()`);
          await ej(`(() => { const i = document.getElementById('search-input'); i.value = ''; i.dispatchEvent(new Event('input')); return true; })()`);
          await wait(400);
          r.replDis = await ej(`document.getElementById('btn-replace').disabled && document.getElementById('btn-replace-all').disabled`);
          await ej(`(() => { const i = document.getElementById('search-input'); i.value = '的'; i.dispatchEvent(new Event('input')); return true; })()`);
          await wait(700);
          r.replEn = await ej(`!document.getElementById('btn-replace').disabled && !document.getElementById('btn-replace-all').disabled`);
          await ej(`document.getElementById('btn-search-close').click()`);
          await ej(`document.getElementById('tab-files').click()`);
          await waitFor(() => ej(`document.querySelectorAll('#file-tree [role="treeitem"]').length > 0`), 3000);
          r.tree = await ej(`(() => { const n = document.querySelector('#file-tree [role="treeitem"]'); return !!n && n.tabIndex === 0; })()`);
          await ej(`document.getElementById('tab-toc').click()`);
          win.webContents.send('menu:toggle-sidebar');
          await wait(500);
          r.side = await ej(`(() => { const s = document.getElementById('sidebar'); return s.inert === true || getComputedStyle(s).visibility === 'hidden'; })()`);
          win.webContents.send('menu:toggle-sidebar');
          await wait(500);
          win.webContents.send('menu:toggle-edit');
          await wait(700);
          await ej(`document.getElementById('editor').focus()`);
          await ej(`document.getElementById('editor').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
          await wait(300);
          r.srcEsc = await ej(`document.activeElement.id !== 'editor'`);
          win.webContents.send('menu:toggle-edit');
          await wait(700);
          await ej(
            `(() => { const ps = [...document.querySelectorAll('#content p[data-blk]')].filter((x) => x.textContent.trim().length >= 6);
               const p = ps[ps.length - 1]; if (!p) return false;
               const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= 6);
               if (!tn) return false;
               document.getElementById('content').focus();
               const rg = document.createRange(); rg.setStart(tn, 0); rg.setEnd(tn, 6);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(rg);
               const sc = document.getElementById('scroll');
               sc.scrollTop += rg.getBoundingClientRect().top - innerHeight + 140;
               return true; })()`
          );
          await waitFor(() => ej(`!document.getElementById('float-bar').hidden`), 3000);
          r.floatClamp = await ej(
            `(() => { const b = document.getElementById('float-bar').getBoundingClientRect(); return b.bottom <= innerHeight - 4 && b.top >= 0; })()`
          );
          r.zoomBtn = await ej(`document.getElementById('zoom-level').tagName === 'BUTTON'`);
          r.pressed = await ej(`document.getElementById('btn-edit').hasAttribute('aria-pressed')`);
          r.recentCss = await ej(`getComputedStyle(document.querySelector('.recent-name') || document.body).textOverflow === 'ellipsis'`);
          console.log('ux test:', Object.values(r).every((v) => v === true) ? 'PASS' : 'FAIL', JSON.stringify(r));
          await resetUi();
        }
        if (audit2Test && currentFile) {
          const mainFile = currentFile;
          const dir = path.join(ARTIFACT_DIR, 'audit2-fixture');
          const a = path.join(dir, 'a.md');
          const b = path.join(dir, 'b.md');
          const c = path.join(dir, 'sub', 'c.md');
          const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="860" height="120"><rect width="860" height="120" fill="#0969da"/><text x="20" y="70" fill="white" font-size="32">local image</text></svg>';
          const src = '---\ntitle: 审计文档\nauthor: MarkView\n---\n\n# 中文标题\n\n==高亮== ++下划线++ ^上标^ ~下标~\n\n[跳到第二节](#第二节)\n\n## 第二节\n\n段落甲。\n\n```js\nconst value = 42;\n```\n\n| 列一 | 列二 |\n| --- | --- |\n| A | B |\n\n段落乙。\n\n![本地图](demo.svg)\n\n全局搜索 needle。\n\n[toc]\n';
          await fs.promises.mkdir(path.dirname(c), { recursive: true });
          await fs.promises.writeFile(path.join(dir, 'demo.svg'), svg, 'utf8');
          await fs.promises.writeFile(a, src, 'utf8');
          await fs.promises.writeFile(b, '# B\n\nneedle in b\n', 'utf8');
          await fs.promises.writeFile(c, '# C\n\nneedle in c\n', 'utf8');
          const ej = (js) => win.webContents.executeJavaScript(js);
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const open = async (p) => { await ej(`window.api.openPath(${JSON.stringify(p)})`); await wait(1500); };
          const r = {};
          const check = async (name, fn) => {
            try { r[name] = !!(await fn()); }
            catch (err) { r[name] = false; r[name + 'Error'] = String(err && err.message || err); }
          };
          try {
            await open(a);
            await check('anchor', () => ej(
              `(async () => { const h = [...document.querySelectorAll('#content h2')].find((x) => x.textContent === '第二节');
                 if (!h) return false;
                 for (let i = 0; i < 30; i++) { const p = document.createElement('p'); p.textContent = '填充 ' + i; h.before(p); }
                 const link = document.querySelector('#content a[href^="#"]');
                 link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
                 await new Promise((res) => setTimeout(res, 900));
                 const sc = document.getElementById('scroll');
                 return sc.scrollTop > 100 && Math.abs(h.getBoundingClientRect().top - sc.getBoundingClientRect().top) < 260; })()`
            ));
            await open(a);
            await check('underline', async () => await ej(`!!document.querySelector('#content u')`) && (await fs.promises.readFile(a, 'utf8')).includes('++下划线++'));
            await check('yaml', async () => await ej(`!!document.querySelector('#content .yaml-frontmatter')`) && (await fs.promises.readFile(a, 'utf8')).startsWith('---\ntitle:'));
            await check('yamlEdit', async () => {
              if (!await ej(`!!document.querySelector('#content .yaml-frontmatter')`)) return false;
              await ej(`document.querySelector('#content .yaml-frontmatter').click()`);
              await wait(400);
              const opened = await ej(`!!document.querySelector('#content .yaml-frontmatter textarea.block-overlay')`);
              if (!opened) return false;
              await ej(
                `(() => { const ta = document.querySelector('#content .yaml-frontmatter textarea.block-overlay');
                   ta.value = ta.value.replace('MarkView', 'Changed');
                   ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })); return true; })()`
              );
              await wait(900);
              const text = await fs.promises.readFile(a, 'utf8');
              return text.startsWith('---\n') && text.includes('author: Changed') && text.includes('\n---\n');
            });
            await open(a);
            await check('blockDrag', async () => {
              const dragged = await ej(
                `(() => { const ps = [...document.querySelectorAll('#content p[data-blk]')];
                   const from = ps.find((p) => p.textContent.includes('段落甲'));
                   const to = ps.find((p) => p.textContent.includes('段落乙'));
                   if (!from || !to) return false;
                   from.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                   const handle = from.querySelector('.blk-drag');
                   if (!handle) return false;
                   const dt = new DataTransfer();
                   handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
                   const ok = dt.types.includes('text/x-markview-block');
                   to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
                   return ok; })()`
              );
              await wait(900);
              const text = await fs.promises.readFile(a, 'utf8');
              return dragged && text.indexOf('段落乙') < text.indexOf('段落甲');
            });
            await open(a);
            await check('targetCss', () => ej(`getComputedStyle(document.querySelector('#content h1')).scrollMarginTop === '14px'`));
            await check('htmlImages', async () => {
              const out = path.join(ARTIFACT_DIR, 'audit2-full.html');
              await new Promise((resolve) => {
                devHtmlResolve = resolve;
                devHtmlTarget = out;
                setTimeout(resolve, 15000);
                win.webContents.send('html:prepare');
              });
              const html = await fs.promises.readFile(out, 'utf8');
              return html.includes('data:image/svg+xml;base64,') && !/<img\b[^>]*\ssrc="demo\.svg"/.test(html);
            });
            await check('htmlBare', async () => {
              const out = path.join(ARTIFACT_DIR, 'audit2-bare.html');
              await new Promise((resolve) => {
                devHtmlResolve = resolve;
                devHtmlTarget = out;
                setTimeout(resolve, 15000);
                win.webContents.send('html:prepare-bare');
              });
              const html = await fs.promises.readFile(out, 'utf8');
              return !html.includes('<style>') && html.includes('<u>') && html.includes('<h1');
            });
            await check('spellcheck', async () => {
              const item = Menu.getApplicationMenu().getMenuItemById('spellcheck-toggle');
              if (!item) return false;
              const before = item.checked;
              item.click();
              await wait(500);
              const cfg = await ej(`window.api.getConfig()`);
              const dom = await ej(`document.getElementById('content').spellcheck === ${!before} && document.getElementById('editor').spellcheck === ${!before}`);
              item.click();
              await wait(300);
              return item.checked === before && cfg.spellcheck === !before && dom;
            });
            await open(a);
            await check('articles', async () => {
              if (!await ej(`!!document.getElementById('tab-articles')`)) return false;
              await ej(`document.getElementById('tab-articles').click()`);
              await waitFor(() => ej(`document.querySelectorAll('#article-list .article-row').length === 2`), 3000);
              const names = await ej(`[...document.querySelectorAll('#article-list .article-row')].map((x) => x.textContent.trim())`);
              await ej(`[...document.querySelectorAll('#article-list .article-row')].find((x) => x.textContent.includes('b.md')).click()`);
              await wait(900);
              return names.join(',').includes('a.md') && names.join(',').includes('b.md') && await ej(`document.getElementById('file-title').textContent === 'b.md'`);
            });
            await open(a);
            await check('globalSearch', async () => {
              if (!await ej(`!!document.getElementById('tab-search')`)) return false;
              await ej(`document.getElementById('tab-search').click()`);
              await wait(300);
              await ej(
                `(() => { const i = document.querySelector('#global-search-input'); i.value = 'needle';
                   i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`
              );
              await waitFor(() => ej(`document.querySelectorAll('#global-search-results .search-result').length >= 3`), 5000);
              const paths = await ej(`[...document.querySelectorAll('#global-search-results .search-result')].map((x) => x.dataset.path || '')`);
              await ej(`[...document.querySelectorAll('#global-search-results .search-result')].find((x) => (x.dataset.path || '').endsWith('c.md')).click()`);
              await wait(900);
              return paths.some((p) => p.endsWith('c.md')) && await ej(`document.getElementById('file-title').textContent === 'c.md'`);
            });
          } finally {
            await open(mainFile);
          }
          console.log('audit2 test:', Object.values(r).every((v) => v === true) ? 'PASS' : 'FAIL', JSON.stringify(r));
        }
        if (audit3Test && currentFile) {
          const mainFile = currentFile;
          const dir = path.join(ARTIFACT_DIR, 'audit3-fixture');
          const htmlFile = path.join(dir, 'emoji-html.md');
          const resizeFile = path.join(dir, 'resize.md');
          const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#0969da"/></svg>';
          const htmlSrc = '# Emoji\n\n:smile: :rocket:\n\n<div class="note" onclick="alert(1)">安全 <strong>HTML</strong><script>alert(1)</script><img src="demo.svg" onerror="alert(1)" width="120"></div>\n\n<table class="raw"><tr><td>A</td><td>B</td></tr></table>\n\n普通段落。\n';
          const resizeSrc = '# 图片缩放\n\n![缩放图](demo.svg)\n';
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(path.join(dir, 'demo.svg'), svg, 'utf8');
          await fs.promises.writeFile(htmlFile, htmlSrc, 'utf8');
          await fs.promises.writeFile(resizeFile, resizeSrc, 'utf8');
          const ej = (js) => win.webContents.executeJavaScript(js);
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const open = async (p) => { await ej(`window.api.openPath(${JSON.stringify(p)})`); await wait(1200); };
          const r = {};
          const check = async (name, fn) => {
            try { r[name] = !!(await fn()); }
            catch (err) { r[name] = false; r[name + 'Error'] = String(err && err.message || err); }
          };
          try {
            await open(htmlFile);
            await check('emoji', () => ej(`document.querySelectorAll('#content .emoji').length >= 2`));
            await check('sanitize', () => ej(
              `(() => { const note = document.querySelector('#content .note'); return !!note && !note.querySelector('script') &&
                 !note.hasAttribute('onclick') && !note.querySelector('img').hasAttribute('onerror'); })()`
            ));
            await check('emojiRoundtrip', async () => {
              await ej(
                `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')].find((x) => x.textContent.includes('普通段落'));
                   const tn = [...p.childNodes].find((n) => n.nodeType === 3);
                   document.getElementById('content').focus(); const rg = document.createRange(); rg.setStart(tn, 0); rg.collapse(true);
                   const s = document.getSelection(); s.removeAllRanges(); s.addRange(rg);
                   document.execCommand('insertText', false, 'X'); return true; })()`
              );
              await wait(1000);
              const text = await fs.promises.readFile(htmlFile, 'utf8');
              return text.includes(':smile: :rocket:') && text.includes('X普通段落');
            });
            await check('safeHtmlRoundtrip', async () => {
              const text = await fs.promises.readFile(htmlFile, 'utf8');
              return text.includes('<div class="note">') && text.includes('<strong>HTML</strong>') && text.includes('src="demo.svg"') && text.includes('<table class="raw">') && text.includes('<td>A</td>') && !text.includes('file:') && !text.includes('onclick') && !text.includes('onerror') && !text.includes('<script>');
            });
            await open(resizeFile);
            await check('resizeHandle', () => ej(`!!document.querySelector('#content .img-resize-handle')`));
            await check('imageResize', async () => {
              const ok = await ej(
                `(() => { const img = [...document.querySelectorAll('#content img')].find((i) => !i.classList.contains('emoji'));
                   const handle = img && img.parentElement.querySelector('.img-resize-handle'); if (!handle) return false;
                   const r = img.getBoundingClientRect();
                   handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: r.right, clientY: r.bottom }));
                   window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: r.right + 160, clientY: r.bottom + 90 }));
                   window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: r.right + 160, clientY: r.bottom + 90 }));
                   return true; })()`
              );
              await wait(1000);
              const text = await fs.promises.readFile(resizeFile, 'utf8');
              return ok && /<img\b[^>]*width="\d+"/.test(text) && /<img\b[^>]*height="\d+"/.test(text);
            });
            await check('resizeExport', async () => {
              const out = path.join(ARTIFACT_DIR, 'audit3-resize.html');
              await new Promise((resolve) => {
                devHtmlResolve = resolve;
                devHtmlTarget = out;
                setTimeout(resolve, 15000);
                win.webContents.send('html:prepare');
              });
              const html = await fs.promises.readFile(out, 'utf8');
              return /<img\b[^>]*width="\d+"/.test(html) && !/<button[^>]*img-resize-handle/.test(html);
            });
            await check('resizeUndo', async () => {
              win.webContents.send('menu:undo');
              await wait(1000);
              return (await fs.promises.readFile(resizeFile, 'utf8')) === resizeSrc;
            });
          } finally {
            await open(mainFile);
          }
          console.log('audit3 test:', Object.values(r).every((v) => v === true) ? 'PASS' : 'FAIL', JSON.stringify(r));
        }
        if (audit4Test && currentFile) {
          const mainFile = currentFile;
          const cssPath = path.join(app.getPath('userData'), 'custom.css');
          const oldCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : null;
          const oldCfg = { language: config.language, direction: config.direction, customCssEnabled: config.customCssEnabled };
          const rtlFile = path.join(ARTIFACT_DIR, 'audit4-rtl.md');
          await fs.promises.writeFile(rtlFile, '# RTL\n\nمرحبا بالعالم\n\nEnglish paragraph\n', 'utf8');
          await fs.promises.writeFile(cssPath, '@import url("https://example.com/evil.css");\n.markdown-body { color: rgb(1, 2, 3); }\n', 'utf8');
          const ej = (js) => win.webContents.executeJavaScript(js);
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const open = async (p) => { await ej(`window.api.openPath(${JSON.stringify(p)})`); await wait(1200); };
          const r = {};
          const check = async (name, fn) => {
            try { r[name] = !!(await fn()); }
            catch (err) { r[name] = false; r[name + 'Error'] = String(err && err.message || err); }
          };
          try {
            win.webContents.send('customCss:reload');
            await wait(600);
            await check('customCss', () => ej(
              `(() => { const s = document.getElementById('custom-theme'); return !!s && s.textContent.includes('rgb(1, 2, 3)') &&
                 !s.textContent.includes('@import') && !s.textContent.includes('example.com') &&
                 getComputedStyle(document.getElementById('content')).color === 'rgb(1, 2, 3)'; })()`
            ));
            await check('customCssToggle', async () => {
              const item = Menu.getApplicationMenu().getMenuItemById('custom-css-toggle');
              if (!item) return false;
              if (!item.checked) item.click();
              await wait(400);
              item.click();
              await wait(400);
              const off = await ej(`getComputedStyle(document.getElementById('content')).color !== 'rgb(1, 2, 3)'`);
              item.click();
              await wait(400);
              const cfg = await ej(`window.api.getConfig()`);
              return off && item.checked && cfg.customCssEnabled === true;
            });
            await check('customCssExport', async () => {
              const out = path.join(ARTIFACT_DIR, 'audit4-custom.html');
              await new Promise((resolve) => {
                devHtmlResolve = resolve;
                devHtmlTarget = out;
                setTimeout(resolve, 15000);
                win.webContents.send('html:prepare');
              });
              const html = await fs.promises.readFile(out, 'utf8');
              return html.includes('rgb(1, 2, 3)') && !html.includes('@import') && !html.includes('example.com');
            });
            await check('languageEn', async () => {
              const zh = Menu.getApplicationMenu().getMenuItemById('language-zh');
              if (!zh) return false;
              zh.click();
              await wait(400);
              const enNow = Menu.getApplicationMenu().getMenuItemById('language-en');
              if (!enNow) return false;
              enNow.click();
              await wait(600);
              const dom = await ej(`document.documentElement.lang === 'en-US' && document.getElementById('tab-toc').textContent === 'Outline' && document.getElementById('btn-open').title.includes('Open')`);
              const menu = Menu.getApplicationMenu().items.some((x) => x.label === 'File');
              const cfg = await ej(`window.api.getConfig()`);
              return dom && menu && cfg.language === 'en-US';
            });
            await check('updateEnglish', async () => {
              win.webContents.send('menu:check-update');
              await wait(250);
              const text = await ej(`document.getElementById('toast').textContent`);
              return text.length > 0 && !/[\u4e00-\u9fff]/.test(text);
            });
            await check('englishUi', () => ej(
              `(() => { const skip = 'script, style, #content, #editor, #toc, #file-title, #stat-file, .status-path, .article-row, .search-result, .recent-item, .tree-name, .tree-root, .tree-row';
                 const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(n) {
                   const p = n.parentElement; if (!p || p.closest(skip)) return NodeFilter.FILTER_REJECT;
                   return /[\\u4e00-\\u9fff]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
                 const out = []; let n; while ((n = w.nextNode()) && out.length < 40) { const s = n.nodeValue.trim(); if (s && !out.includes(s)) out.push(s); }
                 for (const el of document.querySelectorAll('body *')) {
                   if (el.closest(skip)) continue;
                   for (const attr of ['title', 'placeholder', 'aria-label']) {
                     const value = (el.getAttribute(attr) || '').trim();
                     if (/[\\u4e00-\\u9fff]/.test(value) && !out.includes(value)) out.push(attr + ':' + value);
                   }
                 }
                 window.__uiZhLeft = out; return out.length === 0; })()`
            ));
            if (r.englishUi === false) console.log('ui zh left:', JSON.stringify(await ej(`window.__uiZhLeft`)));
            await check('languageZh', async () => {
              Menu.getApplicationMenu().getMenuItemById('language-zh')?.click();
              await wait(600);
              return await ej(`document.documentElement.lang === 'zh-CN' && document.getElementById('tab-toc').textContent === '大纲'`);
            });
            await open(rtlFile);
            await ej(`window.api.setConfig({ direction: 'auto' })`);
            await wait(500);
            await check('rtlAuto', () => ej(`document.getElementById('content').dir === 'rtl' && getComputedStyle(document.getElementById('content')).direction === 'rtl'`));
            await check('rtlManual', async () => {
              const ltr = Menu.getApplicationMenu().getMenuItemById('direction-ltr');
              const auto = Menu.getApplicationMenu().getMenuItemById('direction-auto');
              const rtl = Menu.getApplicationMenu().getMenuItemById('direction-rtl');
              if (!ltr || !auto || !rtl) return false;
              ltr.click();
              await wait(400);
              const left = await ej(`document.getElementById('content').dir === 'ltr'`);
              auto.click();
              await wait(400);
              const detected = await ej(`document.getElementById('content').dir === 'rtl'`);
              await open(mainFile);
              rtl.click();
              await wait(400);
              const forced = await ej(`document.getElementById('content').dir === 'rtl'`);
              auto.click();
              await wait(300);
              return left && detected && forced;
            });
          } finally {
            if (oldCss === null) fs.rmSync(cssPath, { force: true });
            else fs.writeFileSync(cssPath, oldCss, 'utf8');
            await ej(`window.api.setConfig(${JSON.stringify(oldCfg)})`);
            win.webContents.send('customCss:reload');
            await open(mainFile);
          }
          console.log('audit4 test:', Object.values(r).every((v) => v === true) ? 'PASS' : 'FAIL', JSON.stringify(r));
        }
        if (audit5Test && currentFile) {
          const mainFile = currentFile;
          const dir = path.join(ARTIFACT_DIR, 'audit5-fixture');
          const doc = path.join(dir, 'history.md');
          const imageDoc = path.join(dir, 'image.md');
          const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#0969da"/></svg>';
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(path.join(dir, 'demo.svg'), svg, 'utf8');
          await fs.promises.writeFile(doc, '# 版本\n\nv1\n', 'utf8');
          await fs.promises.writeFile(imageDoc, '# 图片\n\n![图](demo.svg)\n', 'utf8');
          const ej = (js) => win.webContents.executeJavaScript(js);
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const open = async (p) => { await ej(`window.api.openPath(${JSON.stringify(p)})`); await wait(1000); };
          const saveText = async (text) => {
            if (!await ej(`document.body.classList.contains('edit-mode')`)) win.webContents.send('menu:toggle-edit');
            await wait(400);
            await ej(`(() => { const e = document.getElementById('editor'); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input')); return true; })()`);
            win.webContents.send('menu:save');
            await wait(700);
          };
          const leaveSource = async () => { if (await ej(`document.body.classList.contains('edit-mode')`)) { win.webContents.send('menu:toggle-edit'); await wait(500); } };
          const oldCfg = { snapshotEnabled: config.snapshotEnabled, snapshotMax: config.snapshotMax, snapshotDays: config.snapshotDays, pandocPath: config.pandocPath, imageUploadCommand: config.imageUploadCommand };
          const r = {};
          const check = async (name, fn) => {
            try { r[name] = !!(await fn()); }
            catch (err) { r[name] = false; r[name + 'Error'] = String(err && err.message || err); }
          };
          try {
            await ej(`window.api.setConfig({ snapshotEnabled: true, snapshotMax: 50, snapshotDays: 30 })`);
            await open(doc);
            await saveText('# 版本\n\nv2\n');
            await leaveSource();
            let list = [];
            try { list = await ej(`window.api.historyList(${JSON.stringify(doc)})`); } catch {}
            await check('snapshotCreate', () => Array.isArray(list) && list.length >= 1 && list.some((x) => (x.preview || '').includes('v1')));
            const count = Array.isArray(list) ? list.length : 0;
            win.webContents.send('menu:save');
            await wait(600);
            try { list = await ej(`window.api.historyList(${JSON.stringify(doc)})`); } catch { list = []; }
            await check('snapshotDedupe', () => Array.isArray(list) && list.length === count);
            await check('snapshotRestore', async () => {
              const item = list && list[0];
              if (!item) return false;
              await ej(`window.api.historyRestore(${JSON.stringify(doc)}, ${JSON.stringify(item.id)})`);
              await wait(800);
              return (await fs.promises.readFile(doc, 'utf8')).includes('v1');
            });
            await check('snapshotRetention', async () => {
              await ej(`window.api.setConfig({ snapshotMax: 3 })`);
              for (let i = 3; i <= 7; i++) { await saveText(`# 版本\n\nv${i}\n`); await leaveSource(); }
              const items = await ej(`window.api.historyList(${JSON.stringify(doc)})`);
              return Array.isArray(items) && items.length <= 3;
            });
            await check('historyUi', async () => {
              const item = Menu.getApplicationMenu().getMenuItemById('history-open');
              if (!item) return false;
              item.click();
              await wait(500);
              const opened = await ej(`!!document.querySelector('.history-modal:not([hidden])')`);
              await ej(`(() => { const b = [...document.querySelectorAll('.history-modal:not([hidden]) button')].find((x) => x.textContent === '关闭'); if (b) b.click(); return true; })()`);
              return opened;
            });
            await check('pandocStatus', () => ej(`window.api.pandocStatus().then((x) => x.available === true)`));
            await check('pandocExport', async () => {
              const out = path.join(ARTIFACT_DIR, 'audit5.docx');
              devPandocTarget = out;
              const item = Menu.getApplicationMenu().getMenuItemById('pandoc-docx');
              if (!item) return false;
              item.click();
              await wait(1500);
              return fs.existsSync(out) && fs.statSync(out).size > 0;
            });
            await ej(`window.api.setConfig({ imageUploadCommand: 'mock-upload {file}' })`);
            await open(imageDoc);
            await check('imageUpload', async () => {
              await ej(`document.querySelector('#content img').click()`);
              await wait(500);
              const btn = await ej(`!!document.querySelector('.link-modal:not([hidden]) .upload-image-btn')`);
              if (!btn) return false;
              await ej(`document.querySelector('.link-modal:not([hidden]) .upload-image-btn').click()`);
              await wait(1200);
              const text = await fs.promises.readFile(imageDoc, 'utf8');
              const closed = await ej(`!document.querySelector('.link-modal:not([hidden])')`);
              return text.includes('https://example.com/uploaded.png') && closed;
            });
            await check('integrationSettings', async () => {
              const item = Menu.getApplicationMenu().getMenuItemById('integration-settings');
              if (!item) return false;
              item.click();
              await wait(500);
              const ok = await ej(`!!document.querySelector('.integration-modal:not([hidden]) #pandoc-path-input') && !!document.querySelector('.integration-modal:not([hidden]) #upload-command-input')`);
              await ej(`(() => { const b = [...document.querySelectorAll('.integration-modal:not([hidden]) button')].find((x) => x.textContent === '关闭'); if (b) b.click(); return true; })()`);
              return ok;
            });
          } finally {
            devPandocTarget = null;
            await ej(`window.api.setConfig(${JSON.stringify(oldCfg)})`);
            await open(mainFile);
          }
          console.log('audit5 test:', Object.values(r).every((v) => v === true) ? 'PASS' : 'FAIL', JSON.stringify(r));
        }
        if (edgeTest && currentFile) {
          const mainFile = currentFile;
          const orig = await fs.promises.readFile(mainFile, 'utf8');
          const results = {};
          const read = () => fs.promises.readFile(mainFile, 'utf8');
          const undo = async () => { win.webContents.send('menu:undo'); await new Promise((r) => setTimeout(r, 900)); };
          const selectFirst = (selExpr, len) => win.webContents.executeJavaScript(
            `(() => { const host = ${selExpr};
               const tn = [...host.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= ${len});
               if (!tn) return false;
               document.getElementById('content').focus();
               const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, ${len});
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`
          );
          await resetUi();
          await win.webContents.executeJavaScript(`document.getElementById('btn-search').click()`);
          await win.webContents.executeJavaScript(
            `(() => { const i = document.getElementById('search-input'); i.value = '主题'; i.dispatchEvent(new Event('input')); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1200));
          await win.webContents.executeJavaScript(
            `(() => { document.getElementById('replace-input').value = ''; document.getElementById('btn-replace-all').click(); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          let now = await read();
          results.e1 = !now.includes('三套主题') && !now.includes('主题看看');
          await undo();
          results.e1undo = (await read()) === orig;
          await win.webContents.executeJavaScript(`document.getElementById('btn-search-close').click()`);
          await resetUi();
          await selectFirst(`document.querySelector('#content table td')`, 2);
          await new Promise((r) => setTimeout(r, 300));
          win.webContents.send('menu:insert', 'color:#0969da');
          await new Promise((r) => setTimeout(r, 1000));
          results.e2 = (await read()).includes('{#0969da}(文本)');
          await undo();
          await selectFirst(`document.querySelector('#content ul li')`, 4);
          await new Promise((r) => setTimeout(r, 300));
          win.webContents.send('menu:insert', 'color:#1a7f37');
          await new Promise((r) => setTimeout(r, 1000));
          results.e3 = (await read()).includes('{#1a7f37}(阅读体验)');
          await undo();
          await selectFirst(`[...document.querySelectorAll('#content p[data-blk]')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4))`, 4);
          await new Promise((r) => setTimeout(r, 300));
          win.webContents.send('menu:insert', 'color:#cf222e');
          await new Promise((r) => setTimeout(r, 900));
          win.webContents.send('menu:toggle-edit');
          await new Promise((r) => setTimeout(r, 600));
          await undo();
          results.e4 = (await win.webContents.executeJavaScript(`document.getElementById('editor').value`)) === orig;
          win.webContents.send('menu:toggle-edit');
          await new Promise((r) => setTimeout(r, 800));
          const emptyPath = path.join(ARTIFACT_DIR, 'edge-empty.md');
          await fs.promises.writeFile(emptyPath, '', 'utf8');
          await win.webContents.executeJavaScript(`window.api.openPath(${JSON.stringify(emptyPath)})`);
          await new Promise((r) => setTimeout(r, 900));
          const emptyOk = await win.webContents.executeJavaScript(
            `(() => { const c = document.getElementById('content');
               return { note: !!c.querySelector('.empty-note'), editable: c.getAttribute('contenteditable') }; })()`
          );
          await win.webContents.executeJavaScript(
            `(() => { const c = document.getElementById('content'); c.focus();
               document.execCommand('insertText', false, '新内容');
               c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 900));
          const emptySaved = await fs.promises.readFile(emptyPath, 'utf8');
          results.e5 = emptyOk.note && emptyOk.editable === 'true' && emptySaved.includes('新内容') && !emptySaved.includes('（空文件）');
          results.e5detail = JSON.stringify(emptySaved.slice(0, 60));
          await win.webContents.executeJavaScript(`window.api.openPath(${JSON.stringify(mainFile)})`);
          await new Promise((r) => setTimeout(r, 900));
          await selectFirst(`[...document.querySelectorAll('#content p[data-blk]')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4))`, 4);
          await new Promise((r) => setTimeout(r, 400));
          await win.webContents.executeJavaScript(`document.querySelector('#float-bar button[data-fmt="link"]').click()`);
          await new Promise((r) => setTimeout(r, 800));
          await win.webContents.executeJavaScript(
            `(() => { const card = document.querySelector('.link-modal:not([hidden]) .link-card'); if (!card) return false;
               card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 700));
          results.e6 = (await read()) === orig &&
            (await win.webContents.executeJavaScript(`!document.querySelector('#content a[href=""]')`));
          win.webContents.send('menu:toggle-edit');
          await new Promise((r) => setTimeout(r, 600));
          win.webContents.send('menu:insert', 'h1');
          await new Promise((r) => setTimeout(r, 700));
          await undo();
          results.e7 = (await win.webContents.executeJavaScript(`document.getElementById('editor').value`)) === orig;
          win.webContents.send('menu:toggle-edit');
          await new Promise((r) => setTimeout(r, 800));
          await win.webContents.executeJavaScript(`window.api.setZoom(1)`);
          await new Promise((r) => setTimeout(r, 800));
          await selectFirst(`[...document.querySelectorAll('#content p[data-blk]')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4))`, 10);
          await new Promise((r) => setTimeout(r, 800));
          const pos = await win.webContents.executeJavaScript(
            `(() => { const b = document.getElementById('float-bar'); if (b.hidden) return null;
               const br = b.getBoundingClientRect();
               const s = document.getSelection(); const sr = s.getRangeAt(0).getBoundingClientRect();
               return { above: br.bottom <= sr.top + 2, inView: br.left >= 0 && br.right <= innerWidth }; })()`
          );
          results.e8 = !!pos && pos.above && pos.inView;
          await win.webContents.executeJavaScript(`window.api.setZoom(0)`);
          await new Promise((r) => setTimeout(r, 400));
          console.log('edge test:', Object.values(results).every((v) => v === true || typeof v === 'string') ? 'PASS' : 'FAIL', JSON.stringify(results));
          await openPath(mainFile);
          await new Promise((r) => setTimeout(r, 600));
          await fs.promises.writeFile(mainFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 1200));
        }
        if (linkTest && currentFile) {
          await resetUi();
          await new Promise((r) => setTimeout(r, 400));
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await new Promise((r) => setTimeout(r, 200));
          await win.webContents.executeJavaScript(
            `(() => { const a = document.querySelector('#content a[href^="http"]');
               a.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!a; })()`
          );
          await new Promise((r) => setTimeout(r, 300));
          const hasModal = await win.webContents.executeJavaScript(`!!document.querySelector('.link-modal:not([hidden]) .link-card')`);
          await win.webContents.executeJavaScript(
            `(() => { const card = document.querySelector('.link-modal:not([hidden]) .link-card');
               if (!card) return false;
               const inputs = card.querySelectorAll('input');
               inputs[1].value = 'not a valid url';
               card.querySelector('button.primary').click();
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 300));
          const errShown = await win.webContents.executeJavaScript(
            `(document.querySelector('.link-modal:not([hidden]) .link-err') || {}).textContent || ''`
          );
          const unchanged = await fs.promises.readFile(currentFile, 'utf8');
          await win.webContents.executeJavaScript(
            `(() => { const card = document.querySelector('.link-modal:not([hidden]) .link-card');
               if (!card) return false;
               const inputs = card.querySelectorAll('input');
               inputs[0].value = '新链接文字';
               inputs[1].value = 'https://example.com/';
               card.querySelector('button.primary').click();
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          console.log('link test:', hasModal && errShown.includes('不合法') && unchanged === orig && now.includes('[新链接文字](https://example.com/)') ? 'PASS' : 'FAIL', 'modal=', hasModal, 'err=', JSON.stringify(errShown));
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          const undone = await fs.promises.readFile(currentFile, 'utf8');
          console.log('link undo:', undone === orig ? 'PASS' : 'FAIL');
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (linkShot && currentFile) {
          await win.webContents.executeJavaScript(
            `(() => { const a = document.querySelector('#content a[href^="http"]');
               a.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`
          );
          await new Promise((r) => setTimeout(r, 400));
        }
        if (pasteTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await win.webContents.executeJavaScript(
            `(async () => {
               const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
               const bin = atob(b64);
               const arr = new Uint8Array(bin.length);
               for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
               const file = new File([arr], 'x.png', { type: 'image/png' });
               const dt = new DataTransfer();
               dt.items.add(file);
               document.getElementById('content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
               return true;
             })()`
          );
          await new Promise((r) => setTimeout(r, 2500));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          console.log('paste tail:', JSON.stringify(now.slice(-120)));
          console.log('paste test:', now.includes('![pasted](assets/pasted-') ? 'PASS' : 'FAIL');
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (tableTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await win.webContents.executeJavaScript(
            `(() => { const td = document.querySelector('#content table td');
               const r = td.getBoundingClientRect();
               td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.x + 10, clientY: r.y + 10 }));
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 300));
          const menuOk = await win.webContents.executeJavaScript(`!!document.querySelector('.table-menu')`);
          await win.webContents.executeJavaScript(
            `(() => { const b = [...document.querySelectorAll('.table-menu button')].find((x) => x.textContent === '在右侧插入列');
               if (b) b.click(); return !!b; })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          const colOk = now.includes('| 左对齐 |  | 居中 | 右对齐 |');
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          await win.webContents.executeJavaScript(
            `(() => { const w = document.querySelector('#content .table-wrap');
               w.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 300));
          await win.webContents.executeJavaScript(
            `(() => { const b = document.querySelector('#content .table-cfg-btn');
               if (b) b.click(); return !!b; })()`
          );
          await new Promise((r) => setTimeout(r, 300));
          const dlgOk = await win.webContents.executeJavaScript(`!!document.querySelector('.link-modal:not([hidden]) .link-card')`);
          await win.webContents.executeJavaScript(
            `(() => { const card = document.querySelector('.link-modal:not([hidden]) .link-card');
               if (!card) return false;
               const nums = card.querySelectorAll('input[type="number"]');
               nums[0].value = '200';
               const sel = card.querySelector('select');
               sel.value = 'center';
               card.querySelector('button.primary').click();
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          const now2 = await fs.promises.readFile(currentFile, 'utf8');
          const cfgOk = now2.includes('{:table ') && now2.includes('"w":200') && now2.includes('"align":"center"');
          console.log('table test:', menuOk && colOk && dlgOk && cfgOk ? 'PASS' : 'FAIL', 'menu=', menuOk, 'col=', colOk, 'dlg=', dlgOk, 'cfg=', cfgOk);
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (breakTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await win.webContents.executeJavaScript(
            `(async () => {
               const p = document.querySelector('#content p[data-blk]');
               const r = p.getBoundingClientRect();
               const opt = { bubbles: true, clientX: r.x + 80, clientY: r.y + 12, button: 0 };
               p.dispatchEvent(new MouseEvent('mousedown', opt));
               p.dispatchEvent(new MouseEvent('click', opt));
               await new Promise((res) => setTimeout(res, 400));
               const cr2 = document.caretRangeFromPoint(opt.clientX, opt.clientY);
               if (cr2) { const s0 = document.getSelection(); s0.removeAllRanges(); s0.addRange(cr2); }
               document.execCommand('insertParagraph');
               document.execCommand('insertText', false, '第二行');
               p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
               return true;
             })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          const now = await fs.promises.readFile(currentFile, 'utf8');
          const brOk = now.includes('\n\n第二行');
          const rendered = await win.webContents.executeJavaScript(
            `!!([...document.querySelectorAll('#content div, #content p')].find((n) => n.textContent.startsWith('第二行')))`
          );
          console.log('break test:', brOk && rendered ? 'PASS' : 'FAIL', 'src=', brOk, 'br=', rendered);
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1000));
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (listTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          let stable = true;
          for (let i = 0; i < 3; i++) {
            await win.webContents.executeJavaScript(
              `(async () => {
                 const ul = document.querySelector('#content ul[data-blk]');
                 const li = ul.querySelectorAll('li')[1] || ul;
                 const r = li.getBoundingClientRect();
                 const opt = { bubbles: true, clientX: r.x + 20, clientY: r.y + 8, button: 0 };
                 li.dispatchEvent(new MouseEvent('mousedown', opt));
                 li.dispatchEvent(new MouseEvent('click', opt));
                 await new Promise((res) => setTimeout(res, 400));
                 window.__liDump = ul.children[0].innerHTML;
                 ul.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
                 return true;
               })()`
            );
            await new Promise((r) => setTimeout(r, 900));
            const dump = await win.webContents.executeJavaScript(`window.__liDump || ''`);
            console.log('li dump:', JSON.stringify(dump));
            const now = await fs.promises.readFile(currentFile, 'utf8');
            if (now !== orig) {
              stable = false;
              const a = orig.split('\n');
              const b = now.split('\n');
              for (let l = 0; l < Math.max(a.length, b.length); l++) {
                if (a[l] !== b[l]) {
                  console.log('list diff at line', l, JSON.stringify(a[l]), '->', JSON.stringify(b[l]));
                  break;
                }
              }
              break;
            }
          }
          console.log('list test:', stable ? 'PASS' : 'FAIL');
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 1500));
        }
        if (rapidTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          await win.webContents.executeJavaScript(
            `(() => { const c = document.getElementById('content'); c.focus();
               const p = c.querySelector('p[data-blk]');
               const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
               const tn = w.nextNode(); if (tn) { const r = document.createRange(); r.setStart(tn, 0); r.collapse(true);
                 const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); }
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 300));
          const st = await win.webContents.executeJavaScript(
            `(async () => {
               const ps = [...document.querySelectorAll('#content p[data-blk]')].slice(0, 3);
               for (let i = 0; i < 9; i++) {
                 const p = ps[i % ps.length];
                 const r = p.getBoundingClientRect();
                 const opt = { bubbles: true, clientX: r.x + 60, clientY: r.y + 10, button: 0 };
                 p.dispatchEvent(new MouseEvent('mousedown', opt));
                 p.dispatchEvent(new MouseEvent('click', opt));
                 await new Promise((res) => setTimeout(res, 60));
               }
               await new Promise((res) => setTimeout(res, 900));
               const p = ps[0];
               const r = p.getBoundingClientRect();
               const opt = { bubbles: true, clientX: r.x + 60, clientY: r.y + 10, button: 0 };
               p.dispatchEvent(new MouseEvent('mousedown', opt));
               p.dispatchEvent(new MouseEvent('click', opt));
               await new Promise((res) => setTimeout(res, 600));
               const a = document.activeElement;
               return { editable: !!(a && a.isContentEditable), count: document.querySelectorAll('#content [contenteditable="true"]').length, attr: document.getElementById('content').getAttribute('contenteditable') };
             })()`
          );
          console.log('rapid test:', st.editable && st.attr === 'true' ? 'PASS' : 'FAIL', JSON.stringify(st));
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (undoTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          const inEdit = await win.webContents.executeJavaScript(`document.body.classList.contains('edit-mode')`);
          if (inEdit) {
            win.webContents.send('menu:toggle-edit');
            await new Promise((r) => setTimeout(r, 400));
          }
          await new Promise((r) => setTimeout(r, 200));
          await win.webContents.executeJavaScript(
            `(() => { const p = document.querySelector('#content p[data-blk]');
               p.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); })()`
          );
          await new Promise((r) => setTimeout(r, 300));
          await win.webContents.executeJavaScript(
            `(() => { const b = document.querySelector('#content .blk-delete');
               if (b) b.click(); return !!b; })()`
          );
          await new Promise((r) => setTimeout(r, 1200));
          const deleted = await fs.promises.readFile(currentFile, 'utf8');
          win.webContents.send('menu:undo');
          await new Promise((r) => setTimeout(r, 1200));
          const undone = await fs.promises.readFile(currentFile, 'utf8');
          console.log('undo test:', deleted.length < orig.length && undone === orig ? 'PASS' : 'FAIL', orig.length, deleted.length, undone.length);
          await win.webContents.executeJavaScript(
            `(async () => { const p = document.querySelector('#content p[data-blk]');
               const r = p.getBoundingClientRect();
               const opt = { bubbles: true, clientX: r.x + 80, clientY: r.y + 12, button: 0 };
               p.dispatchEvent(new MouseEvent('mousedown', opt));
               p.dispatchEvent(new MouseEvent('click', opt));
               await new Promise((res) => setTimeout(res, 400));
               const cr = document.caretRangeFromPoint(opt.clientX, opt.clientY);
               if (cr) { const s0 = document.getSelection(); s0.removeAllRanges(); s0.addRange(cr); }
               const sel = document.getSelection();
               sel.modify('move', 'forward', 'character');
               sel.modify('extend', 'forward', 'character');
               sel.deleteFromDocument();
               p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 1000));
          const toastText = await win.webContents.executeJavaScript(`document.getElementById('toast').textContent`);
          console.log('echo test:', !toastText.includes('外部') ? 'PASS' : 'FAIL', JSON.stringify(toastText));
          await fs.promises.writeFile(currentFile, orig, 'utf8');
          await new Promise((r) => setTimeout(r, 800));
        }
        if (hoverTableShot && currentFile) {
          const dbg = win.webContents.debugger;
          if (!dbg.isAttached()) dbg.attach('1.3');
          await win.webContents.executeJavaScript(
            `document.getElementById('content').dispatchEvent(new MouseEvent('mouseleave'))`
          );
          const scrolled = await win.webContents.executeJavaScript(
            `(() => { const s = document.getElementById('scroll');
               s.scrollTop = document.querySelector('#content .table-wrap').offsetTop - 200;
               return [s.scrollTop, s.scrollHeight, s.clientHeight]; })()`
          );
          console.log('hover-table scroll:', scrolled);
          await new Promise((r) => setTimeout(r, 300));
          const pt = await win.webContents.executeJavaScript(
            `(() => { const t = document.querySelector('#content .table-wrap');
               const r = t.getBoundingClientRect(); return { x: r.x + 60, y: r.y + 30 }; })()`
          );
          await dbg.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
          await new Promise((r) => setTimeout(r, 400));
          if (dbg.isAttached()) dbg.detach();
        }
        if (watchTest && currentFile) {
          const orig = await fs.promises.readFile(currentFile, 'utf8');
          setTimeout(() => {
            fs.promises.appendFile(currentFile, '\n\n> 外部修改：自动刷新测试。\n').catch(() => {});
          }, 800);
          await new Promise((r) => setTimeout(r, 3000));
          if (capturePath) {
            await win.webContents.executeJavaScript(
              `document.getElementById('scroll').scrollTop = 1e9`
            );
            await new Promise((r) => setTimeout(r, 350));
            const img = await win.webContents.capturePage();
            await fs.promises.writeFile(path.resolve(capturePath), img.toPNG());
          }
          await fs.promises.writeFile(currentFile, orig);
          restoreDevLanguageIsolation();
          app.quit();
          return;
        }
        if (colorPanelShot && currentFile) {
          await win.webContents.executeJavaScript(
            `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')]
                 .find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4));
               document.getElementById('content').focus();
               const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= 4);
               const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 6);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 200));
          win.webContents.send('menu:insert', 'color:panel');
          await new Promise((r) => setTimeout(r, 600));
        }
        if (floatShot && currentFile) {
          await win.webContents.executeJavaScript(
            `(() => { const p = [...document.querySelectorAll('#content p[data-blk]')]
                 .find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 4));
               document.getElementById('content').focus();
               const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length >= 4);
               const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 10);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 500));
        }
        if (focusShot && currentFile) {
          win.webContents.send('focus:set', true);
          await new Promise((r) => setTimeout(r, 300));
          await win.webContents.executeJavaScript(`document.getElementById('scroll').scrollTop = 0`);
          await new Promise((r) => setTimeout(r, 300));
          await win.webContents.executeJavaScript(
            `(() => { const blk = document.getElementById('content').children[4];
               const w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
               const tn = w.nextNode(); if (!tn) return false;
               document.getElementById('content').focus();
               const r = document.createRange(); r.setStart(tn, 0); r.collapse(true);
               const s = document.getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`
          );
          await new Promise((r) => setTimeout(r, 600));
        }
        if (treeShot && currentFile) {
          await win.webContents.executeJavaScript(`document.getElementById('tab-files').click()`);
          await new Promise((r) => setTimeout(r, 700));
          await win.webContents.executeJavaScript(
            `(() => { const row = [...document.querySelectorAll('#file-tree .tree-dir')].find((r) => r.querySelector('.tree-name').textContent === 'assets'); if (row) row.click(); return !!row; })()`
          );
          await new Promise((r) => setTimeout(r, 700));
        }
        if (replaceShot && currentFile) {
          await win.webContents.executeJavaScript(
            `(() => { document.getElementById('btn-search').click();
               const i = document.getElementById('search-input');
               i.value = '引用'; i.dispatchEvent(new Event('input'));
               document.getElementById('replace-input').value = '参考';
               return true; })()`
          );
          await new Promise((r) => setTimeout(r, 700));
        }
        if (typoShot && currentFile) {
          win.webContents.send('menu:typography');
          await new Promise((r) => setTimeout(r, 500));
        }
        if (findText) {
          await win.webContents.executeJavaScript(
            `(() => { document.getElementById('btn-search').click();
               const i = document.getElementById('search-input');
               i.value = ${JSON.stringify(findText)};
               i.dispatchEvent(new Event('input')); })()`
          );
          await new Promise((r) => setTimeout(r, 800));
        }
        if (capturePath) {
          if (scrollVal) {
            await win.webContents.executeJavaScript(
              `document.getElementById('scroll').scrollTop = ${scrollVal}`
            );
            await new Promise((r) => setTimeout(r, 350));
          }
          const img = await win.webContents.capturePage();
          await fs.promises.writeFile(path.resolve(capturePath), img.toPNG());
        }
      } catch (err) {
        console.error('dev capture failed:', err);
      }
      restoreDevLanguageIsolation();
      app.quit();
    }, 1500);
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (e, args) => {
    const f = args.find((a) => MD_EXTS.has(path.extname(a).toLowerCase()) && fs.existsSync(a));
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) openPath(f);
    }
  });

  app.whenReady().then(() => {
    loadConfig();
    currentLanguage = resolvedLanguage();
    ensureCustomCss();
    if (themeFlag && THEME_BG[themeFlag]) config.theme = themeFlag;
    if (fontFlag === 'serif' || fontFlag === 'sans') config.font = fontFlag;
    createWindow();
    buildMenu();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on('window-all-closed', () => {
  app.quit();
});