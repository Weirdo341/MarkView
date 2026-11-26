import fs from 'node:fs';
import path from 'node:path';

// 激进瘦身：删除本应用不用的 WebGPU 着色器编译组件。
// 注意：ffmpeg.dll 是 Electron 43 启动硬依赖（实测删除后主进程挂起），不可裁剪。
const PRUNE = ['dxcompiler.dll', 'dxil.dll'];

export default async function afterPack(context) {
  if (context.packager.platform.nodeName !== 'win32') return;
  for (const name of PRUNE) {
    const p = path.join(context.appOutDir, name);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}