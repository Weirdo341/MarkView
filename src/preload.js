const { contextBridge, ipcRenderer, webUtils } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const LISTEN_CHANNELS = new Set([
  'file:opened',
  'file:changed',
  'theme:set',
  'zoom:changed',
  'menu:find',
  'menu:toggle-sidebar',
  'pdf:prepare',
  'image:prepare',
  'font:set',
  'menu:save',
  'menu:undo',
  'menu:redo',
  'wide:set',
  'focus:set',
  'typewriter:set',
  'menu:toggle-edit',
  'menu:insert',
  'menu:typography',
  'menu:check-update',
  'find:result',
  'recent:cleared',
]);

contextBridge.exposeInMainWorld('api', {
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  openPath: (p) => ipcRenderer.invoke('file:open', p),
  getConfig: () => ipcRenderer.invoke('config:get'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  readDir: (p) => ipcRenderer.invoke('fs:tree', p),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  samplePath: () => ipcRenderer.invoke('app:samplePath'),
  version: () => ipcRenderer.invoke('app:version'),
  saveFile: (content) => ipcRenderer.invoke('file:save', content),
  pickImage: () => ipcRenderer.invoke('dialog:image'),
  savePaste: (payload) => ipcRenderer.invoke('image:savePaste', payload),
  relPath: (from, to) => path.relative(from, to),
  editChanged: (on) => ipcRenderer.send('edit:changed', on),
  exportPdf: () => ipcRenderer.invoke('pdf:export'),
  exportImage: (dims) => ipcRenderer.invoke('image:export', dims),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openLocal: (p) => ipcRenderer.invoke('shell:openPath', p),
  setZoom: (level) => ipcRenderer.invoke('zoom:set', level),
  find: (text, opts) => ipcRenderer.send('find:start', text, opts),
  stopFind: () => ipcRenderer.send('find:stop'),
  renderDone: (info) => ipcRenderer.send('render:done', info),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  resolvePath: (dir, rel) => path.resolve(dir, rel),
  toFileURL: (p) => pathToFileURL(p).href,
  basename: (p) => path.basename(p),
  dirname: (p) => path.dirname(p),
  extname: (p) => path.extname(p),
  on: (channel, listener) => {
    if (!LISTEN_CHANNELS.has(channel)) return () => {};
    const wrapped = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});