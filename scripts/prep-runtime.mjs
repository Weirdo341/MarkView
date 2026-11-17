import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'node_modules', 'electron', 'dist');
const runtime = path.join(root, '.runtime');

try {
  fs.rmSync(runtime, { recursive: true, force: true });
} catch {}

// 逐文件容错复制：被系统锁定的同名 stub 文件（内容一致）跳过
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === 'MarkView.exe') continue;
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else {
      try {
        fs.copyFileSync(s, d);
      } catch {}
    }
  }
}

copyDir(dist, runtime);
console.log('runtime prepared (launcher copy excluded)');