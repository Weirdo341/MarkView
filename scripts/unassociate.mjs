import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'MarkView.exe');

const del = (key, ...rest) => {
  try {
    execFileSync('reg', ['delete', key, ...rest, '/f'], { stdio: 'ignore' });
  } catch {}
};

del('HKCU\\Software\\Classes\\MarkView.md');
del('HKCU\\Software\\Classes\\Applications\\MarkView.exe');
del('HKCU\\Software\\MarkView');
del('HKCU\\Software\\RegisteredApplications', '/v', 'MarkView');
for (const ext of ['.md', '.markdown']) {
  del(`HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\MarkView`);
  del(`HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, '/v', 'MarkView.md');
}
try {
  fs.rmSync(exe);
} catch {}

let current = '';
try {
  const out = execFileSync('reg', [
    'query',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice',
    '/v',
    'ProgId',
  ]).toString();
  current = (out.match(/ProgId\s+REG_SZ\s+(.+)/) || [])[1]?.trim() || '';
} catch {}

console.log('已移除 MarkView 的全部注册表项与启动器副本。');
if (current === 'MarkView.md') {
  console.log('注意：.md 默认程序仍指向 MarkView，请在 Windows 设置 > 默认应用 中重新选择。');
}