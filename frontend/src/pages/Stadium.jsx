import { useEffect, useState } from 'react';
import { api } from '../api.js';
import StadiumGrid from '../components/StadiumGrid.jsx';
import SectionModal from '../components/SectionModal.jsx';
import { useTeam } from '../context/TeamContext.jsx';

// Index = current floor count; value = cost to expand to the next floor
const FLOOR_COSTS = [null, 2_000_000, 4_000_000, 8_000_000];

export default function Stadium() {
  const { refreshTeam } = useTeam();
  const [sections, setSections] = useState([]);
  const [floors, setFloors] = useState(1);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const data = await api.getStadium();
    setSections(data.sections);
    setFloors(data.floors);
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
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleBuild(id) {
    try {
      const res = await api.buildSection(id);
      setMessage(`Grada construida. Costo: $${res.cost.toLocaleString()}.`);
      setSelected(null);
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleExpandFloor() {
    try {
      const res = await api.expandStadiumFloor();
      setMessage(`Estadio expandido a planta ${res.newFloors}. Costo: $${res.cost.toLocaleString()}.`);
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  const nextFloorCost = floors < 4 ? FLOOR_COSTS[floors] : null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Tu Estadio</h2>
      <p className="text-gray-600 text-sm">
        Haz click en una grada para cambiar el precio o mejorarla (el costo de mejora se duplica en cada nivel),
        o en una celda vacia para construir una grada nueva.
      </p>

      {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>}

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-600">Planta {floors} de 4</span>
          {floors < 4 ? (
            <button
              onClick={handleExpandFloor}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded"
            >
              Expandir a Planta {floors + 1} — ${nextFloorCost.toLocaleString()}
            </button>
          ) : (
            <span className="text-sm text-gray-500 italic">Estadio al maximo</span>
          )}
        </div>
        <StadiumGrid sections={sections} floors={floors} onCellClick={setSelected} />
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
