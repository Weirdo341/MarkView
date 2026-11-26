import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const q = (key, ve = true) => {
  try {
    return execFileSync('reg', ['query', key, ...(ve ? ['/ve'] : [])], { encoding: 'utf8' });
  } catch {
    return '';
  }
};
const cmdOf = (key) => (q(key).match(/REG_SZ\s+(.+)/) || [])[1]?.trim() || '';
const targetOf = (cmd) => (cmd.match(/^"([^"]+)"/) || [])[1] || '';
const stableDir = path.join(process.env.LOCALAPPDATA, 'MarkView');
const stable = path.join(stableDir, 'app', 'MarkView.exe');
const stableAsar = path.join(stableDir, 'app', 'resources', 'app.asar');
const stableLink = path.join(stableDir, 'app');
const stableIsLink = fs.existsSync(stableLink) && fs.lstatSync(stableLink).isSymbolicLink();
const expectedCommand = `"${stable}" "%1"`;

const keys = [
  'HKCU\\Software\\Classes\\MarkView.md\\shell\\open\\command',
  'HKCU\\Software\\Classes\\md_auto_file\\shell\\open\\command',
  'HKCU\\Software\\Classes\\Applications\\MarkView.exe\\shell\\open\\command',
  'HKCU\\Software\\Classes\\SystemFileAssociations\\.md\\shell\\MarkView\\command',
];
let fail = 0;
for (const k of keys) {
  const command = cmdOf(k);
  const t = targetOf(command);
  const ok = stableIsLink && command === expectedCommand && fs.existsSync(t) && fs.existsSync(stableAsar);
  console.log(ok ? 'PASS' : 'FAIL', k, '->', t || '(missing)');
  if (!ok) fail++;
}
const uc = (q('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice', false).match(/ProgId\s+REG_SZ\s+(.+)/) || [])[1]?.trim() || '';
console.log('UserChoice:', uc || '(none)', /setup/i.test(uc) ? '← 仍指向安装包，需在「打开方式」中重选 MarkView 并勾选始终使用' : '(ok)');
for (const ext of ['.md', '.markdown']) {
  const progId = (q(`HKCU\\Software\\Classes\\${ext}`).match(/REG_SZ\s+(.+)/) || [])[1]?.trim() || '';
  const ok = progId === 'md_auto_file';
  console.log(ok ? 'PASS' : 'FAIL', `${ext} default ProgId ->`, progId || '(missing)');
  if (!ok) fail++;
}
const friendly = (q('HKCU\\Software\\Classes\\md_auto_file\\shell\\open', false).match(/FriendlyAppName\s+REG_SZ\s+(.+)/) || [])[1]?.trim() || '';
const friendlyOk = friendly === 'MarkView';
console.log(friendlyOk ? 'PASS' : 'FAIL', 'md_auto_file FriendlyAppName ->', friendly || '(missing)');
if (!friendlyOk) fail++;
console.log(fail ? `assoc check: FAIL (${fail})` : 'assoc check: PASS');
process.exit(fail ? 1 : 0);