import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import ini from 'highlight.js/lib/languages/ini';
import diff from 'highlight.js/lib/languages/diff';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import lua from 'highlight.js/lib/languages/lua';
import r from 'highlight.js/lib/languages/r';
import katex from 'katex';
import renderMathInElement from 'katex/dist/contrib/auto-render.mjs';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import './styles/app.css';

const LANGS = {
  javascript, typescript, python, java, c, cpp, csharp, go, rust, bash, shell,
  json, yaml, xml, css, scss, sql, markdown, kotlin, swift, php, ruby,
  dockerfile, ini, diff, plaintext, powershell, lua, r,
};
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def);

const MD_EXTS = ['.md', '.markdown', '.mdown', '.mkd', '.txt'];
const THEMES = ['light', 'dark', 'sepia'];
const THEME_LABEL = { light: '浅色', dark: '深色', sepia: '护眼' };
const MERMAID_THEME = { light: 'default', dark: 'dark', sepia: 'neutral' };

const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false })
  .use(anchor, {
    slugify: (s) => encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-')),
    uniqueSlugStartIndex: 1,
  })
  .use(footnote)
  .use(taskLists, { enabled: false, label: true, labelAfter: true });

md.inline.ruler.before('text', 'color', (state, silent) => {
  const m = /^\{([a-zA-Z]{3,20}|#[0-9a-fA-F]{3,8})\}\(/.exec(state.src.slice(state.pos));
  if (!m) return false;
  const start = state.pos + m[0].length;
  const close = state.src.indexOf(')', start);
  if (close < 0) return false;
  if (!silent) {
    const open = state.push('color_open', 'span', 1);
    open.attrSet('data-color', m[1]);
    const oldPos = state.pos;
    const oldMax = state.posMax;
    state.pos = start;
    state.posMax = close;
    state.md.inline.tokenize(state);
    state.pos = oldPos;
    state.posMax = oldMax;
    state.push('color_close', 'span', -1);
  }
  state.pos = close + 1;
  return true;
});
md.renderer.rules.color_open = (tokens, i) => `<span style="color:${tokens[i].attrGet('data-color')}" data-color="${tokens[i].attrGet('data-color')}">`;
md.renderer.rules.color_close = () => '</span>';

md.block.ruler.before('paragraph', 'table_config', (state, startLine, endLine, silent) => {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const line = state.src.slice(pos, state.eMarks[startLine]);
  const m = /^\{:table\s+(\{.*\})\s*\}$/.exec(line);
  if (!m) return false;
  let cfg = null;
  try { cfg = JSON.parse(m[1]); } catch { return false; }
  if (silent) return true;
  const tok = state.push('table_config', '', 0);
  tok.map = [startLine, startLine + 1];
  tok.meta = cfg;
  tok.hidden = true;
  state.line = startLine + 1;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

md.core.ruler.push('table_cfg_attach', (state) => {
  const toks = state.tokens;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type !== 'table_config') continue;
    for (let j = i - 1; j >= 0; j--) {
      if (toks[j].type === 'table_open') {
        toks[j].meta = Object.assign({}, toks[j].meta, { cfg: toks[i].meta });
        break;
      }
      if (toks[j].nesting === 1) break;
    }
  }
});

function tableCfgAt(tokens, i) {
  for (let j = i; j >= 0; j--) {
    if (tokens[j].type === 'table_open') return (tokens[j].meta && tokens[j].meta.cfg) || null;
    if (tokens[j].type === 'table_close') return null;
  }
  return null;
}
function cellIndexAt(tokens, i) {
  let n = 0;
  for (let j = i - 1; j >= 0; j--) {
    const t = tokens[j].type;
    if (t === 'tr_open') break;
    if (t === 'th_open' || t === 'td_open') n++;
  }
  return n;
}
function rowIndexAt(tokens, i) {
  let n = 0;
  for (let j = i - 1; j >= 0; j--) {
    if (tokens[j].type === 'tr_open') n++;
    if (tokens[j].type === 'table_open') break;
  }
  return n - 1;
}
md.renderer.rules.table_open = (tokens, i, opts, env, self) => {
  const cfg = tableCfgAt(tokens, i);
  if (cfg && cfg.cols && cfg.cols.some((c) => c && c.w)) {
    tokens[i].attrSet('style', 'table-layout:fixed;width:100%');
  }
  return self.renderToken(tokens, i, opts);
};
md.renderer.rules.th_open = (tokens, i, opts, env, self) => cellStyle(tokens, i, opts, self);
md.renderer.rules.td_open = (tokens, i, opts, env, self) => cellStyle(tokens, i, opts, self);
function cellStyle(tokens, i, opts, self) {
  const cfg = tableCfgAt(tokens, i);
  if (cfg && cfg.cols) {
    const c = cfg.cols[cellIndexAt(tokens, i)];
    if (c) {
      const styles = [];
      const existing = tokens[i].attrGet('style');
      if (existing) styles.push(existing);
      if (c.w) styles.push('width:' + c.w + 'px');
      if (c.align) styles.push('text-align:' + c.align);
      if (styles.length) tokens[i].attrSet('style', styles.join(';'));
    }
  }
  return self.renderToken(tokens, i, opts);
}
md.renderer.rules.tr_open = (tokens, i, opts, env, self) => {
  const cfg = tableCfgAt(tokens, i);
  if (cfg && cfg.rows) {
    const r = cfg.rows[rowIndexAt(tokens, i)];
    if (r && r.h) tokens[i].attrSet('style', 'height:' + r.h + 'px');
  }
  return self.renderToken(tokens, i, opts);
};

const $ = (sel) => document.querySelector(sel);
const api = window.api;
const contentEl = $('#content');
const scrollEl = $('#scroll');
const welcomeEl = $('#welcome');
const tocEl = $('#toc');
const searchBar = $('#search-bar');
const searchInput = $('#search-input');
const searchCount = $('#search-count');
const lightbox = $('#lightbox');
const dropOverlay = $('#drop-overlay');
const editorWrap = $('#editor-wrap');
const editor = $('#editor');

const state = {
  path: null, dir: null, name: null,
  theme: 'light', font: 'sans', zoom: 0, sidebar: true,
  edit: false, raw: '', lastSave: null, wide: false, renderChain: Promise.resolve(), gaps: [], pendingMutation: false,
  editing: null, pickerPending: false, blocks: [],
  headings: [], mermaidBlocks: [],
  focusMode: false, typewriterMode: false, focusBlk: null, twBlk: null,
  typography: { size: 17, lineHeight: 1.8, paraSpace: 1 },
};

let mermaidSeq = 0;
let searchOpen = false;
let searchTimer = null;
let renderTimer = null;
let saveTimer = null;
let toastTimer = null;
let exporting = false;
let imaging = false;
let dragDepth = 0;

/* ---------- Markdown 渲染 ---------- */

function renderMarkdown(text, opts) {
  const p = doRender(text, opts);
  state.renderChain = p;
  return p;
}

async function doRender(text, { preserve = false } = {}) {
  if (state.editing) {
    const ed = state.editing;
    state.editing = null;
    cleanupEditingDom(ed);
  }
  state.raw = text;
  const max = scrollEl.scrollHeight - scrollEl.clientHeight;
  const ratio = preserve && max > 0 ? scrollEl.scrollTop / max : 0;

  contentEl.innerHTML = text.trim() ? md.render(text) : '<p class="empty-note">（空文件）</p>';
  fixImages();
  wrapTables();
  enhanceCodeBlocks();
  renderMath();
  tagBlocks();
  await renderMermaidBlocks();
  buildToc();
  tagBlocks();
  updateStats();

  if (preserve) {
    syncLock = true;
    requestAnimationFrame(() => {
      scrollEl.scrollTop = ratio * (scrollEl.scrollHeight - scrollEl.clientHeight);
      updateActiveHeading();
      updateProgress();
      requestAnimationFrame(() => {
        syncLock = false;
        if (state.edit) syncScroll(editor, scrollEl);
        if (state.typewriterMode) { state.twBlk = null; typewriterScroll(); }
      });
    });
  } else {
    scrollEl.scrollTop = 0;
    updateActiveHeading();
    updateProgress();
    if (state.typewriterMode) { state.twBlk = null; typewriterScroll(); }
  }
  if (searchOpen && searchInput.value) runFind({});
  state.focusBlk = null;
  state.twBlk = null;
  updateFocusBlock();
  api.renderDone({ hasFile: true });
}

function fixImages() {
  for (const img of contentEl.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!/^(https?:|data:|file:)/i.test(src) && state.dir) {
      let decoded = src;
      try { decoded = decodeURIComponent(src); } catch {}
      img.dataset.origSrc = src;
      img.src = api.toFileURL(api.resolvePath(state.dir, decoded));
    }
    img.addEventListener('error', () => {
      const note = document.createElement('span');
      note.className = 'img-broken';
      note.textContent = `图片加载失败：${img.getAttribute('alt') || src}`;
      img.replaceWith(note);
    }, { once: true });
    img.draggable = true;
    img.title = '点击配置图片 · 拖拽移动位置';
  }
}

function wrapTables() {
  for (const table of contentEl.querySelectorAll('table')) {
    if (table.parentElement.classList.contains('table-wrap')) continue;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.replaceWith(wrap);
    wrap.append(table);
  }
}

function enhanceCodeBlocks() {
  for (const code of contentEl.querySelectorAll('pre > code')) {
    const langClass = [...code.classList].find((c) => c.startsWith('language-'));
    const lang = langClass ? langClass.slice(9) : '';
    if (lang === 'mermaid') continue;
    const raw = code.textContent;
    const highlighted = lang && hljs.getLanguage(lang)
      ? hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value
      : hljs.highlightAuto(raw).value;
    code.innerHTML = highlighted;
    code.classList.add('hljs');

    const pre = code.parentElement;
    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    const head = document.createElement('div');
    head.className = 'code-head';
    const label = document.createElement('span');
    label.className = 'code-lang';
    label.textContent = lang || 'text';
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    btn.addEventListener('click', async () => {
      await copyText(raw);
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = '复制'; }, 1500);
    });
    head.append(label, btn);
    pre.replaceWith(wrap);
    wrap.append(head, pre);
  }
}

function renderMath() {
  renderMathInElement(contentEl, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
    strict: 'ignore',
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
  });
}

function mermaidInit(theme) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
    flowchart: { useMaxWidth: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });
}

async function renderOneMermaid(item) {
  const id = 'mmd-' + (++mermaidSeq) + '-' + Date.now();
  try {
    const { svg } = await mermaid.render(id, item.source);
    item.box.innerHTML = svg;
    item.box.classList.remove('mermaid-error');
  } catch (err) {
    document.getElementById(id)?.remove();
    item.box.classList.add('mermaid-error');
    item.box.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'mermaid-error-note';
    note.textContent = '图表渲染失败：' + (err && err.message ? err.message : String(err));
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = item.source;
    pre.append(code);
    item.box.append(note, pre);
  }
}

async function renderMermaidBlocks() {
  state.mermaidBlocks = [];
  const pres = [...contentEl.querySelectorAll('pre > code.language-mermaid')].map((c) => c.parentElement);
  if (!pres.length) return;
  mermaidInit(MERMAID_THEME[state.theme] || 'default');
  for (const pre of pres) {
    const source = pre.textContent.trim();
    const box = document.createElement('div');
    box.className = 'mermaid-block';
    pre.replaceWith(box);
    const item = { source, box };
    state.mermaidBlocks.push(item);
    await renderOneMermaid(item);
  }
}

async function rerenderMermaidForTheme(forcedTheme) {
  if (!state.mermaidBlocks.length) return;
  mermaidInit(forcedTheme || MERMAID_THEME[state.theme] || 'default');
  for (const item of state.mermaidBlocks) await renderOneMermaid(item);
}

/* ---------- 大纲 ---------- */

function buildToc() {
  const hs = [...contentEl.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const headText = (h) => {
    const c = h.cloneNode(true);
    c.querySelectorAll('button').forEach((b) => b.remove());
    return c.textContent;
  };
  state.headings = hs.map((h) => ({ id: h.id, level: Number(h.tagName[1]), text: headText(h), el: h }));
  tocEl.innerHTML = '';
  if (!hs.length) {
    tocEl.innerHTML = '<div class="toc-empty">（无标题）</div>';
    return;
  }
  const minLevel = Math.min(...state.headings.map((h) => h.level));
  const ul = document.createElement('ul');
  ul.className = 'toc-list';
  for (const h of state.headings) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'toc-item toc-l' + Math.min(6, h.level - minLevel + 1);
    btn.textContent = h.text;
    btn.title = h.text;
    btn.dataset.target = h.id;
    btn.addEventListener('click', () => scrollToHeading(h.id));
    li.append(btn);
    ul.append(li);
  }
  tocEl.append(ul);
}

function scrollToHeading(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop - 14;
  scrollEl.scrollTo({ top, behavior: 'smooth' });
}

function updateActiveHeading() {
  if (!state.headings.length) return;
  const line = scrollEl.getBoundingClientRect().top + 90;
  let active = state.headings[0];
  for (const h of state.headings) {
    if (h.el.getBoundingClientRect().top <= line) active = h;
    else break;
  }
  for (const btn of tocEl.querySelectorAll('.toc-item')) {
    btn.classList.toggle('active', btn.dataset.target === active.id);
  }
  const activeBtn = tocEl.querySelector('.toc-item.active');
  if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest' });
}

function updateProgress() {
  const max = scrollEl.scrollHeight - scrollEl.clientHeight;
  $('#progress-bar').style.width = (max > 0 ? (scrollEl.scrollTop / max) * 100 : 0) + '%';
}

function updateStats() {
  const clone = contentEl.cloneNode(true);
  clone.querySelectorAll('.mermaid-block, .katex-mathml, button').forEach((n) => n.remove());
  const text = clone.textContent || '';
  const cjkRe = /[㐀-䶿一-鿿豈-﫿]/g;
  const cjk = (text.match(cjkRe) || []).length;
  const latin = (text.replace(cjkRe, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
  const total = cjk + latin;
  $('#stat-words').textContent = total ? `共 ${total.toLocaleString()} 字` : '';
  $('#stat-time').textContent = total ? `约 ${Math.max(1, Math.ceil(total / 400))} 分钟` : '';
}

/* ---------- 主题 / 侧栏 / 缩放 ---------- */

function applyTheme(theme, persist) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  $('#btn-theme').title = `主题：${THEME_LABEL[theme]}（点击切换）`;
  if (persist) api.setConfig({ theme });
  rerenderMermaidForTheme();
}

function applyFont(font, persist) {
  state.font = font === 'serif' ? 'serif' : 'sans';
  document.body.dataset.font = state.font;
  if (persist) api.setConfig({ font: state.font });
}

function applyWide(on, persist) {
  state.wide = Boolean(on);
  document.body.classList.toggle('wide', state.wide);
  $('#btn-wide').classList.toggle('active', state.wide);
  if (persist) api.setConfig({ wide: state.wide });
}

function currentBlockEl() {
  const sel = document.getSelection();
  if (sel.rangeCount && contentEl.contains(sel.anchorNode)) {
    const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const blk = el && el.closest('[data-blk]');
    if (blk && contentEl.contains(blk)) return blk;
  }
  return null;
}

function updateFocusBlock() {
  if (!state.focusMode) return;
  const blk = currentBlockEl();
  if (blk === state.focusBlk) return;
  if (state.focusBlk) state.focusBlk.classList.remove('is-focus');
  state.focusBlk = blk;
  if (blk) blk.classList.add('is-focus');
  contentEl.classList.toggle('has-focus', !!blk);
}

function applyFocusMode(on, persist) {
  state.focusMode = Boolean(on);
  document.body.classList.toggle('focus-mode', state.focusMode);
  if (!state.focusMode) {
    if (state.focusBlk) state.focusBlk.classList.remove('is-focus');
    state.focusBlk = null;
    contentEl.classList.remove('has-focus');
  } else {
    updateFocusBlock();
  }
  if (persist) api.setConfig({ focusMode: state.focusMode });
}

function typewriterScroll() {
  if (!state.typewriterMode || state.edit) return;
  const blk = currentBlockEl();
  if (!blk || blk === state.twBlk) return;
  state.twBlk = blk;
  const rect = blk.getBoundingClientRect();
  const sc = scrollEl.getBoundingClientRect();
  const target = scrollEl.scrollTop + (rect.top - sc.top) - (sc.height - rect.height) / 2;
  scrollEl.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}

function applyTypewriter(on, persist) {
  state.typewriterMode = Boolean(on);
  document.body.classList.toggle('typewriter-mode', state.typewriterMode);
  state.twBlk = null;
  if (state.typewriterMode) typewriterScroll();
  if (persist) api.setConfig({ typewriterMode: state.typewriterMode });
}

/* ---------- 检查更新 ---------- */

let updateModal = null;
function closeUpdateModal() {
  if (updateModal) { updateModal.remove(); updateModal = null; }
}

async function checkUpdate() {
  toast('正在检查更新…');
  const res = await api.checkUpdate();
  if (!res || res.error) { toast('检查更新失败：' + ((res && res.error) || '网络不可达')); return; }
  if (!res.newer) { toast('已是最新版本 ' + res.current); return; }
  closeUpdateModal();
  const wrap = document.createElement('div');
  wrap.className = 'link-modal';
  const card = document.createElement('div');
  card.className = 'link-card';
  const title = document.createElement('h3');
  title.textContent = '发现新版本';
  const info = document.createElement('div');
  info.className = 'update-info';
  info.textContent = `当前 ${res.current} → 最新 ${res.latestDisplay}`;
  const btns = document.createElement('div');
  btns.className = 'link-btns';
  const cancel = document.createElement('button');
  cancel.textContent = '稍后';
  const dl = document.createElement('button');
  dl.textContent = '下载更新';
  dl.className = 'primary';
  dl.addEventListener('click', () => { api.openExternal(res.url); closeUpdateModal(); });
  cancel.addEventListener('click', closeUpdateModal);
  btns.append(cancel, dl);
  card.append(title, info, btns);
  wrap.append(card);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeUpdateModal(); });
  card.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUpdateModal(); });
  document.body.append(wrap);
  updateModal = wrap;
  dl.focus();
}

/* ---------- 字体与排版 ---------- */

const TYPO_DEFAULT = { size: 17, lineHeight: 1.8, paraSpace: 1 };

function applyTypography(t, persist) {
  state.typography = { ...TYPO_DEFAULT, ...(t || {}) };
  const rs = document.documentElement.style;
  rs.setProperty('--doc-font-size', state.typography.size + 'px');
  rs.setProperty('--doc-line-height', String(state.typography.lineHeight));
  rs.setProperty('--doc-para-space', String(state.typography.paraSpace));
  if (persist) api.setConfig({ typography: state.typography });
}

function syncTypoSliders() {
  const t = state.typography;
  $('#typo-size').value = t.size;
  $('#typo-lh').value = t.lineHeight;
  $('#typo-ps').value = t.paraSpace;
  $('#typo-size-val').textContent = t.size + 'px';
  $('#typo-lh-val').textContent = t.lineHeight.toFixed(2);
  $('#typo-ps-val').textContent = t.paraSpace.toFixed(1);
}

function openTypoPanel() {
  syncTypoSliders();
  $('#typo-modal').hidden = false;
}

function bindTypo() {
  const modal = $('#typo-modal');
  const read = () => ({
    size: Number($('#typo-size').value),
    lineHeight: Number($('#typo-lh').value),
    paraSpace: Number($('#typo-ps').value),
  });
  for (const id of ['typo-size', 'typo-lh', 'typo-ps']) {
    $('#' + id).addEventListener('input', () => {
      applyTypography(read(), true);
      syncTypoSliders();
    });
  }
  $('#typo-reset').addEventListener('click', () => {
    applyTypography({ ...TYPO_DEFAULT }, true);
    syncTypoSliders();
  });
  $('#typo-close').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.hidden = true; });
  modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.hidden = true; });
}

function applySidebar(show, persist) {
  state.sidebar = show;
  document.body.classList.toggle('sidebar-hidden', !show);
  if (persist) api.setConfig({ sidebar: show });
}

/* ---------- 侧栏文件树 ---------- */

const fileTreeEl = $('#file-tree');
let sidebarTab = 'toc';
let treeRoot = null;
let treeSeq = 0;

function setSidebarTab(tab, persist = true) {
  sidebarTab = tab;
  $('#tab-toc').classList.toggle('active', tab === 'toc');
  $('#tab-files').classList.toggle('active', tab === 'files');
  tocEl.hidden = tab !== 'toc';
  fileTreeEl.hidden = tab !== 'files';
  if (tab === 'files') renderTreeRoot();
  if (persist) api.setConfig({ sidebarTab: tab });
}

async function renderTreeRoot() {
  const seq = ++treeSeq;
  fileTreeEl.innerHTML = '';
  treeRoot = state.dir;
  if (!state.dir) {
    const hint = document.createElement('div');
    hint.className = 'tree-hint';
    hint.textContent = '打开文件后显示其所在目录';
    fileTreeEl.append(hint);
    return;
  }
  const head = document.createElement('div');
  head.className = 'tree-root';
  head.textContent = api.basename(state.dir) || state.dir;
  head.title = state.dir;
  fileTreeEl.append(head);
  const list = await buildTreeList(state.dir, 0);
  if (seq !== treeSeq) return;
  fileTreeEl.append(list);
}

async function buildTreeList(dir, depth) {
  const box = document.createElement('div');
  box.className = 'tree-list';
  const { dirs, files } = await api.readDir(dir);
  for (const name of dirs) {
    const row = document.createElement('div');
    row.className = 'tree-row tree-dir';
    row.style.paddingLeft = 8 + depth * 14 + 'px';
    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow';
    arrow.textContent = '▶';
    const label = document.createElement('span');
    label.className = 'tree-name';
    label.textContent = name;
    row.append(arrow, label);
    let childBox = null;
    let open = false;
    row.addEventListener('click', async () => {
      open = !open;
      arrow.textContent = open ? '▼' : '▶';
      if (open && !childBox) {
        childBox = await buildTreeList(api.resolvePath(dir, name), depth + 1);
        if (row.isConnected) row.after(childBox);
      } else if (childBox) {
        childBox.hidden = !open;
      }
    });
    box.append(row);
  }
  for (const name of files) {
    const full = api.resolvePath(dir, name);
    const row = document.createElement('div');
    row.className = 'tree-row tree-file';
    row.style.paddingLeft = 8 + depth * 14 + 15 + 'px';
    row.title = full;
    const label = document.createElement('span');
    label.className = 'tree-name';
    label.textContent = name;
    row.append(label);
    row.classList.toggle('active', full === state.path);
    row.addEventListener('click', () => api.openPath(full));
    box.append(row);
  }
  if (!dirs.length && !files.length) {
    const empty = document.createElement('div');
    empty.className = 'tree-hint';
    empty.style.paddingLeft = 8 + depth * 14 + 'px';
    empty.textContent = '（空目录）';
    box.append(empty);
  }
  return box;
}

function refreshTreeActive() {
  if (sidebarTab !== 'files') return;
  if (state.dir !== treeRoot) { renderTreeRoot(); return; }
  fileTreeEl.querySelectorAll('.tree-file').forEach((row) => {
    row.classList.toggle('active', row.title === state.path);
  });
}

function updateZoomLabel() {
  $('#zoom-level').textContent = Math.round(100 * Math.pow(1.2, state.zoom)) + '%';
}

function zoomBy(delta) {
  api.setZoom(Math.max(-3, Math.min(4, Math.round((state.zoom + delta) * 2) / 2)));
}

/* ---------- 搜索 / 替换 ---------- */

const replaceInput = $('#replace-input');
const hlAll = new Highlight();
const hlActive = new Highlight();
CSS.highlights.set('mv-find', hlAll);
CSS.highlights.set('mv-find-active', hlActive);
let findMatches = [];
let findIdx = -1;
let caseSensitive = false;
let srcFindPos = 0;

function collectMatches() {
  findMatches = [];
  hlAll.clear();
  hlActive.clear();
  const q = searchInput.value;
  if (!q || state.edit) return;
  const needle = caseSensitive ? q : q.toLowerCase();
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest('button, textarea, svg, .mermaid-block, .katex, .katex-display, pre code.language-mermaid')) return NodeFilter.FILTER_REJECT;
      return n.textContent.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node;
  while ((node = walker.nextNode())) {
    const hay = caseSensitive ? node.textContent : node.textContent.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + q.length);
      findMatches.push({ range: r, node, start: i, end: i + q.length });
      hlAll.add(r);
      i = hay.indexOf(needle, i + q.length);
    }
  }
}

function setActiveMatch(idx) {
  if (!findMatches.length) {
    findIdx = -1;
    searchCount.textContent = searchInput.value ? '无结果' : '';
    searchCount.classList.toggle('no-match', Boolean(searchInput.value));
    return;
  }
  findIdx = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
  hlActive.clear();
  hlActive.add(findMatches[findIdx].range);
  searchCount.textContent = `${findIdx + 1}/${findMatches.length}`;
  searchCount.classList.remove('no-match');
  const rect = findMatches[findIdx].range.getBoundingClientRect();
  const sc = scrollEl.getBoundingClientRect();
  if (rect.top < sc.top + 40 || rect.bottom > sc.bottom - 40) {
    scrollEl.scrollTo({ top: scrollEl.scrollTop + rect.top - sc.top - sc.height / 2, behavior: 'smooth' });
  }
}

function refreshFind() {
  collectMatches();
  setActiveMatch(0);
}

function runFind(opts) {
  if (state.edit) api.find(searchInput.value, { ...opts, matchCase: caseSensitive });
  else if (opts && opts.findNext) setActiveMatch(findIdx + (opts.forward ? 1 : -1));
  else refreshFind();
}

function openSearch() {
  const sel = document.getSelection();
  if (sel.rangeCount && !sel.isCollapsed && contentEl.contains(sel.anchorNode)) {
    const t = sel.toString();
    if (t && !t.includes('\n') && t.length <= 80) searchInput.value = t;
  }
  searchBar.hidden = false;
  searchOpen = true;
  searchInput.focus();
  searchInput.select();
  srcFindPos = 0;
  if (searchInput.value) runFind({});
}

function closeSearch() {
  searchBar.hidden = true;
  searchOpen = false;
  searchCount.textContent = '';
  findMatches = [];
  findIdx = -1;
  hlAll.clear();
  hlActive.clear();
  api.stopFind();
}

function matchIndexOf(hay, needle, from) {
  return caseSensitive ? hay.indexOf(needle, from) : hay.toLowerCase().indexOf(needle.toLowerCase(), from);
}

function countOccurrences(hay, needle) {
  let n = 0;
  let i = matchIndexOf(hay, needle, 0);
  while (i !== -1) { n++; i = matchIndexOf(hay, needle, i + needle.length); }
  return n;
}

function replaceAllInText(hay, q, repl) {
  let out = '';
  let rest = hay;
  let at = matchIndexOf(rest, q, 0);
  while (at !== -1) {
    out += rest.slice(0, at) + repl;
    rest = rest.slice(at + q.length);
    at = matchIndexOf(rest, q, 0);
  }
  return out + rest;
}

function replaceInRawBlock(m, repl) {
  const blkEl = m.node.parentElement.closest('[data-blk]');
  const blk = state.blocks[Number(blkEl.dataset.blk)];
  const lines = state.raw.split('\n');
  const seg = lines.slice(blk.start, blk.end).join('\n');
  const at = matchIndexOf(seg, m.node.textContent.slice(m.start, m.end), 0);
  if (at === -1) return false;
  const next = seg.slice(0, at) + repl + seg.slice(at + (m.end - m.start));
  lines.splice(blk.start, blk.end - blk.start, ...next.split('\n'));
  state.raw = lines.join('\n');
  return true;
}

function replaceCurrent() {
  const q = searchInput.value;
  if (!q) return;
  const repl = replaceInput.value;
  if (state.edit) {
    let at = matchIndexOf(editor.value, q, srcFindPos);
    if (at === -1) at = matchIndexOf(editor.value, q, 0);
    if (at === -1) { toast('无匹配可替换'); return; }
    pushUndo();
    editor.setRangeText(repl, at, at + q.length, 'end');
    srcFindPos = at + repl.length;
    editor.focus();
    onEditorInput();
    return;
  }
  if (!findMatches.length) { toast('无匹配可替换'); return; }
  const m = findMatches[findIdx];
  pushUndo();
  if (m.node.parentElement.closest('pre')) {
    if (!replaceInRawBlock(m, repl)) { toast('无匹配可替换'); return; }
    saveCurrent();
    renderMarkdown(state.raw, { preserve: true });
  } else {
    const tail = m.node.splitText(m.start);
    tail.splitText(m.end - m.start);
    tail.textContent = repl;
    syncNow();
    saveCurrent();
    updateStats();
  }
  state.pendingMutation = false;
  refreshFind();
  toast('已替换 1 处');
}

function replaceAll() {
  const q = searchInput.value;
  if (!q) return;
  const repl = replaceInput.value;
  if (state.edit) {
    const n = countOccurrences(editor.value, q);
    if (!n) { toast('无匹配可替换'); return; }
    pushUndo();
    editor.value = replaceAllInText(editor.value, q, repl);
    srcFindPos = 0;
    onEditorInput();
    toast(`已替换 ${n} 处`);
    return;
  }
  if (!findMatches.length) { toast('无匹配可替换'); return; }
  const n = findMatches.length;
  pushUndo();
  const byNode = new Map();
  const preBlocks = new Set();
  for (const m of findMatches) {
    if (m.node.parentElement.closest('pre')) { preBlocks.add(m.node.parentElement.closest('[data-blk]')); continue; }
    if (!byNode.has(m.node)) byNode.set(m.node, []);
    byNode.get(m.node).push(m);
  }
  for (const [node, ms] of byNode) {
    ms.sort((a, b) => b.start - a.start);
    for (const m of ms) {
      const tail = node.splitText(m.start);
      tail.splitText(m.end - m.start);
      tail.textContent = repl;
    }
  }
  syncNow();
  for (const blkEl of preBlocks) {
    const blk = state.blocks[Number(blkEl.dataset.blk)];
    const lines = state.raw.split('\n');
    const seg = lines.slice(blk.start, blk.end).join('\n');
    const out = replaceAllInText(seg, q, repl);
    lines.splice(blk.start, blk.end - blk.start, ...out.split('\n'));
    state.raw = lines.join('\n');
  }
  saveCurrent();
  updateStats();
  renderMarkdown(state.raw, { preserve: true });
  state.pendingMutation = false;
  toast(`已替换 ${n} 处`);
}

function bindSearch() {
  $('#btn-search').addEventListener('click', openSearch);
  $('#btn-search-close').addEventListener('click', closeSearch);
  $('#btn-search-case').addEventListener('click', () => {
    caseSensitive = !caseSensitive;
    $('#btn-search-case').classList.toggle('active', caseSensitive);
    srcFindPos = 0;
    if (searchInput.value) runFind({});
  });
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      srcFindPos = 0;
      const v = searchInput.value;
      if (v) runFind({});
      else {
        api.stopFind();
        findMatches = [];
        hlAll.clear();
        hlActive.clear();
        searchCount.textContent = '';
      }
    }, 200);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchInput.value) runFind({ findNext: true, forward: !e.shiftKey });
    } else if (e.key === 'Escape') {
      closeSearch();
    }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
    else if (e.key === 'Escape') closeSearch();
  });
  $('#btn-search-prev').addEventListener('click', () => {
    if (searchInput.value) runFind({ findNext: true, forward: false });
  });
  $('#btn-search-next').addEventListener('click', () => {
    if (searchInput.value) runFind({ findNext: true, forward: true });
  });
  $('#btn-replace').addEventListener('click', replaceCurrent);
  $('#btn-replace-all').addEventListener('click', replaceAll);
}

/* ---------- 灯箱 / 链接 / 复制 ---------- */

let lbScale = 1;
let lbX = 0;
let lbY = 0;
function lbApply() {
  const img = $('#lightbox-img');
  img.style.transform = `translate(${lbX}px, ${lbY}px) scale(${lbScale})`;
  $('#lb-zoom-label').textContent = Math.round(lbScale * 100) + '%';
}
function openLightbox(src) {
  $('#lightbox-img').src = src;
  lbScale = 1; lbX = 0; lbY = 0;
  lbApply();
  lightbox.hidden = false;
}
function closeLightbox() {
  lightbox.hidden = true;
  $('#lightbox-img').removeAttribute('src');
}
function bindLightbox() {
  $('#lb-in').addEventListener('click', (e) => { e.stopPropagation(); lbScale = Math.min(8, lbScale * 1.25); lbApply(); });
  $('#lb-out').addEventListener('click', (e) => { e.stopPropagation(); lbScale = Math.max(0.2, lbScale / 1.25); lbApply(); });
  $('#lb-reset').addEventListener('click', (e) => { e.stopPropagation(); lbScale = 1; lbX = 0; lbY = 0; lbApply(); });
  lightbox.addEventListener('wheel', (e) => {
    e.preventDefault();
    lbScale = Math.max(0.2, Math.min(8, lbScale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    lbApply();
  }, { passive: false });
  let panning = null;
  lightbox.addEventListener('mousedown', (e) => {
    if (e.target.closest('#lightbox-bar')) return;
    panning = { x: e.clientX - lbX, y: e.clientY - lbY };
  });
  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    lbX = e.clientX - panning.x;
    lbY = e.clientY - panning.y;
    lbApply();
  });
  window.addEventListener('mouseup', () => { panning = null; });
}

/* ---------- 粘贴图片 / 纯文本 ---------- */

async function onPaste(e) {
  const cd = e.clipboardData;
  if (!cd) return;
  let imgFile = null;
  if (cd.files && cd.files.length) imgFile = [...cd.files].find((f) => f.type.startsWith('image/'));
  if (!imgFile && cd.items) {
    for (const it of cd.items) {
      if (it.type && it.type.startsWith('image/')) { imgFile = it.getAsFile(); break; }
    }
  }
  if (imgFile) {
    e.preventDefault();
    state.pendingMutation = true;
    await state.renderChain;
    const bytes = new Uint8Array(await imgFile.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    const ext = (imgFile.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const res = await api.savePaste({ b64: btoa(bin), ext });
    if (!res || !res.rel) { toast('图片保存失败'); return; }
    const mdImg = `![pasted](${res.rel})`;
    if (state.edit && document.activeElement === editor) {
      editor.setRangeText(mdImg, editor.selectionStart, editor.selectionEnd, 'end');
      onEditorInput();
      return;
    }
    const img = document.createElement('img');
    img.src = api.toFileURL(res.abs);
    img.dataset.origSrc = res.rel;
    img.alt = 'pasted';
    img.draggable = true;
    const sel = document.getSelection();
    if (!state.edit && sel.rangeCount && contentEl.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0);
      r.collapse(false);
      r.insertNode(img);
      commitLive();
    } else {
      const p = document.createElement('p');
      p.append(img);
      contentEl.append(p);
      commitLive();
      toast('图片已保存到 assets 并插入文末');
    }
    return;
  }
  if (state.edit || state.editing || contentEl.contains(e.target)) {
    e.preventDefault();
    document.execCommand('insertText', false, cd.getData('text/plain'));
  }
}

/* ---------- 图片块拖拽排序 ---------- */

let dragBlockIdx = -1;
function bindBlockDrag() {
  contentEl.addEventListener('dragstart', (e) => {
    const img = e.target.closest('img');
    if (!img || state.edit) return;
    const blkEl = img.closest('[data-blk]');
    if (!blkEl) return;
    dragBlockIdx = Number(blkEl.dataset.blk);
    e.dataTransfer.setData('text/x-markview-block', String(dragBlockIdx));
    e.dataTransfer.effectAllowed = 'move';
  });
  contentEl.addEventListener('dragover', (e) => {
    if (dragBlockIdx < 0) return;
    const blkEl = e.target.closest('[data-blk]');
    if (!blkEl) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    contentEl.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
    blkEl.classList.add('drop-target');
  });
  contentEl.addEventListener('dragleave', (e) => {
    const blkEl = e.target.closest('[data-blk]');
    if (blkEl) blkEl.classList.remove('drop-target');
  });
  contentEl.addEventListener('drop', (e) => {
    if (dragBlockIdx < 0) return;
    const blkEl = e.target.closest('[data-blk]');
    e.preventDefault();
    contentEl.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
    const to = blkEl ? Number(blkEl.dataset.blk) : -1;
    const from = dragBlockIdx;
    dragBlockIdx = -1;
    if (to < 0 || to === from) return;
    moveBlock(from, to);
  });
  contentEl.addEventListener('dragend', () => {
    dragBlockIdx = -1;
    contentEl.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  });
}
function moveBlock(from, to) {
  const a = state.blocks[from] && state.blocks[from].el;
  const b = state.blocks[to] && state.blocks[to].el;
  if (!a || !b || a === b) return;
  if (from < to) b.after(a);
  else b.before(a);
  commitLive();
  toast('已移动图片块，Ctrl+Z 可撤销');
}

/* ---------- 表格工具：右键菜单 / 拖拽宽高 / 配置 ---------- */

let tableMenu = null;
function closeTableMenu() {
  if (tableMenu) { tableMenu.remove(); tableMenu = null; }
}
function readCfgFromDom(wrap) {
  const rows = [...wrap.querySelectorAll('tr')];
  const cols = rows[0] ? [...rows[0].children].map((c) => ({
    w: parseFloat(c.style.width) || undefined,
    align: c.style.textAlign || undefined,
  })) : [];
  const rr = rows.map((tr) => ({ h: parseFloat(tr.style.height) || undefined }));
  return { cols, rows: rr };
}
function insertRow(wrap, at) {
  const rows = [...wrap.querySelectorAll('tr')];
  const ref = rows[0];
  if (!ref) return;
  const tr = document.createElement('tr');
  const isHead = at === 0 && ref.parentElement.tagName === 'THEAD';
  for (let i = 0; i < ref.children.length; i++) {
    const cell = document.createElement(isHead ? 'th' : 'td');
    cell.textContent = '';
    tr.append(cell);
  }
  if (at >= rows.length) {
    (wrap.querySelector('tbody') || wrap.querySelector('table')).append(tr);
  } else {
    rows[at].parentElement.insertBefore(tr, rows[at]);
  }
}
function insertCol(wrap, at) {
  wrap.querySelectorAll('tr').forEach((tr) => {
    const cell = document.createElement(tr.parentElement.tagName === 'THEAD' ? 'th' : 'td');
    cell.textContent = '';
    if (at >= tr.children.length) tr.append(cell);
    else tr.insertBefore(cell, tr.children[at]);
  });
}
function removeRow(wrap, at) {
  const rows = [...wrap.querySelectorAll('tr')];
  if (rows.length <= 1) { toast('至少保留一行'); return; }
  rows[at].remove();
}
function removeCol(wrap, at) {
  const rows = [...wrap.querySelectorAll('tr')];
  if (!rows[0] || rows[0].children.length <= 1) { toast('至少保留一列'); return; }
  rows.forEach((tr) => { if (tr.children[at]) tr.children[at].remove(); });
}
function openTableDialog(wrap) {
  closeLinkModal();
  let cfg = null;
  try { cfg = wrap.dataset.cfg ? JSON.parse(wrap.dataset.cfg) : null; } catch {}
  if (!cfg) cfg = readCfgFromDom(wrap);
  const rows = [...wrap.querySelectorAll('tr')];
  const colCount = rows[0] ? rows[0].children.length : 0;
  const modal = document.createElement('div');
  modal.className = 'link-modal';
  const card = document.createElement('div');
  card.className = 'link-card';
  card.style.width = '520px';
  card.style.maxHeight = '80vh';
  card.style.overflowY = 'auto';
  const title = document.createElement('h3');
  title.textContent = '表格配置';
  card.append(title);
  const colInputs = [];
  for (let i = 0; i < colCount; i++) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    const lab = document.createElement('label');
    lab.textContent = '列' + (i + 1);
    lab.style.width = '44px';
    const w = document.createElement('input');
    w.type = 'number';
    w.min = '40';
    w.placeholder = '宽(px)';
    w.style.width = '90px';
    w.value = (cfg.cols && cfg.cols[i] && cfg.cols[i].w) || '';
    const al = document.createElement('select');
    al.style.flex = '1';
    for (const [v, t] of [['', '默认对齐'], ['left', '左对齐'], ['center', '居中'], ['right', '右对齐']]) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      al.append(o);
    }
    al.value = (cfg.cols && cfg.cols[i] && cfg.cols[i].align) || '';
    row.append(lab, w, al);
    card.append(row);
    colInputs.push({ w, al });
  }
  const rowInputs = [];
  rows.forEach((tr, i) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    const lab = document.createElement('label');
    lab.textContent = '行' + (i + 1);
    lab.style.width = '44px';
    const h = document.createElement('input');
    h.type = 'number';
    h.min = '24';
    h.placeholder = '高(px)';
    h.style.width = '90px';
    h.value = (cfg.rows && cfg.rows[i] && cfg.rows[i].h) || '';
    row.append(lab, h);
    card.append(row);
    rowInputs.push(h);
  });
  const hint = document.createElement('div');
  hint.className = 'link-err';
  hint.style.color = 'var(--fg-muted)';
  hint.textContent = '留空表示自动；也可直接拖拽表格边线调整';
  card.append(hint);
  const btns = document.createElement('div');
  btns.className = 'link-btns';
  const cancel = document.createElement('button');
  cancel.textContent = '取消';
  const apply = document.createElement('button');
  apply.textContent = '应用';
  apply.className = 'primary';
  apply.addEventListener('click', () => {
    const next = {
      cols: colInputs.map(({ w, al }) => ({
        w: w.value ? Math.max(40, Number(w.value)) : undefined,
        align: al.value || undefined,
      })),
      rows: rowInputs.map((h) => ({ h: h.value ? Math.max(24, Number(h.value)) : undefined })),
    };
    wrap.dataset.cfg = JSON.stringify(next);
    commitBlockOf(wrap);
    closeLinkModal();
  });
  cancel.addEventListener('click', closeLinkModal);
  btns.append(cancel, apply);
  card.append(btns);
  modal.append(card);
  modal.addEventListener('mousedown', (ev) => { if (ev.target === modal) closeLinkModal(); });
  card.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeLinkModal(); });
  document.body.append(modal);
  linkModal = modal;
}
function bindTableTools() {
  contentEl.addEventListener('contextmenu', (e) => {
    if (state.edit) return;
    const cell = e.target.closest('td, th');
    if (!cell) return;
    e.preventDefault();
    closeTableMenu();
    const wrap = cell.closest('.table-wrap');
    const tr = cell.parentElement;
    const colIdx = [...tr.children].indexOf(cell);
    const rowIdx = [...wrap.querySelectorAll('tr')].indexOf(tr);
    const menu = document.createElement('div');
    menu.className = 'table-menu';
    const items = [
      ['在上方插入行', () => insertRow(wrap, rowIdx)],
      ['在下方插入行', () => insertRow(wrap, rowIdx + 1)],
      ['在左侧插入列', () => insertCol(wrap, colIdx)],
      ['在右侧插入列', () => insertCol(wrap, colIdx + 1)],
      ['sep', null],
      ['删除本行', () => removeRow(wrap, rowIdx)],
      ['删除本列', () => removeCol(wrap, colIdx)],
    ];
    for (const [label, fn] of items) {
      if (label === 'sep') {
        const s = document.createElement('div');
        s.className = 'sep';
        menu.append(s);
        continue;
      }
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        fn();
        closeTableMenu();
        commitBlockOf(wrap);
      });
      menu.append(b);
    }
    document.body.append(menu);
    menu.style.left = Math.min(e.clientX, window.innerWidth - 190) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 250) + 'px';
    tableMenu = menu;
  });
  document.addEventListener('mousedown', (e) => {
    if (tableMenu && !e.target.closest('.table-menu')) closeTableMenu();
  });

  let resize = null;
  contentEl.addEventListener('mousedown', (e) => {
    if (state.edit || e.button !== 0) return;
    const cell = e.target.closest('td, th');
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    const wrap = cell.closest('.table-wrap');
    const tr = cell.parentElement;
    const table = wrap.querySelector('table');
    if (Math.abs(e.clientX - r.right) < 6) {
      resize = { kind: 'col', wrap, idx: [...tr.children].indexOf(cell), startX: e.clientX, startW: r.width };
      table.classList.add('resizing');
      e.preventDefault();
      e.stopPropagation();
    } else if (Math.abs(e.clientY - r.bottom) < 6) {
      resize = { kind: 'row', wrap, idx: [...wrap.querySelectorAll('tr')].indexOf(tr), startY: e.clientY, startH: r.height };
      table.classList.add('resizing-row');
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  window.addEventListener('mousemove', (e) => {
    if (resize) {
      const table = resize.wrap.querySelector('table');
      if (resize.kind === 'col') {
        const w = Math.max(40, resize.startW + (e.clientX - resize.startX));
        table.querySelectorAll('tr').forEach((tr) => {
          const c = tr.children[resize.idx];
          if (c) c.style.width = w + 'px';
        });
        table.style.tableLayout = 'fixed';
      } else {
        const h = Math.max(24, resize.startH + (e.clientY - resize.startY));
        const tr = table.querySelectorAll('tr')[resize.idx];
        if (tr) tr.style.height = h + 'px';
      }
      return;
    }
    const cell = e.target.closest && e.target.closest('td, th');
    if (cell && !state.edit) {
      const r = cell.getBoundingClientRect();
      cell.style.cursor = Math.abs(e.clientX - r.right) < 6 ? 'col-resize'
        : Math.abs(e.clientY - r.bottom) < 6 ? 'row-resize' : '';
    }
  });
  window.addEventListener('mouseup', () => {
    if (!resize) return;
    const { wrap } = resize;
    wrap.querySelector('table').classList.remove('resizing', 'resizing-row');
    wrap.dataset.cfg = JSON.stringify(readCfgFromDom(wrap));
    resize = null;
    commitBlockOf(wrap);
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function handleLink(a, e) {
  const href = a.getAttribute('href') || '';
  if (href.startsWith('#')) {
    e.preventDefault();
    let id = href.slice(1);
    try { id = decodeURIComponent(id); } catch {}
    scrollToHeading(id);
    return;
  }
  if (/^https?:/i.test(href)) {
    e.preventDefault();
    api.openExternal(href);
    return;
  }
  if (/^(mailto:|javascript:|data:)/i.test(href)) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  if (!state.dir) return;
  const clean = href.split('#')[0];
  if (!clean) return;
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch {}
  const abs = api.resolvePath(state.dir, decoded);
  if (MD_EXTS.includes(api.extname(abs).toLowerCase())) api.openPath(abs);
  else api.openLocal(abs);
}

/* ---------- 阅读视图原位编辑 ---------- */

function tagBlocks() {
  const rawTokens = md.parse(state.raw, {}).filter((t) => t.level === 0 && t.map);
  const lines = state.raw.split('\n');
  state.blocks = [];
  const children = [...contentEl.children];
  let domIdx = 0;
  for (const t of rawTokens) {
    if (t.hidden) {
      if (t.type === 'table_config' && state.blocks.length) {
        const b = state.blocks[state.blocks.length - 1];
        b.end = t.map[1];
        while (b.end > b.start && lines[b.end - 1] === '') b.end--;
        b.el.dataset.src = lines.slice(b.start, b.end).join('\n');
      }
      continue;
    }
    if (!(t.nesting === 1 || t.nesting === 0)) continue;
    const el = children[domIdx++];
    if (!el) continue;
    el.dataset.blk = state.blocks.length;
    const blk = { el, start: t.map[0], end: t.map[1], type: t.type };
    while (blk.end > blk.start && lines[blk.end - 1] === '') blk.end--;
    el.dataset.src = lines.slice(blk.start, blk.end).join('\n');
    if (t.type === 'table_open' && t.meta && t.meta.cfg) {
      blk.cfg = t.meta.cfg;
      el.dataset.cfg = JSON.stringify(t.meta.cfg);
    }
    state.blocks.push(blk);
  }
  state.gaps = state.blocks.map((b, i) => {
    const nextStart = i + 1 < state.blocks.length ? state.blocks[i + 1].start : lines.length;
    const gapLines = lines.slice(b.end, nextStart);
    return gapLines.length ? gapLines.join('\n') : null;
  });
  state.blocks.forEach((b) => {
    const src = lines.slice(b.start, b.end).join('\n');
    const labels = (src.match(/\[\^([^\]]+)\]/g) || []).map((s) => s.slice(2, -1));
    b.el.querySelectorAll('sup.footnote-ref').forEach((s, i) => {
      s.dataset.label = labels[i] || String(i + 1);
    });
    const inlineTex = (src.match(/\$([^$\n]+)\$/g) || []).map((s) => s.slice(1, -1));
    b.el.querySelectorAll('span.katex').forEach((s, i) => {
      if (!s.closest('.katex-display')) s.dataset.tex = inlineTex[i] || '';
    });
    const dispTex = (src.match(/\$\$([\s\S]*?)\$\$/g) || []).map((s) => s.slice(2, -2).trim());
    b.el.querySelectorAll('.katex-display').forEach((s, i) => {
      s.dataset.tex = dispTex[i] || '';
    });
  });
  contentEl.querySelectorAll('.task-list-item-checkbox').forEach((i) => { i.disabled = false; });
  contentEl.querySelectorAll('a').forEach((x) => { x.title = '点击编辑链接'; });
  setReadEditable();
}

function serChildren(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) out += n.textContent.replace(/([\\`*_\[\]])/g, '\\$1');
    else if (n.nodeType === 1) out += serInlineEl(n);
  }
  return out;
}

function serInlineEl(n) {
  const t = n.tagName;
  if (t === 'BR') return '  \n';
  if (t === 'DIV') return '  \n' + serChildren(n);
  if (t === 'BUTTON' || t === 'TEXTAREA' || t === 'INPUT') return '';
  if (t === 'SPAN' && n.dataset.color) return '{' + n.dataset.color + '}(' + serChildren(n) + ')';
  if (t === 'STRONG' || t === 'B') return '**' + serChildren(n) + '**';
  if (t === 'EM' || t === 'I') return '*' + serChildren(n) + '*';
  if (t === 'DEL' || t === 'S') return '~~' + serChildren(n) + '~~';
  if (t === 'CODE') return '`' + n.textContent + '`';
  if (t === 'A') {
    const href = n.getAttribute('href');
    if (n.textContent === href && /^https?:/i.test(href)) return n.textContent;
    return '[' + serChildren(n) + '](' + href + ')';
  }
  if (t === 'SUP' && n.classList.contains('footnote-ref')) return '[^' + (n.dataset.label || '1') + ']';
  if (n.classList.contains('katex-display')) return '$$\n' + (n.dataset.tex || '') + '\n$$';
  if (n.classList.contains('katex')) return '$' + (n.dataset.tex || '') + '$';
  if (t === 'IMG') return '![' + (n.getAttribute('alt') || '') + '](' + (n.dataset.origSrc || n.getAttribute('src')) + ')';
  return serChildren(n);
}

function inlineSer(node) {
  if (node.nodeType === 3) return node.textContent.replace(/([\\`*_\[\]])/g, '\\$1');
  if (node.nodeType !== 1) return '';
  const t = node.tagName;
  const isInline = t === 'BR' || t === 'DIV' || t === 'BUTTON' || t === 'TEXTAREA' || t === 'INPUT' ||
    t === 'STRONG' || t === 'B' || t === 'EM' || t === 'I' || t === 'DEL' || t === 'S' || t === 'CODE' ||
    t === 'A' || t === 'IMG' ||
    (t === 'SPAN' && (node.dataset.color || node.classList.contains('katex') || node.classList.contains('katex-display'))) ||
    (t === 'SUP' && node.classList.contains('footnote-ref'));
  return isInline ? serInlineEl(node) : serChildren(node);
}

function listSer(list, indent) {
  const ordered = list.tagName === 'OL';
  const lines = [];
  let i = 1;
  for (const li of list.children) {
    if (li.tagName !== 'LI') continue;
    const cb = li.querySelector('input.task-list-item-checkbox');
    const marker = cb ? `- [${cb.checked ? 'x' : ' '}] ` : ordered ? `${i}. ` : '- ';
    let content = '';
    const nested = [];
    for (const n of li.childNodes) {
      if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) nested.push(n);
      else if (n.nodeType === 1 && n.tagName === 'INPUT') continue;
      else content += inlineSer(n);
    }
    lines.push(' '.repeat(indent) + marker + content.trim());
    for (const nl of nested) lines.push(...listSer(nl, indent + marker.length));
    i++;
  }
  return lines;
}

function quoteSer(bq, depth) {
  const prefix = '> '.repeat(depth);
  const lines = [];
  [...bq.children].forEach((n, i) => {
    if (i) lines.push(prefix.trim());
    if (n.tagName === 'BLOCKQUOTE') lines.push(...quoteSer(n, depth + 1));
    else lines.push(prefix + inlineSer(n).trim());
  });
  return lines;
}

function tableSer(wrap, srcSlice) {
  const lines = [];
  const rows = [...wrap.querySelectorAll('tr')];
  rows.forEach((tr, idx) => {
    const cells = [...tr.children].map((c) => inlineSer(c).trim().replace(/\|/g, '\\|'));
    lines.push('| ' + cells.join(' | ') + ' |');
    if (idx === 0) lines.push(srcSlice.split('\n')[1] || '| --- | --- | --- |');
  });
  let cfg = null;
  try { cfg = wrap.dataset.cfg ? JSON.parse(wrap.dataset.cfg) : null; } catch {}
  const srcCfgLine = srcSlice.split('\n').find((l) => /^\{:table/.test(l));
  if (cfg) {
    const colCount = rows[0] ? rows[0].children.length : 0;
    cfg.cols = cfg.cols || [];
    while (cfg.cols.length < colCount) cfg.cols.push({});
    cfg.cols.length = colCount;
    cfg.rows = cfg.rows || [];
    while (cfg.rows.length < rows.length) cfg.rows.push({});
    cfg.rows.length = rows.length;
    lines.push('{:table ' + JSON.stringify(cfg) + '}');
  } else if (srcCfgLine) {
    lines.push(srcCfgLine);
  }
  return lines;
}

function blockSer(el, blk) {
  const srcLines = state.raw.split('\n').slice(blk.start, blk.end);
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) return ['#'.repeat(Number(tag[1])) + ' ' + inlineSer(el).trim()];
  if (tag === 'BLOCKQUOTE') return quoteSer(el, 1);
  if (tag === 'UL' || tag === 'OL') return listSer(el, 0);
  if (el.classList.contains('table-wrap')) return tableSer(el, srcLines.join('\n'));
  if (tag === 'HR') return [];
  if (el.classList.contains('code-block') || el.classList.contains('mermaid-block') || el.querySelector('.katex-display')) {
    const ta = el.querySelector('textarea.block-overlay');
    const inner = ta ? ta.value : srcLines.slice(1, -1).join('\n');
    if (el.querySelector('.katex-display')) return ['$$', ...inner.split('\n'), '$$'];
    return [srcLines[0], ...inner.split('\n'), srcLines[srcLines.length - 1]];
  }
  return [inlineSer(el).trim()];
}

/* ---------- 整篇实时序列化（阅读视图 = 直接编辑源码） ---------- */

function serializeDoc(root) {
  const out = [];
  for (const el of root.children) {
    const ser = serializeBlockEl(el);
    if (ser === null) continue;
    out.push(ser);
    const gap = state.gaps[Number(el.dataset.blk)];
    if (gap !== undefined && gap !== null) out.push(gap);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function serializeBlockEl(el) {
  if (el.classList.contains('footnotes') || el.classList.contains('footnotes-sep') || el.classList.contains('empty-note')) return null;
  if (el.tagName === 'HR') return '---';
  const blk = state.blocks[Number(el.dataset.blk)] || { start: 0, end: 0 };
  if (el.tagName === 'PRE') return state.raw.split('\n').slice(blk.start, blk.end).join('\n');
  return blockSer(el, blk).join('\n');
}

function caretSnapshot() {
  const sel = document.getSelection();
  if (!sel.rangeCount || !contentEl.contains(sel.anchorNode)) return null;
  const anchorEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  const blockEl = anchorEl && anchorEl.closest('[data-blk]');
  if (!blockEl) return null;
  const idx = [...contentEl.children].indexOf(blockEl);
  const r = document.createRange();
  r.selectNodeContents(blockEl);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  return { idx, offset: r.toString().length };
}

function caretRestore(snap) {
  if (!snap) return;
  const blockEl = contentEl.children[snap.idx];
  if (!blockEl) return;
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let remaining = snap.offset;
  let node;
  while ((node = walker.nextNode())) {
    if (remaining <= node.textContent.length) {
      const sel = document.getSelection();
      const r = document.createRange();
      r.setStart(node, remaining);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    remaining -= node.textContent.length;
  }
}

let lastSelSnap = null;

function snapshotRange(range) {
  const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const blockEl = startEl && startEl.closest('[data-blk]');
  if (!blockEl || !contentEl.contains(blockEl) || !blockEl.contains(range.endContainer)) return null;
  const idx = [...contentEl.children].indexOf(blockEl);
  const pre = document.createRange();
  pre.selectNodeContents(blockEl);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const text = range.toString();
  return { idx, start, end: start + text.length, text };
}

function restoreRange(snap) {
  if (!snap) return null;
  const blockEl = contentEl.children[snap.idx];
  if (!blockEl) return null;
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode = null;
  let startOff = 0;
  let endNode = null;
  let endOff = 0;
  let node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (!startNode && snap.start <= pos + len) { startNode = node; startOff = snap.start - pos; }
    if (snap.end <= pos + len) { endNode = node; endOff = snap.end - pos; break; }
    pos += len;
  }
  if (!startNode || !endNode) return null;
  const r = document.createRange();
  r.setStart(startNode, startOff);
  r.setEnd(endNode, endOff);
  return r.toString() === snap.text ? r : null;
}

function getActiveRange() {
  const sel = document.getSelection();
  if (sel.rangeCount && !sel.isCollapsed) {
    const r = sel.getRangeAt(0);
    const startEl = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const blk = startEl && startEl.closest('[data-blk]');
    if (blk && contentEl.contains(blk) && blk.contains(r.endContainer)) return r;
  }
  return restoreRange(lastSelSnap);
}

function trackSelection() {
  const sel = document.getSelection();
  if (!sel.rangeCount) return;
  if (!contentEl.contains(sel.anchorNode) || !contentEl.contains(sel.focusNode)) return;
  if (sel.isCollapsed) { lastSelSnap = null; }
  else {
    const snap = snapshotRange(sel.getRangeAt(0));
    if (snap) lastSelSnap = snap;
  }
  updateFocusBlock();
  typewriterScroll();
}

function syncNow() {
  clearTimeout(liveTimer);
  state.raw = serializeDoc(contentEl);
  tagBlocks();
}

async function commitLive() {
  await state.renderChain;
  pushUndo();
  syncNow();
  await saveCurrent();
  updateStats();
  state.pendingMutation = false;
}

let liveTimer = null;
function onContentInput() {
  if (state.edit) return;
  const ph = contentEl.querySelector('.empty-note');
  if (ph) {
    ph.classList.remove('empty-note');
    for (const n of [...ph.childNodes]) {
      if (n.nodeType === 3) n.textContent = n.textContent.replace('（空文件）', '');
    }
  }
  clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    await state.renderChain;
    const next = serializeDoc(contentEl);
    if (next === state.raw) return;
    const snap = caretSnapshot();
    pushUndo();
    state.raw = next;
    saveCurrent();
    updateStats();
    renderMarkdown(next, { preserve: true }).then(() => caretRestore(snap));
  }, 250);
}

function setReadEditable() {
  contentEl.contentEditable = state.edit ? 'false' : 'true';
  contentEl.querySelectorAll('.mermaid-block, .katex-display').forEach((n) => {
    n.contentEditable = 'false';
  });
}

function cleanupEditingDom(ed) {
  ed.el.contentEditable = 'false';
  ed.el.classList.remove('inline-editing');
  ed.el.style.position = '';
  ed.el.querySelectorAll('.block-overlay, .img-editor, .hr-bar').forEach((n) => n.remove());
}

function applyBlockEdit(index, ser) {
  const blk = state.blocks[index];
  pushUndo();
  const lines = state.raw.split('\n');
  const oldSeg = lines.slice(blk.start, blk.end);
  let out = ser;
  if (oldSeg.length && oldSeg[oldSeg.length - 1] === '' && out.length && out[out.length - 1] !== '') {
    out = [...out, ''];
  }
  state.raw = [...lines.slice(0, blk.start), ...out, ...lines.slice(blk.end)].join('\n');
  saveCurrent();
  if (ser.length === 0) toast('已删除整块，Ctrl+Z 可撤销');
  renderMarkdown(state.raw, { preserve: true });
}

/* ---------- 撤销 / 重做 ---------- */

const undoStack = [];
const redoStack = [];
let nativeUndoOk = false;
function pushUndo() {
  undoStack.push(state.raw);
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
  nativeUndoOk = false;
}
function undo() {
  if (state.edit && document.activeElement === editor && nativeUndoOk) {
    if (document.execCommand('undo')) return;
    nativeUndoOk = false;
  }
  if (!state.edit && document.activeElement === contentEl && nativeUndoOk) {
    if (document.execCommand('undo')) return;
    nativeUndoOk = false;
  }
  if (!undoStack.length) { toast('没有可撤销的操作'); return; }
  cancelEditing();
  redoStack.push(state.raw);
  state.raw = undoStack.pop();
  if (state.edit) editor.value = state.raw;
  saveCurrent();
  renderMarkdown(state.raw, { preserve: true });
}
function redo() {
  if (state.edit && document.activeElement === editor && nativeUndoOk) {
    if (document.execCommand('redo')) return;
    nativeUndoOk = false;
  }
  if (!state.edit && document.activeElement === contentEl && nativeUndoOk) {
    if (document.execCommand('redo')) return;
    nativeUndoOk = false;
  }
  if (!redoStack.length) { toast('没有可重做的操作'); return; }
  cancelEditing();
  undoStack.push(state.raw);
  state.raw = redoStack.pop();
  if (state.edit) editor.value = state.raw;
  saveCurrent();
  renderMarkdown(state.raw, { preserve: true });
}

function commitEditing() {
  const ed = state.editing;
  if (!ed) return;
  state.editing = null;
  const ser = blockSer(ed.el, state.blocks[ed.index]);
  cleanupEditingDom(ed);
  applyBlockEdit(ed.index, ser);
}

function cancelEditing() {
  const ed = state.editing;
  if (!ed) return;
  state.editing = null;
  cleanupEditingDom(ed);
  renderMarkdown(state.raw, { preserve: true });
}

function openOverlay(el, index) {
  const blk = state.blocks[index];
  const srcLines = state.raw.split('\n').slice(blk.start, blk.end);
  el.style.position = 'relative';
  const ta = document.createElement('textarea');
  ta.className = 'block-overlay';
  ta.spellcheck = false;
  ta.value = srcLines.slice(1, -1).join('\n');
  el.append(ta);
  ta.focus();
  state.editing = { el, index, kind: 'overlay' };
}

function openImageDialog(img, el, index) {
  closeLinkModal();
  const wrap = document.createElement('div');
  wrap.className = 'link-modal';
  const card = document.createElement('div');
  card.className = 'link-card';
  const title = document.createElement('h3');
  title.textContent = '编辑图片';
  const r1 = document.createElement('label');
  r1.textContent = '图片名称（替代文字）';
  const ti = document.createElement('input');
  ti.value = img.getAttribute('alt') || '';
  const r2 = document.createElement('label');
  r2.textContent = '图片地址（相对路径或 URL）';
  const ui = document.createElement('input');
  ui.value = img.dataset.origSrc || img.getAttribute('src') || '';
  const err = document.createElement('div');
  err.className = 'link-err';
  const btns = document.createElement('div');
  btns.className = 'link-btns';
  const pick = document.createElement('button');
  pick.textContent = '换图…';
  const zoom = document.createElement('button');
  zoom.textContent = '放大查看';
  const del = document.createElement('button');
  del.textContent = '移除图片';
  const cancel = document.createElement('button');
  cancel.textContent = '取消';
  const apply = document.createElement('button');
  apply.textContent = '应用';
  apply.className = 'primary';
  const validate = () => {
    const v = ui.value.trim();
    const ok = v.length > 0 && !/\s/.test(v) && (/^(https?:\/\/|data:image\/)/i.test(v) || /^[^\\:*?"<>|]+$/.test(v));
    err.textContent = ok ? '' : '地址不合法：需为无空格的相对路径、http(s) URL 或 data:image';
    return ok;
  };
  ui.addEventListener('input', validate);
  pick.addEventListener('click', async () => {
    const p = await api.pickImage();
    if (!p) return;
    const rel = api.relPath(state.dir, p).split('\\').join('/');
    ui.value = rel;
    img.dataset.origSrc = rel;
    img.src = api.toFileURL(p);
    validate();
  });
  zoom.addEventListener('click', () => openLightbox(img.src));
  del.addEventListener('click', () => {
    img.remove();
    commitLive();
    closeLinkModal();
  });
  apply.addEventListener('click', () => {
    if (!validate()) return;
    const v = ui.value.trim();
    img.setAttribute('alt', ti.value);
    img.dataset.origSrc = v;
    img.src = /^(https?:|data:)/i.test(v) ? v : api.toFileURL(api.resolvePath(state.dir, v));
    commitBlockOf(img);
    closeLinkModal();
  });
  cancel.addEventListener('click', closeLinkModal);
  btns.append(pick, zoom, del, cancel, apply);
  card.append(title, r1, ti, r2, ui, err, btns);
  wrap.append(card);
  wrap.addEventListener('mousedown', (ev) => { if (ev.target === wrap) closeLinkModal(); });
  card.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeLinkModal();
    if (ev.key === 'Enter') apply.click();
  });
  document.body.append(wrap);
  linkModal = wrap;
  ti.focus();
}

function openHrBar(el, index) {
  el.style.position = 'relative';
  const bar = document.createElement('div');
  bar.className = 'hr-bar';
  const del = document.createElement('button');
  del.textContent = '删除分隔线';
  del.addEventListener('click', commitEditing);
  const cancel = document.createElement('button');
  cancel.textContent = '取消';
  cancel.addEventListener('click', cancelEditing);
  bar.append(del, cancel);
  el.append(bar);
  state.editing = { el, index, kind: 'hr' };
  del.focus();
}

function onContentClick(e) {
  if (state.edit) {
    const img = e.target.closest('img');
    if (img) { openLightbox(img.src); return; }
    const a = e.target.closest('a');
    if (a) handleLink(a, e);
    return;
  }
  if (e.target.closest('.copy-btn')) return;
  const a0 = e.target.closest('a');
  if (a0) { e.preventDefault(); openLinkDialog(a0); return; }
  const cb = e.target.closest('input.task-list-item-checkbox');
  if (cb) {
    e.preventDefault();
    cb.checked = !cb.checked;
    commitLive();
    return;
  }
  const blkEl = e.target.closest('[data-blk]');
  if (!blkEl) return;
  const imgOld = e.target.closest('img');
  const isHr = blkEl.tagName === 'HR';
  const isOverlay = blkEl.classList.contains('mermaid-block') || !!blkEl.querySelector('.katex-display');
  if (!(imgOld || isHr || isOverlay)) return;
  if (state.editing) commitEditing();
  syncNow();
  const index = Number(blkEl.dataset.blk);
  const fresh = state.blocks[index] && state.blocks[index].el;
  if (!fresh || !fresh.isConnected) return;
  if (imgOld) {
    const idx = [...blkEl.querySelectorAll('img')].indexOf(imgOld);
    const imgs = fresh.querySelectorAll('img');
    openImageDialog(imgs[idx] || imgs[0], fresh, index);
    return;
  }
  if (isHr) { openHrBar(fresh, index); return; }
  openOverlay(fresh, index);
}

let hoverBlk = null;
let linkModal = null;
function closeLinkModal() {
  if (linkModal) { linkModal.remove(); linkModal = null; }
}
function commitBlockOf(el) {
  commitLive();
}
function validLinkUrl(v) {
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(v) || /^[#./][^\s]*$/.test(v);
}
function openLinkDialog(a, isNew = false) {
  closeLinkModal();
  hideFloatBar();
  const wrap = document.createElement('div');
  wrap.className = 'link-modal';
  const card = document.createElement('div');
  card.className = 'link-card';
  const title = document.createElement('h3');
  title.textContent = isNew ? '插入链接' : '编辑链接';
  const r1 = document.createElement('label');
  r1.textContent = '链接名称';
  const ti = document.createElement('input');
  ti.value = a.textContent;
  const r2 = document.createElement('label');
  r2.textContent = '链接地址';
  const ui = document.createElement('input');
  ui.value = a.getAttribute('href') || '';
  const err = document.createElement('div');
  err.className = 'link-err';
  const btns = document.createElement('div');
  btns.className = 'link-btns';
  const open = document.createElement('button');
  open.textContent = '打开链接';
  const unlink = document.createElement('button');
  unlink.textContent = '移除链接';
  const cancel = document.createElement('button');
  cancel.textContent = '取消';
  const apply = document.createElement('button');
  apply.textContent = '应用';
  apply.className = 'primary';
  const validate = () => {
    const nameOk = ti.value.trim().length > 0;
    const urlOk = validLinkUrl(ui.value.trim());
    err.textContent = !nameOk ? '链接名称不能为空' : !urlOk ? '地址不合法：需以 http(s)://、mailto:、#、/ 或 ./ 开头，且不含空格' : '';
    return nameOk && urlOk;
  };
  ti.addEventListener('input', validate);
  ui.addEventListener('input', validate);
  apply.addEventListener('click', () => {
    if (!validate()) return;
    a.textContent = ti.value.trim();
    a.setAttribute('href', ui.value.trim());
    commitBlockOf(a);
    closeLinkModal();
  });
  unlink.addEventListener('click', () => {
    a.replaceWith(...a.childNodes);
    commitLive();
    closeLinkModal();
  });
  open.addEventListener('click', () => {
    const url = ui.value.trim();
    if (!validLinkUrl(url)) { validate(); return; }
    if (/^https?:/i.test(url)) api.openExternal(url);
    else if (/\.(md|markdown|mdown|mkd|txt)$/i.test(url)) api.openPath(api.resolvePath(state.dir, url));
    else api.openLocal(api.resolvePath(state.dir, url));
    closeLinkModal();
  });
  cancel.addEventListener('click', cancelLink);
  btns.append(open, unlink, cancel, apply);
  card.append(title, r1, ti, r2, ui, err, btns);
  wrap.append(card);
  wrap.addEventListener('mousedown', (ev) => { if (ev.target === wrap) cancelLink(); });
  card.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') cancelLink();
    if (ev.key === 'Enter') apply.click();
  });
  document.body.append(wrap);
  linkModal = wrap;
  ti.focus();
  ti.select();

  function cancelLink() {
    if (isNew && !a.getAttribute('href') && a.parentNode) a.replaceWith(...a.childNodes);
    closeLinkModal();
  }
}
function clearHover() {
  if (!hoverBlk) return;
  hoverBlk.classList.remove('blk-hover');
  hoverBlk.querySelectorAll(':scope > .blk-delete, :scope > .table-cfg-btn').forEach((b) => b.remove());
  hoverBlk = null;
}

function bindBlockHover() {
  contentEl.addEventListener('mouseover', (e) => {
    if (state.edit || state.editing) return;
    const blkEl = e.target.closest('[data-blk]');
    if (blkEl === hoverBlk) return;
    clearHover();
    if (!blkEl) return;
    hoverBlk = blkEl;
    blkEl.classList.add('blk-hover');
    const btn = document.createElement('button');
    btn.className = 'blk-delete';
    btn.textContent = '删除';
    btn.title = '删除整块内容';
    btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      clearHover();
      blkEl.remove();
      commitLive();
    });
    blkEl.append(btn);
    if (blkEl.classList.contains('table-wrap')) {
      const tbl = blkEl.querySelector('table');
      btn.style.right = Math.max(4, blkEl.clientWidth - tbl.offsetWidth - 4) + 'px';
      const cfgBtn = document.createElement('button');
      cfgBtn.className = 'table-cfg-btn';
      cfgBtn.textContent = '配置';
      cfgBtn.title = '列宽 / 对齐 / 行高';
      cfgBtn.style.right = (Math.max(4, blkEl.clientWidth - tbl.offsetWidth - 4) + 44) + 'px';
      cfgBtn.addEventListener('mousedown', (ev) => ev.stopPropagation());
      cfgBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openTableDialog(blkEl);
      });
      blkEl.append(cfgBtn);
    }
  });
  contentEl.addEventListener('mouseleave', clearHover);
}

function bindContent() {
  contentEl.addEventListener('click', onContentClick);
  contentEl.addEventListener('paste', onPaste);
  contentEl.addEventListener('input', onContentInput);
  contentEl.addEventListener('input', () => { nativeUndoOk = true; });
  document.addEventListener('selectionchange', trackSelection);
  bindBlockHover();
  bindBlockDrag();
  bindLightbox();
  bindTableTools();
  contentEl.addEventListener('dblclick', (e) => {
    const img = e.target.closest('img');
    if (img) openLightbox(img.src);
  });
  contentEl.addEventListener('keydown', (e) => {
    if (state.editing) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEditing(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
      return;
    }
    if (!state.edit && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      state.renderChain.then(() => {
        syncNow();
        saveCurrent();
        updateStats();
      });
    }
  });
  contentEl.addEventListener('focusout', (e) => {
    if (state.edit || state.pickerPending) return;
    const rt = e.relatedTarget;
    if (rt && (contentEl.contains(rt) || rt.closest('.link-modal') || rt.closest('.table-menu') || rt.closest('#lightbox') || rt.closest('.color-panel') || rt.closest('#float-bar'))) return;
    if (state.editing) { commitEditing(); return; }
    clearTimeout(liveTimer);
    state.renderChain.then(() => {
      const next = serializeDoc(contentEl);
      if (next === state.raw) return;
      state.raw = next;
      renderMarkdown(next, { preserve: true });
    });
  });
  lightbox.addEventListener('click', closeLightbox);
}

/* ---------- 拖拽打开 ---------- */

const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');

function bindDragDrop() {
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropOverlay.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const p = api.getPathForFile(file);
    if (!p) { toast('无法获取文件路径'); return; }
    if (!MD_EXTS.includes(api.extname(p).toLowerCase())) {
      toast('仅支持 Markdown / 文本文件');
      return;
    }
    api.openPath(p);
  });
}

/* ---------- 欢迎页 / 最近文件 ---------- */

function renderRecent(recent) {
  const wrap = $('#recent-wrap');
  const list = $('#recent-list');
  list.innerHTML = '';
  if (!recent || !recent.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  for (const p of recent) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'recent-item';
    btn.title = p;
    const name = document.createElement('span');
    name.className = 'recent-name';
    name.textContent = api.basename(p);
    const dir = document.createElement('span');
    dir.className = 'recent-dir';
    dir.textContent = api.dirname(p);
    btn.append(name, dir);
    btn.addEventListener('click', () => api.openPath(p));
    li.append(btn);
    list.append(li);
  }
}

/* ---------- 编辑与保存 ---------- */

function toggleEdit(on) {
  if (on && !state.path) { toast('请先打开一个 Markdown 文件'); return; }
  hideFloatBar();
  state.edit = on;
  document.body.classList.toggle('edit-mode', on);
  editorWrap.hidden = !on;
  $('#btn-edit').classList.toggle('active', on);
  if (on) {
    editor.value = state.raw;
    editor.focus();
  }
  setReadEditable();
  api.editChanged(on);
  updateSaveStatus();
  if (searchOpen && searchInput.value) {
    srcFindPos = 0;
    if (on) { hlAll.clear(); hlActive.clear(); api.find(searchInput.value, { matchCase: caseSensitive }); }
    else refreshFind();
  }
}

function updateSaveStatus() {
  const el = $('#stat-save');
  el.textContent = state.lastSave ? '自动保存 · ' + state.lastSave.toTimeString().slice(0, 8) : '自动保存';
}

async function saveCurrent() {
  if (!state.path) return;
  clearTimeout(saveTimer);
  const res = await api.saveFile(state.raw);
  if (res && res.saved) {
    state.lastSave = new Date();
    updateSaveStatus();
  } else {
    toast('保存失败');
  }
}

function onEditorInput() {
  state.raw = editor.value;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => renderMarkdown(state.raw, { preserve: true }), 300);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrent, 250);
}

async function flushEditRender() {
  if (!state.edit) return;
  clearTimeout(renderTimer);
  await renderMarkdown(state.raw, { preserve: true });
}

function bindEditor() {
  editor.addEventListener('input', onEditorInput);
  editor.addEventListener('input', () => { nativeUndoOk = true; });
  editor.addEventListener('paste', onPaste);
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
      onEditorInput();
    }
  });
  editor.addEventListener('scroll', () => {
    if (state.edit) syncScroll(editor, scrollEl);
  });
}

/* ---------- 插入片段 ---------- */

const INSERT_DEFS = {
  h1: { block: '# ', ph: '标题' },
  h2: { block: '## ', ph: '标题' },
  h3: { block: '### ', ph: '标题' },
  bold: { wrap: ['**', '**'], ph: '加粗文字' },
  italic: { wrap: ['*', '*'], ph: '斜体文字' },
  strike: { wrap: ['~~', '~~'], ph: '删除文字' },
  code: { wrap: ['`', '`'], ph: '代码' },
  link: { wrap: ['[', '](https://)'], ph: '链接文字', selectTail: 'https://' },
  codeblock: { block: '```language\n', ph: '代码', tail: '\n```\n' },
  table: { raw: '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n' },
  ul: { block: '- ', ph: '列表项' },
  ol: { block: '1. ', ph: '列表项' },
  task: { block: '- [ ] ', ph: '待办事项' },
  quote: { block: '> ', ph: '引用内容' },
  hr: { raw: '\n---\n' },
  math: { block: '$$\n', ph: 'E = mc^2', tail: '\n$$\n' },
  imath: { wrap: ['$', '$'], ph: 'E = mc^2' },
  h4: { block: '#### ', ph: '标题' },
  h5: { block: '##### ', ph: '标题' },
  h6: { block: '###### ', ph: '标题' },
  mflow: { raw: '\n```mermaid\nflowchart TD\n    A[开始] --> B{判断}\n    B -->|是| C[执行]\n    B -->|否| D[结束]\n```\n' },
  mseq: { raw: '\n```mermaid\nsequenceDiagram\n    A->>B: 请求\n    B-->>A: 响应\n```\n' },
  mpie: { raw: '\n```mermaid\npie title 占比\n    "甲" : 40\n    "乙" : 60\n```\n' },
};

function applyColorRange(range, color) {
  const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const blkEl = startEl.closest('[data-blk]');
  if (color === 'clear') {
    blkEl.querySelectorAll('span[data-color]').forEach((sp) => {
      if (range.intersectsNode(sp)) sp.replaceWith(...sp.childNodes);
    });
  } else {
    const span = document.createElement('span');
    span.dataset.color = color;
    span.style.color = color;
    try { range.surroundContents(span); }
    catch { span.append(range.extractContents()); range.insertNode(span); }
  }
}

async function applyColor(color) {
  await state.renderChain;
  const range = getActiveRange();
  if (!range) { toast('请先选中要着色的文字'); return; }
  applyColorRange(range, color);
  document.getSelection().removeAllRanges();
  lastSelSnap = null;
  commitLive();
}

const THEME_COLORS = ['#cf222e', '#bc4c00', '#9a6700', '#1a7f37', '#0969da', '#8250df', '#656d76'];
const STANDARD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
let colorPanel = null;

function closeColorPanel() {
  if (colorPanel) { colorPanel.remove(); colorPanel = null; }
}

function normalizeHex(v) {
  let s = String(v || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toLowerCase();
}

async function openColorPanel() {
  if (!state.path) { toast('请先打开一个 Markdown 文件'); return; }
  closeColorPanel();
  await state.renderChain;
  const sel = document.getSelection();
  const snap = lastSelSnap || (sel.rangeCount && !sel.isCollapsed ? snapshotRange(sel.getRangeAt(0)) : null);
  if (!state.edit && !snap) { toast('请先选中要着色的文字'); return; }

  const wrap = document.createElement('div');
  wrap.className = 'link-modal color-panel';
  const card = document.createElement('div');
  card.className = 'link-card cp-card';
  const title = document.createElement('h3');
  title.textContent = '文字颜色';

  const mkSwatches = (labelText, colors) => {
    const sec = document.createElement('div');
    sec.className = 'cp-section';
    const lab = document.createElement('div');
    lab.className = 'cp-label';
    lab.textContent = labelText;
    const grid = document.createElement('div');
    grid.className = 'cp-swatches';
    for (const c of colors) {
      const b = document.createElement('button');
      b.className = 'cp-swatch';
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => applyFromPanel(c));
      grid.append(b);
    }
    sec.append(lab, grid);
    return sec;
  };

  const custom = document.createElement('div');
  custom.className = 'cp-custom';
  const hexInput = document.createElement('input');
  hexInput.className = 'cp-hex';
  hexInput.placeholder = '#000000';
  hexInput.spellcheck = false;
  hexInput.maxLength = 7;
  const preview = document.createElement('span');
  preview.className = 'cp-preview';
  const pick = document.createElement('button');
  pick.className = 'cp-pick';
  pick.title = '取色笔：从屏幕任意位置取色';
  pick.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M13.35 2.65a2.5 2.5 0 0 0-3.54 0L8.4 4.06l-.7-.7a.75.75 0 0 0-1.06 1.06l.7.7-4.6 4.6a2 2 0 0 0-.55 1.03l-.42 1.9a.75.75 0 0 0 .89.89l1.9-.42a2 2 0 0 0 1.03-.55l4.6-4.6.7.7a.75.75 0 0 0 1.06-1.06l-.7-.7 1.41-1.41a2.5 2.5 0 0 0 0-3.54Z"/></svg><span>取色笔</span>';
  const native = document.createElement('input');
  native.type = 'color';
  native.className = 'cp-native';
  native.value = '#cf222e';
  const err = document.createElement('div');
  err.className = 'link-err cp-err';
  custom.append(hexInput, preview, pick, native);

  const btns = document.createElement('div');
  btns.className = 'link-btns';
  const clear = document.createElement('button');
  clear.textContent = '清除颜色';
  const cancel = document.createElement('button');
  cancel.textContent = '取消';
  const apply = document.createElement('button');
  apply.textContent = '应用';
  apply.className = 'primary';
  btns.append(clear, cancel, apply);

  const refreshPreview = () => {
    const hex = normalizeHex(hexInput.value);
    preview.style.background = hex || 'transparent';
    preview.classList.toggle('invalid', !hex && hexInput.value.trim() !== '');
    err.textContent = !hex && hexInput.value.trim() !== '' ? '颜色格式不合法，示例：#ff0000 或 #f00' : '';
  };
  hexInput.addEventListener('input', refreshPreview);
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); apply.click(); }
  });
  pick.addEventListener('click', async () => {
    if (window.EyeDropper) {
      try {
        const res = await new EyeDropper().open();
        hexInput.value = res.sRGBHex;
        refreshPreview();
      } catch {}
    } else {
      native.click();
    }
  });
  native.addEventListener('input', () => {
    hexInput.value = native.value;
    refreshPreview();
  });
  apply.addEventListener('click', () => {
    const hex = normalizeHex(hexInput.value);
    if (!hex) { refreshPreview(); if (!hexInput.value.trim()) err.textContent = '请输入颜色值，或点击上方色块'; return; }
    applyFromPanel(hex);
  });
  clear.addEventListener('click', () => applyFromPanel('clear'));
  cancel.addEventListener('click', closeColorPanel);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeColorPanel(); });
  card.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeColorPanel(); });

  card.append(title, mkSwatches('主题色', THEME_COLORS), mkSwatches('标准色', STANDARD_COLORS), custom, err, btns);
  wrap.append(card);
  document.body.append(wrap);
  colorPanel = wrap;
  hexInput.focus();

  async function applyFromPanel(color) {
    closeColorPanel();
    if (state.edit) {
      pushUndo();
      const s = editor.selectionStart;
      const e = editor.selectionEnd;
      if (color === 'clear') {
        const stripped = editor.value.slice(s, e).replace(/\{[^{}]+\}\(([^()]*)\)/g, '$1');
        editor.setRangeText(stripped, s, e, 'end');
      } else {
        const inner = editor.value.slice(s, e) || '文字';
        editor.setRangeText(`{${color}}(${inner})`, s, e, 'end');
      }
      editor.focus();
      onEditorInput();
      return;
    }
    await state.renderChain;
    const range = restoreRange(snap) || getActiveRange();
    if (!range) { toast('选区已失效，请重新选中文字'); return; }
    applyColorRange(range, color);
    document.getSelection().removeAllRanges();
    lastSelSnap = null;
    commitLive();
  }
}

async function insertSnippet(key) {
  if (!state.path) { toast('请先打开一个 Markdown 文件'); return; }
  if (key === 'color:panel') { openColorPanel(); return; }
  if (key.startsWith('color:') && !state.edit) { await applyColor(key.slice(6)); return; }
  if (key === 'color:clear' && state.edit) {
    pushUndo();
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const stripped = editor.value.slice(s, e).replace(/\{[^{}]+\}\(([^()]*)\)/g, '$1');
    editor.setRangeText(stripped, s, e, 'end');
    editor.focus();
    onEditorInput();
    return;
  }
  if (key.startsWith('color:') && state.edit) {
    pushUndo();
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    const inner = editor.value.slice(s, e) || '文字';
    editor.setRangeText(`{${key.slice(6)}}(${inner})`, s, e, 'end');
    editor.focus();
    onEditorInput();
    return;
  }
  if (!state.edit) toggleEdit(true);
  pushUndo();
  if (key === 'footnote') {
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    editor.setRangeText('[^note]', s, e, 'end');
    editor.value += '\n[^note]: 脚注内容\n';
    editor.focus();
    onEditorInput();
    return;
  }
  let def = INSERT_DEFS[key];
  if (key === 'image') {
    const p = await api.pickImage();
    if (!p) return;
    const rel = api.relPath(state.dir, p).split('\\').join('/');
    def = { raw: `![${api.basename(p)}](${rel})` };
  }
  if (!def) return;
  const s = editor.selectionStart;
  const e = editor.selectionEnd;
  const v = editor.value;
  const sel = v.slice(s, e);
  let text;
  let innerStart = -1;
  let innerLen = 0;
  if (def.raw) {
    text = def.raw;
  } else if (def.wrap) {
    const inner = sel || def.ph;
    text = def.wrap[0] + inner + def.wrap[1];
    innerStart = s + def.wrap[0].length;
    innerLen = inner.length;
    if (def.selectTail) {
      innerStart = s + def.wrap[0].length + inner.length + def.wrap[1].indexOf(def.selectTail);
      innerLen = def.selectTail.length;
    }
  } else {
    const inner = sel || def.ph;
    const prefix = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
    text = prefix + def.block + inner + (def.tail || '\n');
    innerStart = s + prefix.length + def.block.length;
    innerLen = inner.length;
  }
  editor.setRangeText(text, s, e, 'end');
  if (innerStart >= 0) editor.setSelectionRange(innerStart, innerStart + innerLen);
  editor.focus();
  onEditorInput();
}

/* ---------- 选区浮动工具栏 ---------- */

const floatBar = $('#float-bar');
let floatTimer = null;

function hideFloatBar() {
  clearTimeout(floatTimer);
  floatBar.hidden = true;
}

function blockOfRange(range) {
  const el = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const blk = el && el.closest('[data-blk]');
  return blk && contentEl.contains(blk) && blk.contains(range.endContainer) ? blk : null;
}

function updateFloatBar() {
  if (state.edit || !state.path || colorPanel || linkModal || tableMenu) { hideFloatBar(); return; }
  const sel = document.getSelection();
  if (!sel.rangeCount || sel.isCollapsed || !contentEl.contains(sel.anchorNode) || !contentEl.contains(sel.focusNode)) { hideFloatBar(); return; }
  const range = sel.getRangeAt(0);
  if (!range.toString().trim() || !blockOfRange(range)) { hideFloatBar(); return; }
  const aEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  if (aEl.closest('.mermaid-block, .katex, .katex-display, pre')) { hideFloatBar(); return; }
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) { hideFloatBar(); return; }
  floatBar.hidden = false;
  const bw = floatBar.offsetWidth;
  const bh = floatBar.offsetHeight;
  let x = rect.left + rect.width / 2 - bw / 2;
  x = Math.max(8, Math.min(window.innerWidth - bw - 8, x));
  let y = rect.top - bh - 8;
  if (y < 8) y = rect.bottom + 8;
  floatBar.style.left = x + 'px';
  floatBar.style.top = y + 'px';
  const tags = { bold: 'strong', italic: 'em', strike: 'del', code: 'code' };
  floatBar.querySelectorAll('button[data-fmt]').forEach((b) => {
    const t = tags[b.dataset.fmt];
    if (t) b.classList.toggle('active', !!aEl.closest(t));
    else if (b.dataset.fmt === 'swatch') b.classList.toggle('active', !!aEl.closest(`span[data-color="${b.dataset.color}"]`));
  });
}

function toggleWrap(tag) {
  const sel = document.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!blockOfRange(range)) { toast('请在同一段落内选择文字'); return; }
  let anc = range.commonAncestorContainer;
  if (anc.nodeType === 3) anc = anc.parentElement;
  const wrapped = anc.closest(tag.toLowerCase());
  if (wrapped && wrapped.contains(range.startContainer) && wrapped.contains(range.endContainer)) {
    const parent = wrapped.parentNode;
    while (wrapped.firstChild) parent.insertBefore(wrapped.firstChild, wrapped);
    parent.removeChild(wrapped);
    parent.normalize();
    sel.removeAllRanges();
  } else {
    const el = document.createElement(tag);
    try { range.surroundContents(el); }
    catch { el.append(range.extractContents()); range.insertNode(el); }
    sel.removeAllRanges();
    const r2 = document.createRange();
    r2.selectNodeContents(el);
    sel.addRange(r2);
  }
  commitLive();
}

function clearInlineFormat() {
  const range = getActiveRange();
  if (!range) { toast('请先选中文字'); return; }
  const blk = blockOfRange(range);
  if (!blk || blk.tagName === 'PRE') { toast('代码块请在源码模式编辑'); return; }
  blk.querySelectorAll('strong, b, em, i, del, s, code, span[data-color], a').forEach((el) => {
    if (range.intersectsNode(el)) el.replaceWith(...el.childNodes);
  });
  document.getSelection().removeAllRanges();
  lastSelSnap = null;
  commitLive();
}

function linkFromSelection() {
  const range = getActiveRange();
  if (!range) { toast('请先选中链接文字'); return; }
  const a = document.createElement('a');
  a.setAttribute('href', '');
  try { range.surroundContents(a); }
  catch { a.append(range.extractContents()); range.insertNode(a); }
  openLinkDialog(a, true);
}

function bindFloatBar() {
  floatBar.addEventListener('mousedown', (e) => e.preventDefault());
  floatBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-fmt]');
    if (!btn) return;
    const fmt = btn.dataset.fmt;
    if (fmt === 'bold') toggleWrap('STRONG');
    else if (fmt === 'italic') toggleWrap('EM');
    else if (fmt === 'strike') toggleWrap('DEL');
    else if (fmt === 'code') toggleWrap('CODE');
    else if (fmt === 'swatch') { hideFloatBar(); applyColor(btn.dataset.color); }
    else if (fmt === 'color') { hideFloatBar(); openColorPanel(); }
    else if (fmt === 'link') { hideFloatBar(); linkFromSelection(); }
    else if (fmt === 'clear') { hideFloatBar(); clearInlineFormat(); }
  });
  document.addEventListener('selectionchange', () => {
    clearTimeout(floatTimer);
    const sel = document.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { hideFloatBar(); return; }
    floatTimer = setTimeout(updateFloatBar, 120);
  });
  scrollEl.addEventListener('scroll', hideFloatBar);
  window.addEventListener('resize', hideFloatBar);
}

/* ---------- 编辑/预览滚动同步 ---------- */

let syncLock = false;
function syncScroll(src, dst) {
  if (syncLock) return;
  syncLock = true;
  const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
  dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight);
  requestAnimationFrame(() => { syncLock = false; });
}

/* ---------- PDF 导出 ---------- */

async function exportPdf() {
  if (exporting) return;
  if (!state.path) { toast('请先打开一个 Markdown 文件'); return; }
  exporting = true;
  toast('正在生成 PDF…');
  commitEditing();
  await flushEditRender();
  document.body.classList.add('print-mode');
  try {
    await rerenderMermaidForTheme('default');
    await document.fonts.ready;
    await Promise.all([...contentEl.querySelectorAll('img')].map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      })
    ));
    const res = await api.exportPdf();
    if (res && res.saved) toast('已导出：' + api.basename(res.path));
  } catch (err) {
    console.error(err);
    toast('PDF 导出失败');
  } finally {
    document.body.classList.remove('print-mode');
    await rerenderMermaidForTheme();
    exporting = false;
  }
}

/* ---------- 长图导出 ---------- */

async function exportImage() {
  if (imaging) return;
  if (!state.path) { toast('请先打开一个 Markdown 文件'); return; }
  imaging = true;
  toast('正在生成长图…');
  commitEditing();
  await flushEditRender();
  document.body.classList.add('capture-mode');
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts.ready;
    await Promise.all([...contentEl.querySelectorAll('img')].map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      })
    ));
    const width = document.documentElement.clientWidth;
    const fullHeight = document.documentElement.scrollHeight;
    const height = Math.min(fullHeight, 16000);
    const res = await api.exportImage({ width, height });
    if (res && res.saved) {
      toast(fullHeight > 16000 ? '已导出（超长文档截断至 16000px）：' + api.basename(res.path) : '已导出：' + api.basename(res.path));
    } else if (res && res.error) {
      toast('长图导出失败：' + res.error);
    }
  } catch (err) {
    console.error(err);
    toast('长图导出失败');
  } finally {
    document.body.classList.remove('capture-mode');
    imaging = false;
  }
}

/* ---------- 提示 ---------- */

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 250);
  }, 2600);
}

/* ---------- 文件事件 ---------- */

function onFileOpened(data) {
  state.path = data.path;
  state.dir = data.dir;
  state.name = data.name;
  $('#file-title').textContent = data.name;
  $('#file-title').title = data.path;
  $('#stat-file').textContent = data.path;
  $('#stat-file').title = data.path;
  welcomeEl.hidden = true;
  contentEl.hidden = false;
  document.body.classList.remove('no-file');
  undoStack.length = 0;
  redoStack.length = 0;
  if (state.edit) editor.value = data.content;
  updateSaveStatus();
  refreshTreeActive();
  renderMarkdown(data.content, { preserve: false });
}

/* ---------- 事件绑定 ---------- */

function bindToolbar() {
  $('#btn-sidebar').addEventListener('click', () => applySidebar(!state.sidebar, true));
  $('#tab-toc').addEventListener('click', () => setSidebarTab('toc'));
  $('#tab-files').addEventListener('click', () => setSidebarTab('files'));
  $('#btn-open').addEventListener('click', () => api.openDialog());
  $('#btn-theme').addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
    applyTheme(next, true);
  });
  $('#btn-pdf').addEventListener('click', exportPdf);
  $('#btn-image').addEventListener('click', exportImage);
  $('#btn-edit').addEventListener('click', () => toggleEdit(!state.edit));
  $('#btn-wide').addEventListener('click', () => applyWide(!state.wide, true));
  $('#btn-welcome-open').addEventListener('click', () => api.openDialog());
  $('#btn-sample').addEventListener('click', async () => api.openPath(await api.samplePath()));
  $('#btn-clear-recent').addEventListener('click', async () => {
    await api.setConfig({ recent: [], lastFile: null });
    renderRecent([]);
  });
  $('#btn-zoom-in').addEventListener('click', () => zoomBy(0.5));
  $('#btn-zoom-out').addEventListener('click', () => zoomBy(-0.5));
  $('#zoom-level').addEventListener('click', () => api.setZoom(0));
}

function bindScroll() {
  let ticking = false;
  scrollEl.addEventListener('scroll', () => {
    if (state.edit) syncScroll(scrollEl, editor);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateActiveHeading();
      updateProgress();
      ticking = false;
    });
  });
  scrollEl.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 0.5 : -0.5);
    }
  }, { passive: false });
}

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!lightbox.hidden) closeLightbox();
      else if (tableMenu) closeTableMenu();
      else if (!floatBar.hidden) hideFloatBar();
      else if (updateModal) closeUpdateModal();
      else if (searchOpen) closeSearch();
    }
  });
}

function bindIpc() {
  api.on('file:opened', onFileOpened);
  api.on('file:changed', (data) => {
    if (!state.path) return;
    if (data.content === state.raw) return;
    if (state.pendingMutation) return;
    if (state.edit && document.activeElement === editor) return;
    if (state.edit) editor.value = data.content;
    renderMarkdown(data.content, { preserve: true });
  });
  api.on('theme:set', (t) => applyTheme(t, true));
  api.on('font:set', (f) => applyFont(f, true));
  api.on('zoom:changed', (level) => { state.zoom = level; updateZoomLabel(); });
  api.on('menu:find', openSearch);
  api.on('menu:toggle-sidebar', () => applySidebar(!state.sidebar, true));
  api.on('menu:toggle-edit', () => toggleEdit(!state.edit));
  api.on('wide:set', (v) => applyWide(v, false));
  api.on('focus:set', (v) => applyFocusMode(v, false));
  api.on('typewriter:set', (v) => applyTypewriter(v, false));
  api.on('menu:save', saveCurrent);
  api.on('menu:undo', undo);
  api.on('menu:redo', redo);
  api.on('menu:insert', insertSnippet);
  api.on('menu:typography', openTypoPanel);
  api.on('menu:check-update', checkUpdate);
  api.on('pdf:prepare', exportPdf);
  api.on('image:prepare', exportImage);
  api.on('find:result', ({ active, total }) => {
    if (!state.edit) return;
    searchCount.textContent = total ? `${active}/${total}` : '无结果';
    searchCount.classList.toggle('no-match', !total);
  });
  api.on('recent:cleared', () => renderRecent([]));
}

/* ---------- 启动 ---------- */

async function init() {
  window.addEventListener('error', (e) => console.error('window error:', e.message));
  window.addEventListener('unhandledrejection', (e) =>
    console.error('unhandled rejection:', (e.reason && e.reason.stack) || e.reason)
  );
  const cfg = await api.getConfig();
  state.zoom = typeof cfg.zoom === 'number' ? cfg.zoom : 0;
  api.version().then((v) => { $('#welcome-version').textContent = v; });
  applyTheme(cfg.theme || 'light', false);
  applyFont(cfg.font || 'sans', false);
  applyWide(cfg.wide === true, false);
  applyFocusMode(cfg.focusMode === true, false);
  applyTypewriter(cfg.typewriterMode === true, false);
  applyTypography(cfg.typography, false);
  applySidebar(cfg.sidebar !== false, false);
  setSidebarTab(cfg.sidebarTab === 'files' ? 'files' : 'toc', false);
  updateZoomLabel();
  bindToolbar();
  bindSearch();
  bindScroll();
  bindDragDrop();
  bindKeys();
  bindContent();
  bindEditor();
  bindFloatBar();
  bindTypo();
  bindIpc();
  renderRecent(cfg.recent || []);
  document.body.classList.add('no-file');
  api.renderDone({ hasFile: false });
}

init();