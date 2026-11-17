const { app, BrowserWindow, Menu, dialog, ipcMain, shell, net, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');

const APP_VERSION = require('../package.json').version;
const VERSION_MATCH = APP_VERSION.match(/^(\d+\.\d+\.\d+)-(\d{8})$/);
const APP_VERSION_DISPLAY = VERSION_MATCH
  ? `v${VERSION_MATCH[1]} (Date ${VERSION_MATCH[2]})`
  : `v${APP_VERSION}`;
const ROOT = path.join(__dirname, '..');

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
const externalOpens = [];
let devRunStarted = false;
let editMode = false;
let selfWrite = null;

const config = { theme: 'light', font: 'sans', zoom: 0, sidebar: true, wide: false, recent: [], lastFile: null, window: null };
const configPath = () => path.join(app.getPath('userData'), 'config.json');

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
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (rawArgs.some((a) => /-(test|shot)$/.test(a))) win.webContents.setBackgroundThrottling(false);
  win.once('ready-to-show', () => {
    win.show();
    applyZoom();
  });
  win.webContents.on('did-finish-load', applyZoom);
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
        { type: 'separator' },
        { label: '导出为 PDF…', accelerator: 'CmdOrCtrl+P', click: () => win?.webContents.send('pdf:prepare') },
        { label: '导出为长图…', accelerator: 'CmdOrCtrl+Shift+E', click: () => win?.webContents.send('image:prepare') },
        { label: '导出为 HTML…', accelerator: 'CmdOrCtrl+Shift+H', click: () => win?.webContents.send('html:prepare') },
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
    if (!parseVer(tag)) return { error: '无法解析远端版本：' + tag };
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
ipcMain.handle('config:set', (e, patch) => {
  if (patch && typeof patch === 'object') {
    Object.assign(config, patch);
    saveConfig();
    if (patch.theme) {
      win?.setBackgroundColor(THEME_BG[config.theme] || THEME_BG.light);
      buildMenu();
    }
    if (patch.zoom != null) applyZoom();
    if (patch.recent || patch.lastFile !== undefined) buildMenu();
  }
  return config;
});
ipcMain.handle('app:samplePath', () => path.join(ROOT, 'assets', 'sample.md'));
ipcMain.handle('app:version', () => APP_VERSION_DISPLAY);
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
ipcMain.handle('file:save', async (e, content) => {
  if (!currentFile || typeof content !== 'string') return { saved: false };
  await fs.promises.writeFile(currentFile, content, 'utf8');
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
  if (typeof text === 'string') clipboard.writeText(text);
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
          r.copyMd = clipboard.readText().includes('==高亮==');
          win.webContents.send('menu:copy-html');
          await wait(400);
          r.copyHtml = clipboard.readText().includes('<mark>');
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