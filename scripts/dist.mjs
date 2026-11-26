import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const node = process.execPath;
const run = (args) => execFileSync(node, args, { cwd: root, stdio: 'inherit' });

run(['scripts/build.mjs']);
run(['scripts/prep-runtime.mjs']);

const platform = process.argv.includes('--mac') ? 'mac' : process.argv.includes('--linux') ? 'linux' : 'win';
const arch = process.argv.includes('--arm64') ? '--arm64' : process.argv.includes('--x64') ? '--x64' : null;
// 工作区索引服务会锁定已生成的 asar，复用旧输出目录会 EBUSY；每次用全新目录
const out = `package-${Date.now()}`;
run(['node_modules/electron-builder/out/cli/cli.js', `--${platform}`, ...(arch ? [arch] : []), `-c.directories.output=${out}`]);

const dest = path.join(root, 'package');
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(path.join(root, out))) {
  if (/\.(exe|blockmap|dmg|zip|AppImage|deb)$/i.test(f)) {
    fs.copyFileSync(path.join(root, out, f), path.join(dest, f));
  }
}
// 本地只保留最新版本安装包；旧版本以 GitHub Releases 为准
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
for (const f of fs.readdirSync(dest)) {
  if (/\.(exe|blockmap|dmg|zip|AppImage|deb)$/i.test(f) && !f.includes(version)) {
    fs.rmSync(path.join(dest, f));
  }
}
// 尽力清理历史解包目录（被索引服务锁定的会留到重启后）；只删目录，避免误删 package-lock.json
for (const d of fs.readdirSync(root)) {
  if (d.startsWith('package-') && d !== out && fs.statSync(path.join(root, d)).isDirectory()) {
    try { fs.rmSync(path.join(root, d), { recursive: true, force: true }); } catch {}
  }
}
// Windows 关联固定使用本地解包目录，避免每次打开都运行便携版解压
if (process.platform === 'win32' && platform === 'win') {
  run(['scripts/associate.mjs', '--unpacked=' + path.join(root, out, 'win-unpacked')]);
}
console.log(`安装包已复制到 package/（仅保留 ${version}）；平台：${platform}；解包目录：${out}`);