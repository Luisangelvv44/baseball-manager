import { Minus, Minimize2, X } from 'lucide-react';

// Botones de ventana de la versión de escritorio en pantalla completa (F11), donde Windows
// oculta los nativos. `window.bmDesktop` lo expone desktop/preload.js; en la web no existe
// y no se renderiza nada. Solo se ven con la clase `desktop-fullscreen` (index.css).
const BUTTON =
  'w-9 h-9 rounded-full flex items-center justify-center bg-gray-800 text-gray-300 transition-colors';

export default function WindowControls() {
  const desktop = typeof window !== 'undefined' ? window.bmDesktop : null;
  if (!desktop) return null;

  return (
    <div className="desktop-window-controls items-center gap-2 shrink-0 pl-2 border-l border-gray-700">
      <button type="button" onClick={desktop.minimize} title="Minimizar" aria-label="Minimizar"
        className={`${BUTTON} hover:bg-gray-700 hover:text-white`}>
        <Minus size={18} aria-hidden="true" />
      </button>
      <button type="button" onClick={desktop.exitFullScreen} title="Salir de pantalla completa (F11)"
        aria-label="Salir de pantalla completa" className={`${BUTTON} hover:bg-gray-700 hover:text-white`}>
        <Minimize2 size={16} aria-hidden="true" />
      </button>
      <button type="button" onClick={desktop.close} title="Cerrar" aria-label="Cerrar"
        className={`${BUTTON} hover:bg-red-600 hover:text-white`}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
