const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('logixtDesktop', {
  getDatabaseLocation: () => ipcRenderer.invoke('desktop:get-database-location'),
  selectDatabaseLocation: () => ipcRenderer.invoke('desktop:select-database-location')
});
