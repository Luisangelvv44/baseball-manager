import { useEffect, useState } from 'react';
import { api } from '../api.js';

const GAMES_PER_SEASON = 30;

function estimatedPay(fanBase, pricePerFan, seasons = 1) {
  return Math.round(fanBase * Number(pricePerFan) * GAMES_PER_SEASON * seasons);
}

export default function Broadcast() {
  const [season, setSeason] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [contract, setContract] = useState(null);
  const [offers, setOffers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    // Cargar equipo de forma independiente para que el estimado siempre sea visible
    try {
      const team = await api.getMyTeam();
      setMyTeam(team);
    } catch (_) {}

    try {
      const [s, c, o, comp] = await Promise.all([
        api.getSeason(),
        api.getBroadcastContract(),
        api.getBroadcastOffers(),
        api.getBroadcastCompanies(),
      ]);
      setSeason(s);
      setContract(c);
      setOffers(o);
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
      setMessage('Oferta aceptada. Las transmisoras seleccionarán la mejor al cerrar la ventana.');
      await load();
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

  const inNegotiationWindow = season && season.current_day <= 3 && season.status === 'active';
  const daysLeft = season ? Math.max(0, 3 - season.current_day + 1) : 0;

  if (loading) {
    return (
      <div className="p-6 text-gray-500">Cargando...</div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800">Contratos de Transmisión</h1>

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {/* Contrato activo */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Tu contrato actual</h2>
        {contract ? (
          <div className="bg-white border rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs font-bold px-2 py-1 rounded ${contract.company.type === 'TV' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                {contract.company.type}
              </span>
              <span className="text-xl font-bold text-gray-800">{contract.company.name}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Precio por fan</p>
                <p className="font-semibold">${Number(contract.price_per_fan).toFixed(4)}/fan/juego</p>
              </div>
              <div>
                <p className="text-gray-500">Temporadas restantes</p>
                <p className="font-semibold">{contract.seasons_remaining} / {contract.seasons_total}</p>
              </div>
              <div>
                <p className="text-gray-500">Base de fans actual</p>
                <p className="font-semibold">{myTeam?.fan_base?.toLocaleString() ?? '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Próximo pago estimado</p>
                <p className="font-semibold text-green-700">
                  ${myTeam ? estimatedPay(myTeam.fan_base, contract.price_per_fan).toLocaleString() : '—'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-5 text-gray-500 text-sm">
            No tienes ningún contrato de transmisión activo.
          </div>
        )}
      </section>

      {/* Ventana de negociación */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-700">Ofertas recibidas</h2>
          {inNegotiationWindow && (
            <span className={`text-xs font-bold px-2 py-1 rounded ${daysLeft <= 1 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {daysLeft === 1 ? 'Cierra hoy' : `${daysLeft}d restantes`}
            </span>
          )}
        </div>

        {!season && (
          <p className="text-gray-500 text-sm">No hay temporada activa.</p>
        )}

        {season && !inNegotiationWindow && (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-5 text-gray-500 text-sm">
            La ventana de negociación está cerrada. Las ofertas de transmisión llegan en los primeros 3 días de cada pretemporada.
          </div>
        )}

        {inNegotiationWindow && offers.length === 0 && (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-5 text-gray-500 text-sm">
            {contract
              ? 'Ya tienes un contrato activo — las transmisoras no envían ofertas a equipos con contrato vigente.'
              : 'No has recibido ofertas esta temporada.'}
          </div>
        )}

        {inNegotiationWindow && offers.length > 0 && (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {offers.map((offer) => (
              <div key={offer.id} className="bg-white border rounded-lg p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${offer.company.type === 'TV' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                    {offer.company.type}
                  </span>
                  <span className="font-semibold text-gray-800">{offer.company.name}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">Precio por fan</p>
                    <p className="font-semibold">${Number(offer.price_per_fan).toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Duración</p>
                    <p className="font-semibold">{offer.seasons} temporada{offer.seasons > 1 ? 's' : ''}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs">Ingreso total estimado</p>
                    <p className="font-semibold text-green-700 text-base">
                      ${myTeam ? estimatedPay(myTeam.fan_base, offer.price_per_fan, offer.seasons).toLocaleString() : '—'}
                    </p>
                    <p className="text-gray-400 text-xs">
                      ${myTeam ? estimatedPay(myTeam.fan_base, offer.price_per_fan).toLocaleString() : '—'}/temporada
                    </p>
                  </div>
                </div>

                {contract ? (
                  <p className="text-xs text-gray-400 italic">No puedes aceptar — ya tienes un contrato activo.</p>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleAccept(offer.id)}
                      className="flex-1 bg-green-600 text-white text-sm py-1.5 rounded hover:bg-green-700 transition disabled:opacity-50"
                    >
                      Aceptar
                    </button>
                    <button
                      onClick={() => handleReject(offer.id)}
                      className="flex-1 bg-gray-200 text-gray-700 text-sm py-1.5 rounded hover:bg-gray-300 transition"
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Directorio de empresas */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Empresas transmisoras</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {['TV', 'RADIO'].map((type) => (
            <div key={type}>
              <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">
                {type === 'TV' ? 'Televisión' : 'Radio'}
              </h3>
              <div className="space-y-1">
                {companies
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-white border rounded px-3 py-2 text-sm">
                      <span className="font-medium text-gray-800">{c.name}</span>
                      <div className="flex items-center gap-3 text-right">
                        <span className="text-gray-500 text-xs">${Number(c.price_per_fan).toFixed(4)}/fan</span>
                        <span className="text-xs text-gray-400">
                          {c.contracts.length}/{2} contratos
                        </span>
                        {c.contracts.length > 0 && (
                          <div className="flex flex-col text-xs text-gray-400">
                            {c.contracts.map((ct) => (
                              <span key={ct.id}>{ct.team.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
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
