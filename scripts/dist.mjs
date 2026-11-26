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
// 刷新 Windows 文件关联的稳定副本，避免关联指向会被清理的 package/ 产物
if (process.platform === 'win32' && platform === 'win') {
  try {
    const stableDir = path.join(process.env.LOCALAPPDATA, 'MarkView');
    fs.mkdirSync(stableDir, { recursive: true });
    const portable = fs.readdirSync(dest).filter((f) => /^MarkView-Portable-.*\.exe$/.test(f)).sort().pop();
    if (portable) {
      fs.copyFileSync(path.join(dest, portable), path.join(stableDir, 'MarkView.exe'));
      fs.copyFileSync(path.join(root, 'assets', 'icon.ico'), path.join(stableDir, 'MarkView.ico'));
      console.log('稳定关联副本已刷新：' + path.join(stableDir, 'MarkView.exe'));
    }
  } catch (err) {
    console.log('警告：稳定关联副本刷新失败（MarkView 可能正在运行）：' + err.message);
  }
  run(['scripts/associate.mjs']);
}
console.log(`安装包已复制到 package/（仅保留 ${version}）；平台：${platform}；解包目录：${out}`);