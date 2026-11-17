import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = process.argv[2] || 'sample.pdf';
const maxPages = Number(process.argv[3]) || 4;
const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjs.getDocument({
  data,
  standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/',
}).promise;

console.log('pages:', doc.numPages);
const outDir = 'test/output';
fs.mkdirSync(outDir, { recursive: true });
for (let i = 1; i <= Math.min(maxPages, doc.numPages); i++) {
  const page = await doc.getPage(i);
  const viewport = page.getViewport({ scale: 1.4 });
  const canvas = createCanvas(viewport.width, viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  fs.writeFileSync(path.join(outDir, `page-${i}.png`), canvas.toBuffer('image/png'));
  console.log('rendered page', i);
}