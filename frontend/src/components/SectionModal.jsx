import { useState } from 'react';

export default function SectionModal({ section, onClose, onSavePrice, onUpgrade, onBuild }) {
  const [price, setPrice] = useState(section.price_per_ticket || 15);

  const isEmpty = section.section_type === 'empty';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
        {isEmpty ? (
          <>
            <h3 className="font-bold text-lg mb-2">Celda vacia ({section.row_pos},{section.col_pos})</h3>
            <p className="text-sm text-gray-600 mb-4">
              Construye una grada nueva nivel 1 aqui por <b>$500,000</b>.
            </p>
            <button
              onClick={() => onBuild(section.id)}
              className="w-full bg-green-600 text-white rounded py-2 font-semibold hover:bg-green-700"
            >
              Construir grada ($500,000)
            </button>
          </>
        ) : (
          <>
            <h3 className="font-bold text-lg mb-1">{section.label}</h3>
            <p className="text-sm text-gray-500 mb-4">
              Nivel {section.upgrade_level} · Capacidad {section.capacity}
            </p>

            <label className="block text-sm font-medium mb-1">Precio de entrada ($)</label>
            <div className="flex gap-2 mb-4">
              <input
                type="number"
                min="0"
                step="0.5"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="border rounded px-2 py-1 w-full"
              />
              <button
                onClick={() => onSavePrice(section.id, Number(price))}
                className="bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700"
              >
                Guardar
              </button>
            </div>

            <button
              onClick={() => onUpgrade(section.id)}
              className="w-full bg-amber-600 text-white rounded py-2 font-semibold hover:bg-amber-700"
            >
              Mejorar a nivel {section.upgrade_level + 1} (${Number(section.next_upgrade_cost).toLocaleString()})
            </button>
          </>
        )}

        <button onClick={onClose} className="w-full mt-3 text-gray-500 text-sm hover:underline">
          Cerrar
        </button>
      </div>
    </div>
  );
}
