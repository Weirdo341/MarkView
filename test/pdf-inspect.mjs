import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = process.argv[2] || 'probe.pdf';
const raw = fs.readFileSync(file).toString('latin1');

const fonts = [...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-]+)/g)].map((m) => m[1]);
const subtypes = [...raw.matchAll(/\/Subtype\s*\/(Type0|Type1|Type3|TrueType|CIDFontType0|CIDFontType2|Image)/g)].map((m) => m[1]);
const count = (re) => (raw.match(re) || []).length;
console.log('BaseFont:', [...new Set(fonts)].join(', '));
console.log('Subtypes:', subtypes.join(', '));
console.log('FontFile(ttf):', count(/\/FontFile2\b/g), 'FontFile3(cff):', count(/\/FontFile3\b/g), 'FontFile(type1):', count(/\/FontFile\b/g), 'Type3:', count(/\/Type3\b/g), 'Image:', count(/\/Subtype\s*\/Image/g));

const doc = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(file)),
  standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
}).promise;
const page = await doc.getPage(1);
const scale = 3;
const viewport = page.getViewport({ scale });
const canvas = createCanvas(viewport.width, viewport.height);
await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

fs.mkdirSync('test/output', { recursive: true });
const crops = [
  ['crop-top.png', 0, 0, viewport.width, 900],
  ['crop-mid.png', 0, 900, viewport.width, 900],
];
for (const [name, x, y, w, h] of crops) {
  const c = createCanvas(w, h);
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  fs.writeFileSync(path.join('test/output', name), c.toBuffer('image/png'));
}
console.log('crops written at scale', scale);