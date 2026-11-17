import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import pngToIco from 'png-to-ico';

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
fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), await pngToIco(buffers));
console.log('icon.ico written:', sizes.join(','));