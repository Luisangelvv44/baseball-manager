// Marca la página como versión de escritorio: la ventana no tiene barra de título de
// Windows y el encabezado del juego (Navbar) hace de barra (arrastrable, con los botones
// de minimizar/maximizar/cerrar dibujados encima con los colores del juego).
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-app');
});
