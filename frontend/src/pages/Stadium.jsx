import { useEffect, useState } from 'react';
import { api } from '../api.js';
import StadiumGrid from '../components/StadiumGrid.jsx';
import SectionModal from '../components/SectionModal.jsx';

export default function Stadium() {
  const [sections, setSections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const data = await api.getStadium();
    setSections(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSavePrice(id, price) {
    try {
      await api.setSectionPrice(id, price);
      setMessage('Precio actualizado.');
      setSelected(null);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleUpgrade(id) {
    try {
      const res = await api.upgradeSection(id);
      setMessage(`Mejorada a nivel ${res.newLevel}. Costo: $${res.cost.toLocaleString()}.`);
      setSelected(null);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleBuild(id) {
    try {
      const res = await api.buildSection(id);
      setMessage(`Grada construida. Costo: $${res.cost.toLocaleString()}.`);
      setSelected(null);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Tu Estadio</h2>
      <p className="text-gray-600 text-sm">
        Haz click en una grada para cambiar el precio o mejorarla (el costo de mejora se duplica en cada nivel),
        o en una celda vacia para construir una grada nueva.
      </p>

      {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>}

      <div className="bg-white rounded-lg shadow p-6">
        <StadiumGrid sections={sections} onCellClick={setSelected} />
      </div>

      {selected && (
        <SectionModal
          section={selected}
          onClose={() => setSelected(null)}
          onSavePrice={handleSavePrice}
          onUpgrade={handleUpgrade}
          onBuild={handleBuild}
        />
      )}
    </div>
  );
}
