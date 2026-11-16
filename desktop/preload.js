// Marca la página como versión de escritorio: la ventana no tiene barra de título de
// Windows y el encabezado del juego (Navbar) hace de barra (arrastrable, con los botones
// de minimizar/maximizar/cerrar dibujados encima con los colores del juego).
// En pantalla completa esos botones nativos desaparecen: la clase `desktop-fullscreen`
// hace que el Navbar muestre los suyos (WindowControls), que llaman a `window.bmDesktop`.
const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-app');
});

// Llega en did-finish-load (DOM ya listo) y al entrar/salir de pantalla completa.
ipcRenderer.on('window:fullscreen', (_event, isFullScreen) => {
  document.documentElement.classList.toggle('desktop-fullscreen', Boolean(isFullScreen));
});

contextBridge.exposeInMainWorld('bmDesktop', {
  minimize: () => ipcRenderer.send('window:minimize'),
  exitFullScreen: () => ipcRenderer.send('window:exit-fullscreen'),
  close: () => ipcRenderer.send('window:close'),
});
