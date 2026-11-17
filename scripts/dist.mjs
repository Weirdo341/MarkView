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
console.log(`安装包已复制到 package/；解包目录：${out}/win-unpacked`);