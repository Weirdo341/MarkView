import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.log('文件关联脚本仅支持 Windows；macOS/Linux 请使用安装包声明的文件关联。');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 关联目标必须是稳定副本：node_modules 里的副本会被 npm 升级清掉，package/ 里的包会被 dist 清理删掉
const stableDir = path.join(process.env.LOCALAPPDATA, 'MarkView');
const exe = path.join(stableDir, 'MarkView.exe');
const ico = path.join(stableDir, 'MarkView.ico');

const argExe = process.argv.find((a) => a.startsWith('--exe='));
let source = argExe ? argExe.slice(6) : null;
if (!source) {
  const pkg = path.join(root, 'package');
  const candidates = fs.existsSync(pkg)
    ? fs.readdirSync(pkg).filter((f) => /^MarkView-Portable-.*\.exe$/.test(f)).sort()
    : [];
  source = candidates.length ? path.join(pkg, candidates[candidates.length - 1]) : null;
}
fs.mkdirSync(stableDir, { recursive: true });
if (source && fs.existsSync(source)) {
  try {
    fs.copyFileSync(source, exe);
    console.log('稳定副本已更新：' + exe + ' ← ' + path.basename(source));
  } catch (err) {
    console.log('警告：稳定副本更新失败（可能 MarkView 正在运行）：' + err.message);
  }
}
if (!fs.existsSync(exe)) {
  console.error('缺少稳定副本 ' + exe + '：请先 npm run dist，或用 --exe=<便携版路径> 指定');
  process.exit(1);
}
try {
  fs.copyFileSync(path.join(root, 'assets', 'icon.ico'), ico);
} catch {}

const command = `"${exe}" "%1"`;
const add = (key, ...rest) => execFileSync('reg', ['add', key, ...rest, '/f'], { stdio: 'ignore' });
const del = (key) => { try { execFileSync('reg', ['delete', key, '/f'], { stdio: 'ignore' }); } catch {} };

// Windows 的 .md/.markdown 实际回退链是 md_auto_file；同时保留 MarkView.md 供 UserChoice/右键显示。
add('HKCU\\Software\\Classes\\md_auto_file\\shell\\open\\command', '/ve', '/d', command);
add('HKCU\\Software\\Classes\\md_auto_file\\shell\\open', '/v', 'FriendlyAppName', '/d', 'MarkView');
const query = (key) => {
  try { return execFileSync('reg', ['query', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; }
};

// 清理历史误注册：把安装包/便携包本身登记成"打开方式"的项，以及裸 electron.exe 的 MRU
const staleApp = /^MarkView-(Setup|Portable)-.*\.exe$/i;
for (const line of query('HKCU\\Software\\Classes\\Applications').split(/\r?\n/)) {
  const name = line.trim().split('\\').pop();
  if (staleApp.test(name)) {
    del('HKCU\\Software\\Classes\\Applications\\' + name);
    console.log('已清理误注册：Applications\\' + name);
  }
}
for (const ext of ['.md', '.markdown', '.mdown', '.mkd', '.txt']) {
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${ext}\\OpenWithList`;
  const out = query(key);
  if (!out) continue;
  const values = [...out.matchAll(/^\s+(\w+)\s+REG_SZ\s+(.+)$/gm)].map((m) => [m[1], m[2].trim()]);
  const mru = (values.find(([n]) => n === 'MRUList') || [])[1] || '';
  const removed = [];
  for (const [name, data] of values) {
    if (name === 'MRUList') continue;
    if (staleApp.test(data) || data.toLowerCase() === 'electron.exe') {
      execFileSync('reg', ['delete', key, '/v', name, '/f'], { stdio: 'ignore' });
      removed.push(name);
    }
  }
  if (removed.length) {
    const next = [...mru].filter((c) => !removed.includes(c)).join('');
    add(key, '/v', 'MRUList', '/d', next);
    console.log(`已清理 ${ext} OpenWithList：` + removed.join(','));
  }
}

add('HKCU\\Software\\Classes\\MarkView.md', '/v', 'FriendlyTypeName', '/d', 'Markdown 文档 (MarkView)');
add('HKCU\\Software\\Classes\\MarkView.md\\DefaultIcon', '/ve', '/d', ico);
add('HKCU\\Software\\Classes\\MarkView.md\\shell\\open\\command', '/ve', '/d', command);

add('HKCU\\Software\\Classes\\Applications\\MarkView.exe', '/v', 'FriendlyAppName', '/d', 'MarkView');
add('HKCU\\Software\\Classes\\Applications\\MarkView.exe\\shell\\open\\command', '/ve', '/d', command);
add('HKCU\\Software\\Classes\\Applications\\MarkView.exe\\DefaultIcon', '/ve', '/d', ico);
for (const ext of ['.md', '.markdown', '.mdown', '.mkd', '.txt']) {
  add(`HKCU\\Software\\Classes\\Applications\\MarkView.exe\\SupportedTypes`, '/v', ext, '/d', '');
}

add('HKCU\\Software\\MarkView\\Capabilities', '/v', 'ApplicationName', '/d', 'MarkView');
add('HKCU\\Software\\MarkView\\Capabilities', '/v', 'ApplicationDescription', '/d', '简洁的本地 Markdown 阅读与编辑工具');
for (const ext of ['.md', '.markdown']) {
  add(`HKCU\\Software\\MarkView\\Capabilities\\FileAssociations`, '/v', ext, '/d', 'MarkView.md');
}
add('HKCU\\Software\\RegisteredApplications', '/v', 'MarkView', '/d', 'Software\\MarkView\\Capabilities');

for (const ext of ['.md', '.markdown']) {
  add(`HKCU\\Software\\Classes\\${ext}`, '/ve', '/d', 'md_auto_file');
  add(`HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, '/v', 'MarkView.md', '/d', '');
  add(`HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\MarkView`, '/ve', '/d', '用 MarkView 打开');
  add(`HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\MarkView`, '/v', 'Icon', '/d', ico);
  add(`HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\MarkView\\command`, '/ve', '/d', command);
}

let current = '(未知)';
const uc = query('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice');
current = (uc.match(/ProgId\s+REG_SZ\s+(.+)/) || [])[1]?.trim() || current;

console.log('注册完成：关联目标 = ' + exe);
console.log('右键 .md 可见"用 MarkView 打开"，"打开方式"列表含 MarkView。');
console.log('当前 .md 默认程序：' + current);
if (/MarkView-(Setup|Portable)-/i.test(current)) {
  console.log('注意：默认程序仍指向安装包/便携包本身，双击不会打开文档；需在「打开方式」中重选 MarkView 并勾选"始终使用此应用"。');
}
console.log('Windows 保护默认程序设置，脚本不会静默篡改。');

if (process.argv.includes('--set-default')) {
  const target = path.join(root, 'assets', '格式演示.md');
  spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', target], { detached: true, stdio: 'ignore' }).unref();
  console.log('已弹出"打开方式"确认对话框：选择 MarkView 并勾选始终使用。');
}