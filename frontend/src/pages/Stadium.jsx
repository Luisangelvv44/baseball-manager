import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from '../api.js';
import StadiumGrid from '../components/StadiumGrid.jsx';
import SectionModal from '../components/SectionModal.jsx';
import { useTeam } from '../context/TeamContext.jsx';

// PixiJS pesa ~450 kB: la vista cenital se carga solo al abrir el estadio
const StadiumView = lazy(() => import('../stadium/StadiumView.jsx'));

// Index = current floor count; value = cost to expand to the next floor
const FLOOR_COSTS = [null, 2_000_000, 4_000_000, 8_000_000];

const TABS = [
  ['view', 'Vista'],
  ['stands', 'Gradas'],
];

export default function Stadium() {
  const { refreshTeam } = useTeam();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('view');
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const fresh = await api.getStadium();
    setData(fresh);
    return fresh;
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

  // Devuelve los datos frescos para que la vista anime la obra hacia el nuevo estado
  async function handleFacilityUpgrade(key) {
    await api.upgradeFacility(key);
    const [fresh] = await Promise.all([load(), refreshTeam()]);
    return fresh;
  }

  if (!data) return <div className="text-gray-500">Cargando estadio...</div>;

  const { floors, sections } = data;
  const nextFloorCost = floors < 4 ? FLOOR_COSTS[floors] : null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Tu Estadio</h2>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
              tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>}

      {tab === 'view' ? (
        <Suspense fallback={<div className="text-gray-500 text-sm">Cargando vista...</div>}>
          <StadiumView
            data={data}
            onUpgradeFacility={handleFacilityUpgrade}
            onManageStands={() => setTab('stands')}
          />
        </Suspense>
      ) : (
        <>
          <p className="text-gray-600 text-sm">
            Haz click en una grada para cambiar el precio o mejorarla (el costo de mejora se duplica en cada nivel,
            maximo nivel {data.max_grandstand_level}), o en una celda vacia para construir una grada nueva.
          </p>

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
            <StadiumGrid
              sections={sections}
              floors={floors}
              maxLevel={data.max_grandstand_level}
              onCellClick={setSelected}
            />
          </div>
        </>
      )}

      {selected && (
        <SectionModal
          section={selected}
          maxLevel={data.max_grandstand_level}
          onClose={() => setSelected(null)}
          onSavePrice={handleSavePrice}
          onUpgrade={handleUpgrade}
          onBuild={handleBuild}
        />
      )}
    </div>
  );
}
