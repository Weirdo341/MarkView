import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const results = {};
const check = (name, fn) => {
  try { results[name] = !!fn(); }
  catch (err) { results[name] = false; results[name + 'Error'] = String(err && err.message || err); }
};

check('macTargets', () => {
  const targets = pkg.build.mac.target;
  return targets.includes('dmg') && targets.includes('zip');
});
check('linuxTargets', () => {
  const targets = pkg.build.linux.target;
  return targets.includes('AppImage') && targets.includes('deb');
});
check('macAssociations', () => pkg.build.mac.fileAssociations.some((x) => x.ext.includes('md') && x.ext.includes('markdown')));
check('linuxAssociations', () => pkg.build.linux.fileAssociations.some((x) => x.ext.includes('md') && x.ext.includes('markdown') && x.mimeType === 'text/markdown'));
check('associateGuard', () => read('scripts/associate.mjs').includes("process.platform !== 'win32'"));
check('unassociateGuard', () => read('scripts/unassociate.mjs').includes("process.platform !== 'win32'"));
check('distPlatforms', () => read('scripts/dist.mjs').includes('--mac') && read('scripts/dist.mjs').includes('--linux') && read('scripts/dist.mjs').includes("process.platform === 'win32'"));
check('distArch', () => read('scripts/dist.mjs').includes('--arm64') && read('scripts/dist.mjs').includes('--x64'));
check('distAutoAssoc', () => read('scripts/dist.mjs').includes('scripts/associate.mjs'));
check('afterPackGuard', () => read('scripts/after-pack.mjs').includes("nodeName !== 'win32'") || read('scripts/after-pack.mjs').includes("nodeName === 'win32'"));
check('icnsGenerator', () => read('scripts/make-icon.mjs').includes('icns'));

try { execFileSync(process.execPath, ['scripts/make-icon.mjs'], { cwd: root, stdio: 'ignore' }); } catch {}
check('icnsFile', () => {
  const b = fs.readFileSync(path.join(root, 'assets', 'icon.icns'));
  return b.toString('ascii', 0, 4) === 'icns' && b.readUInt32BE(4) === b.length && b.readUInt32BE(8) > 0;
});

const failed = Object.entries(results).filter(([key, value]) => key.endsWith('Error') || value !== true);
console.log(JSON.stringify(results, null, 2));
console.log(failed.length ? `cross-platform check: FAIL (${failed.length})` : 'cross-platform check: PASS');
process.exit(failed.length ? 1 : 0);
