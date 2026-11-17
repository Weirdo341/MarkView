import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64">' +
    '<rect x="6" y="4" width="52" height="56" rx="8" fill="#0969da"/>' +
    '<path d="M16 44V20l8 12 8-12v24" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M42 36l6 8 6-8M48 20v24" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>'
);

const img = await loadImage(svg);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const buffers = sizes.map((size) => {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(img, 0, 0, size, size);
  return canvas.toBuffer('image/png');
});

fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), buffers[buffers.length - 1]);
fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), pngIco(buffers, sizes));
console.log('icon.ico written:', sizes.join(','));

// ICO container with PNG-compressed entries (Vista+); avoids an extra dependency.
function pngIco(pngs, dims) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = 6 + entries.length;
  pngs.forEach((buf, i) => {
    const d = dims[i] >= 256 ? 0 : dims[i];
    const o = i * 16;
    entries.writeUInt8(d, o);
    entries.writeUInt8(d, o + 1);
    entries.writeUInt16LE(1, o + 4);
    entries.writeUInt16LE(32, o + 6);
    entries.writeUInt32LE(buf.length, o + 8);
    entries.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, entries, ...pngs]);
}