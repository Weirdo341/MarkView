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
const icnsSizes = [16, 32, 64, 128, 256, 512, 1024];
const icnsBuffers = icnsSizes.map((size) => {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(img, 0, 0, size, size);
  return canvas.toBuffer('image/png');
});
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), icnsBuffers[5]);
fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), pngIco(buffers, sizes));
fs.writeFileSync(path.join(root, 'assets', 'icon.icns'), pngIcns(icnsBuffers));
console.log('icons written: ico', sizes.join(','), '· icns', icnsSizes.join(','));

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

// ICNS container with PNG chunks (modern macOS).
function pngIcns(pngs) {
  const types = ['icp4', 'icp5', 'icp6', 'ic07', 'ic08', 'ic09', 'ic10'];
  const chunks = pngs.map((buf, i) => {
    const head = Buffer.alloc(8);
    head.write(types[i], 0, 4, 'ascii');
    head.writeUInt32BE(buf.length + 8, 4);
    return Buffer.concat([head, buf]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'ascii');
  head.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}