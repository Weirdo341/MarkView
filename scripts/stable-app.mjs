import fs from 'node:fs';
import path from 'node:path';

function lstatExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function removeEntry(target) {
  if (!lstatExists(target)) return;
  if (fs.lstatSync(target).isSymbolicLink()) fs.unlinkSync(target);
  else fs.rmSync(target, { recursive: true, force: true });
}

function bestEffortRemove(target) {
  try { removeEntry(target); } catch {}
}

export function validateUnpacked(dir) {
  for (const relative of ['MarkView.exe', path.join('resources', 'app.asar')]) {
    const target = path.join(dir, relative);
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size === 0) throw new Error('无效的 win-unpacked 文件：' + target);
  }
}

export function validateStableApp(stableDir) {
  const appDir = path.join(stableDir, 'app');
  if (!lstatExists(appDir) || !fs.lstatSync(appDir).isSymbolicLink()) {
    throw new Error('固定 app 路径不是 junction：' + appDir);
  }
  validateUnpacked(appDir);
}

function recoverInterruptedSwap({ stableDir, appDir, versionsDir, backupLink }) {
  if (lstatExists(appDir) || !lstatExists(backupLink)) return;
  if (!fs.lstatSync(backupLink).isSymbolicLink()) throw new Error('中断备份不是 junction：' + backupLink);
  const target = path.resolve(stableDir, fs.readlinkSync(backupLink));
  const relative = path.relative(versionsDir, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative) || path.dirname(target) !== versionsDir) {
    throw new Error('中断备份目标不在 versions 下：' + target);
  }
  validateUnpacked(target);
  fs.renameSync(backupLink, appDir);
}

export function deployUnpacked({
  source,
  stableDir,
  version,
  assertClosed,
  now = Date.now,
  pid = process.pid,
  commit,
  log = console.log,
}) {
  assertClosed();
  const appDir = path.join(stableDir, 'app');
  const versionsDir = path.join(stableDir, 'versions');
  const pendingLink = path.join(stableDir, 'app-new');
  const backupLink = path.join(stableDir, 'app-old');
  fs.mkdirSync(versionsDir, { recursive: true });
  recoverInterruptedSwap({ stableDir, appDir, versionsDir, backupLink });
  validateUnpacked(source);
  const target = path.join(versionsDir, `${version}-${now()}-${pid}`);
  try {
    fs.cpSync(source, target, { recursive: true, force: true });
    validateUnpacked(target);
  } catch (err) {
    bestEffortRemove(target);
    throw err;
  }

  try {
    removeEntry(pendingLink);
    fs.symlinkSync(target, pendingLink, 'junction');
  } catch (err) {
    bestEffortRemove(pendingLink);
    bestEffortRemove(target);
    throw err;
  }

  let oldTarget = null;
  let movedOld = false;
  try {
    assertClosed();
    if (lstatExists(appDir)) {
      if (!fs.lstatSync(appDir).isSymbolicLink()) {
        throw new Error('固定 app 路径被非链接目录占用：' + appDir);
      }
      oldTarget = path.resolve(stableDir, fs.readlinkSync(appDir));
      removeEntry(backupLink);
      fs.renameSync(appDir, backupLink);
      movedOld = true;
    }
    fs.renameSync(pendingLink, appDir);
  } catch (err) {
    if (movedOld && !lstatExists(appDir) && lstatExists(backupLink)) {
      fs.renameSync(backupLink, appDir);
    }
    bestEffortRemove(pendingLink);
    bestEffortRemove(target);
    throw err;
  }

  try {
    commit?.();
  } catch (err) {
    removeEntry(appDir);
    if (movedOld) fs.renameSync(backupLink, appDir);
    bestEffortRemove(target);
    throw err;
  }

  bestEffortRemove(backupLink);
  if (oldTarget) {
    const relative = path.relative(versionsDir, oldTarget);
    const safe = relative && relative !== '..' && !relative.startsWith('..' + path.sep) &&
      !path.isAbsolute(relative) && path.dirname(oldTarget) === versionsDir && oldTarget !== target;
    if (!safe) {
      log('提示：旧版链接目标不在 versions 下，已保留：' + oldTarget);
    } else {
      try { removeEntry(oldTarget); } catch {
        log('提示：旧版文件仍被系统占用，已保留：' + oldTarget);
      }
    }
  }
  log('稳定解包目录已更新：' + appDir + ' → ' + target);
  return { appDir, target, oldTarget };
}
