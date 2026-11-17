import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'node_modules', 'electron', 'dist');
const exe = path.join(dist, 'MarkView.exe');
const ico = path.join(root, 'assets', 'icon.ico');
const command = `"${exe}" "${root}" "%1"`;

const add = (key, ...rest) => execFileSync('reg', ['add', key, ...rest, '/f'], { stdio: 'ignore' });

fs.copyFileSync(path.join(dist, 'electron.exe'), exe);

add('HKCU\\Software\\Classes\\MarkView.md', '/v', 'FriendlyTypeName', '/d', 'Markdown 文档 (MarkView)');
add('HKCU\\Software\\Classes\\MarkView.md\\DefaultIcon', '/ve', '/d', ico);
add('HKCU\\Software\\Classes\\MarkView.md\\shell\\open\\command', '/ve', '/d', command);

add('HKCU\\Software\\Classes\\Applications\\MarkView.exe', '/v', 'FriendlyAppName', '/d', 'MarkView');
add('HKCU\\Software\\Classes\\Applications\\MarkView.exe\\shell\\open\\command', '/ve', '/d', command);
for (const ext of ['.md', '.markdown', '.mdown', '.mkd']) {
  add('HKCU\\Software\\Classes\\Applications\\MarkView.exe\\SupportedTypes', '/v', ext, '/d', '');
}

add('HKCU\\Software\\MarkView\\Capabilities', '/v', 'ApplicationName', '/d', 'MarkView');
add('HKCU\\Software\\MarkView\\Capabilities', '/v', 'ApplicationDescription', '/d', '简洁的本地 Markdown 阅读与编辑工具');
for (const ext of ['.md', '.markdown']) {
  add('HKCU\\Software\\MarkView\\Capabilities\\FileAssociations', '/v', ext, '/d', 'MarkView.md');
}
add('HKCU\\Software\\RegisteredApplications', '/v', 'MarkView', '/d', 'Software\\MarkView\\Capabilities');

for (const ext of ['.md', '.markdown']) {
  add(`HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, '/v', 'MarkView.md', '/d', '');
  add(`HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\MarkView`, '/ve', '/d', '用 MarkView 打开');
  add(`HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\MarkView`, '/v', 'Icon', '/d', ico);
  add(`HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\MarkView\\command`, '/ve', '/d', command);
}

let current = '(未知)';
try {
  const out = execFileSync('reg', [
    'query',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice',
    '/v',
    'ProgId',
  ]).toString();
  current = (out.match(/ProgId\s+REG_SZ\s+(.+)/) || [])[1]?.trim() || current;
} catch {}

console.log('注册完成：右键 .md 可见"用 MarkView 打开"，"打开方式"列表含 MarkView。');
console.log('当前 .md 默认程序：' + current);
console.log('Windows 保护默认程序设置，需你在弹窗中勾选"始终使用此应用"完成切换。');

if (process.argv.includes('--set-default')) {
  const target = path.join(root, '格式演示.md');
  spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', target], { detached: true, stdio: 'ignore' }).unref();
  console.log('已弹出"打开方式"确认对话框：选择 MarkView 并勾选始终使用。');
}