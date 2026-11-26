import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.log('解除关联脚本仅支持 Windows；macOS/Linux 请在系统设置中移除关联。');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stableDir = path.join(process.env.LOCALAPPDATA, 'MarkView');

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
  fs.rmSync(stableDir, { recursive: true, force: true });
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

console.log('已移除 MarkView 的全部注册表项与稳定副本目录。');
if (current === 'MarkView.md' || /MarkView/i.test(current)) {
  console.log('注意：.md 默认程序仍指向 MarkView，请在 Windows 设置 > 默认应用 中重新选择。');
}