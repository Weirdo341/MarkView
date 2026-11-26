import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deployUnpacked, validateStableApp } from '../scripts/stable-app.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'markview-stable-test-'));
const stableDir = path.join(root, 'stable');
const appDir = path.join(stableDir, 'app');
let clock = 0;
let failed = 0;

function source(name, exe = name, asar = name) {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'MarkView.exe'), exe);
  fs.writeFileSync(path.join(dir, 'resources', 'app.asar'), asar);
  return dir;
}

function deploy(extra = {}) {
  return deployUnpacked({
    source: source('source'),
    stableDir,
    version: '1.0.0',
    assertClosed: () => {},
    now: () => ++clock,
    pid: 1,
    log: () => {},
    ...extra,
  });
}

function check(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (err) {
    failed++;
    console.error('FAIL', name, err.message);
  }
}

try {
  check('fixed app path survives version updates', () => {
    const first = deploy({ source: source('one', 'one') });
    assert.equal(fs.readFileSync(path.join(appDir, 'MarkView.exe'), 'utf8'), 'one');
    const second = deploy({ source: source('two', 'two') });
    assert.equal(fs.lstatSync(appDir).isSymbolicLink(), true);
    assert.notEqual(second.target, first.target);
    assert.equal(fs.readFileSync(path.join(appDir, 'MarkView.exe'), 'utf8'), 'two');
    assert.equal(fs.existsSync(first.target), false);
  });

  check('process start before swap cancels deployment', () => {
    const before = fs.readlinkSync(appDir);
    let calls = 0;
    assert.throws(() => deploy({
      source: source('running', 'running'),
      assertClosed: () => {
        calls++;
        if (calls === 2) throw new Error('running');
      },
    }), /running/);
    assert.equal(calls, 2);
    assert.equal(fs.readlinkSync(appDir), before);
  });

  check('unsafe old junction target is never deleted', () => {
    fs.unlinkSync(appDir);
    const versionsDir = path.join(stableDir, 'versions');
    fs.symlinkSync(versionsDir, appDir, 'junction');
    const result = deploy({ source: source('safe', 'safe') });
    assert.equal(fs.existsSync(versionsDir), true);
    assert.equal(fs.existsSync(result.target), true);
    assert.equal(fs.readFileSync(path.join(appDir, 'MarkView.exe'), 'utf8'), 'safe');
  });

  check('invalid unpacked payload keeps current link', () => {
    const before = fs.readlinkSync(appDir);
    const bad = source('bad', '');
    assert.throws(() => deploy({ source: bad }), /MarkView.exe/);
    assert.equal(fs.readlinkSync(appDir), before);
  });

  check('registration failure rolls back to previous link', () => {
    const before = fs.readlinkSync(appDir);
    assert.throws(() => deploy({
      source: source('rollback', 'rollback'),
      commit: () => { throw new Error('registry failed'); },
    }), /registry failed/);
    assert.equal(fs.readlinkSync(appDir), before);
  });

  check('interrupted swap restores backup before validating new payload', () => {
    const before = fs.readlinkSync(appDir);
    fs.renameSync(appDir, path.join(stableDir, 'app-old'));
    assert.throws(() => deploy({ source: source('interrupted-bad', '') }), /MarkView.exe/);
    assert.equal(fs.readlinkSync(appDir), before);
  });

  check('registration-only mode requires a junction', () => {
    const before = fs.readlinkSync(appDir);
    fs.unlinkSync(appDir);
    fs.mkdirSync(path.join(appDir, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'MarkView.exe'), 'plain');
    fs.writeFileSync(path.join(appDir, 'resources', 'app.asar'), 'plain');
    assert.throws(() => validateStableApp(stableDir), /junction/);
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.symlinkSync(before, appDir, 'junction');
    assert.doesNotThrow(() => validateStableApp(stableDir));
  });
} finally {
  try { fs.unlinkSync(appDir); } catch {}
  try { fs.unlinkSync(path.join(stableDir, 'app-old')); } catch {}
  try { fs.unlinkSync(path.join(stableDir, 'app-new')); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
