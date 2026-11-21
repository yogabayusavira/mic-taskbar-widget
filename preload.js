const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  quit: () => ipcRenderer.send('widget:quit'),
});
