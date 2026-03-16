const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadURL: (url) => ipcRenderer.send('load-url', url),
  startStream: (config) => ipcRenderer.send('start-stream', config),
  stopStream: () => ipcRenderer.send('stop-stream'),
  onStreamStatus: (callback) => ipcRenderer.on('stream-status', (event, ...args) => callback(...args))
});
