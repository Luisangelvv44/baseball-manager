import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import { formatCompactMoney } from '../utils/formatMoney.js';

const TYPES = [
  { key: 'TV', label: 'Televisión', badge: 'bg-blue-100 text-blue-800' },
  { key: 'RADIO', label: 'Radio', badge: 'bg-purple-100 text-purple-800' },
];

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const perFan = (p) => `$${Number(p).toFixed(4)}`;

function TypeBadge({ type }) {
  const t = TYPES.find((x) => x.key === type);
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${t?.badge ?? ''}`}>{type}</span>;
}

export default function Broadcast() {
  const { refreshTeam } = useTeam();
  const [season, setSeason] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [windowEndDay, setWindowEndDay] = useState(10);
  const [companies, setCompanies] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [s, c, o, comp] = await Promise.all([
        api.getSeason(),
        api.getBroadcastContracts(),
        api.getBroadcastOffers(),
        api.getBroadcastCompanies(),
      ]);
      setSeason(s);
      setContracts(c);
      setOffers(o.offers);
      setWindowEndDay(o.windowEndDay);
      setCompanies(comp);
    } catch (e) {
      setError('Error al cargar los datos de transmisión.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAccept(id) {
    setMessage('');
    setError('');
    try {
      await api.acceptOffer(id);
      setMessage('¡Contrato firmado! Ya recibiste el pago del primer año.');
      await Promise.all([load(), refreshTeam()]);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleReject(id) {
    setMessage('');
    setError('');
    try {
      await api.rejectOffer(id);
      setMessage('Oferta rechazada.');
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const inNegotiationWindow = season && season.status === 'active' && season.current_day <= windowEndDay;
  const daysLeft = season ? Math.max(0, windowEndDay - season.current_day + 1) : 0;
  const contractByType = Object.fromEntries(contracts.map((c) => [c.company.type, c]));

  if (loading) {
    return <div className="p-6 text-gray-500">Cargando...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800">Contratos de Transmisión</h1>

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">{error}</div>
      )}

      {/* Contratos activos: uno de TV y uno de radio */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Tus contratos</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {TYPES.map(({ key, label }) => {
            const contract = contractByType[key];
            if (!contract) {
              return (
                <div key={key} className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-5 text-gray-500 text-sm">
                  Sin contrato de {label.toLowerCase()}.
                </div>
              );
            }
            const annual = contract.annual_payment;
            return (
              <div key={key} className="bg-white border rounded-lg p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <TypeBadge type={key} />
                  <span className="text-lg font-bold text-gray-800">{contract.company.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Precio por fan</p>
                    <p className="font-semibold">{perFan(contract.price_per_fan)}/fan/partido</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Temporadas restantes</p>
                    <p className="font-semibold">{contract.seasons_remaining} / {contract.seasons_total}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Pago anual</p>
                    <p className="font-semibold text-green-700">{annual != null ? money(annual) : 'Según fan base'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Total del contrato</p>
                    <p className="font-semibold">{contract.total_value != null ? money(contract.total_value) : '—'}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Guerra de precios */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-700">Ofertas recibidas</h2>
          {inNegotiationWindow && (
            <span className={`text-xs font-bold px-2 py-1 rounded ${daysLeft <= 1 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {daysLeft === 1 ? 'Cierra hoy' : `${daysLeft}d restantes`}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Las transmisoras se pelean tu equipo: cada día las que van perdiendo pueden subir su precio por fan por partido.
          Puedes firmar cuando quieras hasta el día {windowEndDay}; las ofertas que no aceptes expiran al cerrar la ventana.
        </p>

        {!season && <p className="text-gray-500 text-sm">No hay temporada activa.</p>}

        {season && !inNegotiationWindow && (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-5 text-gray-500 text-sm">
            La ventana de negociación está cerrada. Las transmisoras pujan en los primeros {windowEndDay} días de cada pretemporada.
          </div>
        )}

        {inNegotiationWindow && (
          <div className="space-y-5">
            {TYPES.map(({ key, label }) => {
              const list = offers.filter((o) => o.company.type === key);
              return (
                <div key={key}>
                  <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">{label}</h3>
                  {contractByType[key] ? (
                    <p className="text-sm text-gray-400 italic">Ya tienes un contrato de {label.toLowerCase()} vigente.</p>
                  ) : list.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Ninguna empresa de {label.toLowerCase()} te ha hecho una oferta.</p>
                  ) : (
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {list.map((offer) => (
                        <div
                          key={offer.id}
                          className={`bg-white border rounded-lg p-4 shadow-sm space-y-3 ${offer.is_best ? 'border-green-400 ring-1 ring-green-200' : ''}`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <TypeBadge type={key} />
                            <span className="font-semibold text-gray-800">{offer.company.name}</span>
                            {offer.is_best && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-100 text-green-800">Mejor oferta</span>
                            )}
                            {offer.raised_last_day && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700">▲ Subió hoy</span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-gray-500 text-xs">Por fan por partido</p>
                              <p className="font-semibold">{perFan(offer.price_per_fan)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs">Duración</p>
                              <p className="font-semibold">{offer.seasons} temporada{offer.seasons > 1 ? 's' : ''}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-gray-500 text-xs">Total del contrato</p>
                              <p className="font-semibold text-green-700 text-base">{money(offer.total_value)}</p>
                              <p className="text-gray-400 text-xs">{money(offer.annual_payment)}/temporada</p>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleAccept(offer.id)}
                              className="flex-1 bg-green-600 text-white text-sm py-1.5 rounded hover:bg-green-700 transition"
                            >
                              Firmar
                            </button>
                            <button
                              onClick={() => handleReject(offer.id)}
                              className="flex-1 bg-gray-200 text-gray-700 text-sm py-1.5 rounded hover:bg-gray-300 transition"
                            >
                              Rechazar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Directorio de empresas */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Empresas transmisoras</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {TYPES.map(({ key, label }) => (
            <div key={key}>
              <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">{label}</h3>
              <div className="space-y-1">
                {companies
                  .filter((c) => c.type === key)
                  .map((c) => (
                    <div key={c.id} className="bg-white border rounded px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-800">{c.name}</span>
                        <span className="text-xs font-semibold text-gray-700">{formatCompactMoney(Number(c.money))}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mt-0.5">
                        <span>
                          Base {perFan(c.price_per_fan)}/fan · {c.rank_limit >= 16 ? 'Todos los equipos' : `Solo top ${c.rank_limit} en reputación`}
                        </span>
                        <span className="text-green-700">+{formatCompactMoney(Number(c.season_earnings))} esta temporada</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        Audiencia total: <span className="font-semibold">{(c.audience ?? 0).toLocaleString()} fans</span>
                      </div>
                      {c.contracts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.contracts.map((ct) => (
                            <TeamBadge key={ct.id} name={ct.team.name} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
