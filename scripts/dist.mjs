import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const node = process.execPath;
const run = (args) => execFileSync(node, args, { cwd: root, stdio: 'inherit' });

run(['scripts/build.mjs']);
run(['scripts/prep-runtime.mjs']);

// 工作区索引服务会锁定已生成的 asar，复用旧输出目录会 EBUSY；每次用全新目录
const out = `package-${Date.now()}`;
run(['node_modules/electron-builder/out/cli/cli.js', '--win', `-c.directories.output=${out}`]);

const dest = path.join(root, 'package');
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(path.join(root, out))) {
  if (f.endsWith('.exe') || f.endsWith('.blockmap')) {
    fs.copyFileSync(path.join(root, out, f), path.join(dest, f));
  }
}
// 本地只保留最新版本安装包；旧版本以 GitHub Releases 为准
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
for (const f of fs.readdirSync(dest)) {
  if ((f.endsWith('.exe') || f.endsWith('.blockmap')) && !f.includes(version)) {
    fs.rmSync(path.join(dest, f));
  }
}
// 尽力清理历史解包目录（被索引服务锁定的会留到重启后）
for (const d of fs.readdirSync(root)) {
  if (d.startsWith('package-') && d !== out) {
    try { fs.rmSync(path.join(root, d), { recursive: true, force: true }); } catch {}
  }
}
console.log(`安装包已复制到 package/（仅保留 ${version}）；解包目录：${out}/win-unpacked`);