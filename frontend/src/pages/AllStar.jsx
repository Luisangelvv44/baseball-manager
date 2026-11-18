import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import TeamBadge from '../components/TeamBadge.jsx';

const HITS = new Set(['1B', '2B', '3B', 'HR']);

// Carreras por entrada y hits por conferencia a partir de los eventos del juego
function lineScore(game) {
  const innings = Math.max(9, ...game.events.map((e) => e.inning));
  const rows = {};
  for (const conf of [game.away_conference, game.home_conference]) {
    rows[conf] = { runs: Array(innings).fill(null), hits: 0 };
  }
  for (const e of game.events) {
    const row = rows[e.batting_team_id];
    if (!row) continue;
    row.runs[e.inning - 1] = (row.runs[e.inning - 1] ?? 0) + (e.runs_scored || 0);
    if (HITS.has(e.result)) row.hits += 1;
  }
  return { innings, rows };
}

function batterLines(events) {
  const lines = new Map();
  for (const e of events) {
    const l = lines.get(e.player_id) || { ab: 0, h: 0, hr: 0, rbi: 0 };
    if (e.result !== 'BB') l.ab += 1;
    if (HITS.has(e.result)) l.h += 1;
    if (e.result === 'HR') l.hr += 1;
    l.rbi += e.runs_scored || 0;
    lines.set(e.player_id, l);
  }
  return lines;
}

function SquadCard({ conference, squad, isHome, lines, mvpId, userTeamId }) {
  if (!squad) {
    return (
      <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-400">
        {conference}: no hay suficientes jugadores sanos para armar la selección.
      </div>
    );
  }
  const row = (p, isPitcher) => {
    const l = lines?.get(p.id);
    const mine = p.team_id === userTeamId;
    return (
      <tr key={p.id} className={`border-t ${mine ? 'bg-blue-50' : ''}`}>
        <td className="p-1.5 text-gray-500 w-10">{isPitcher ? 'P' : p.position}</td>
        <td className="p-1.5">
          <span className="font-medium">{p.first_name} {p.last_name}</span>
          {p.id === mvpId && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-bold">MVP</span>}
        </td>
        <td className="p-1.5">{p.team_name && <TeamBadge name={p.team_name} />}</td>
        <td className="p-1.5 text-right text-gray-500">{p.current_skill}</td>
        {lines && (
          <td className="p-1.5 text-right whitespace-nowrap">
            {isPitcher ? '—' : l ? `${l.h}-${l.ab}${l.hr ? `, ${l.hr} HR` : ''}${l.rbi ? `, ${l.rbi} CI` : ''}` : '0-0'}
          </td>
        )}
      </tr>
    );
  };
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-bold mb-2">
        Conferencia {conference} <span className="text-xs font-normal text-gray-500">({isHome ? 'local' : 'visitante'})</span>
      </h3>
      <table className="w-full text-sm">
        <thead className="text-gray-500 text-left text-xs">
          <tr>
            <th className="p-1.5">Pos</th>
            <th className="p-1.5">Jugador</th>
            <th className="p-1.5">Equipo</th>
            <th className="p-1.5 text-right">Destreza</th>
            {lines && <th className="p-1.5 text-right">Bateo</th>}
          </tr>
        </thead>
        <tbody>
          {row(squad.pitcher, true)}
          {squad.players.map((p) => row(p, false))}
        </tbody>
      </table>
    </div>
  );
}

export default function AllStar() {
  const { myTeam, refreshTeam } = useTeam();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);

  async function load() {
    try {
      setData(await api.getAllStar());
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selectedId) return setSelectedGame(null);
    api.getAllStarGame(selectedId).then(setSelectedGame).catch((err) => setError(err.message));
  }, [selectedId]);

  async function handlePlay() {
    setPlaying(true);
    setError('');
    try {
      await api.playAllStar();
      refreshTeam?.();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPlaying(false);
    }
  }

  if (!data) return <div className="text-center py-10 text-gray-500">{error || 'Cargando...'}</div>;

  const { allStarBreak, preview, currentDay, seasonStatus, history } = data;
  const game = selectedGame || data.game;
  const userTeamId = myTeam?.id;
  const isToday = allStarBreak && seasonStatus === 'active' && currentDay === allStarBreak.allStarDay;

  let body = null;
  if (game) {
    const { innings, rows } = lineScore(game);
    const lines = batterLines(game.events);
    const winner = game.home_score === game.away_score
      ? null
      : game.home_score > game.away_score ? game.home_conference : game.away_conference;
    body = (
      <>
        <div className="bg-gray-900 text-white rounded-lg shadow p-4 overflow-x-auto">
          <p className="text-sm text-gray-300 mb-2">
            {winner ? `Gana la conferencia ${winner}` : 'Empate'} · Día {game.day}
          </p>
          <table className="text-sm font-mono">
            <thead className="text-gray-400">
              <tr>
                <th className="pr-4 text-left font-sans">Conferencia</th>
                {Array.from({ length: innings }, (_, i) => <th key={i} className="px-2">{i + 1}</th>)}
                <th className="px-2 text-amber-300">C</th>
                <th className="px-2">H</th>
              </tr>
            </thead>
            <tbody>
              {[game.away_conference, game.home_conference].map((conf) => (
                <tr key={conf}>
                  <td className="pr-4 font-sans font-semibold">{conf}</td>
                  {rows[conf].runs.map((r, i) => <td key={i} className="px-2 text-center">{r ?? (i < game.final_inning ? 'x' : '')}</td>)}
                  <td className="px-2 text-center font-bold text-amber-300">
                    {conf === game.home_conference ? game.home_score : game.away_score}
                  </td>
                  <td className="px-2 text-center">{rows[conf].hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {[game.away_conference, game.home_conference].map((conf) => (
            <SquadCard
              key={conf}
              conference={conf}
              squad={game.rosters[conf]}
              isHome={conf === game.home_conference}
              lines={lines}
              mvpId={game.mvp_player_id}
              userTeamId={userTeamId}
            />
          ))}
        </div>
      </>
    );
  } else if (preview) {
    const confs = Object.keys(preview.squads);
    body = (
      <>
        <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            {isToday
              ? 'Convocatoria final: los mejores jugadores sanos de cada conferencia. ¡El juego es hoy!'
              : `Convocatoria provisional (los mejores jugadores sanos de cada conferencia hoy). Se juega el día ${allStarBreak.allStarDay}.`}
          </p>
          {isToday && (
            <button
              onClick={handlePlay}
              disabled={playing}
              className="bg-amber-500 text-white rounded px-4 py-1.5 text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              {playing ? 'Jugando...' : 'Jugar Juego de Estrellas'}
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {confs.map((conf) => (
            <SquadCard
              key={conf}
              conference={conf}
              squad={preview.squads[conf]}
              isHome={conf === preview.homeConference}
              userTeamId={userTeamId}
            />
          ))}
        </div>
      </>
    );
  } else if (!allStarBreak) {
    body = (
      <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-500">
        Esta temporada no tiene pausa del Juego de Estrellas. Empieza con la próxima temporada.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">⭐ Juego de Estrellas</h2>
        <Link to="/derby" className="text-sm text-blue-600 hover:underline">Home Run Derby →</Link>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        A mitad de temporada hay dos días sin partidos: el Home Run Derby
        {allStarBreak ? ` (día ${allStarBreak.derbyDay})` : ''} y el Juego de Estrellas
        {allStarBreak ? ` (día ${allStarBreak.allStarDay})` : ''}, Oeste contra Este. Se convoca al mejor jugador
        sano de cada posición y al mejor pitcher de cada conferencia. Cada convocado da fans a su equipo (más si su
        conferencia gana). No cuenta para las estadísticas. Si avanzas el día sin jugarlo, se juega solo.
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {selectedGame && (
        <button onClick={() => setSelectedId(null)} className="text-sm text-blue-600 hover:underline">
          ← Volver a la temporada actual
        </button>
      )}
      {body}

      {history.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold mb-2">Juegos anteriores</h3>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="p-2">Temporada</th>
                <th className="p-2">Resultado</th>
                <th className="p-2">MVP</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const mvp = Object.values(h.rosters || {})
                  .flatMap((s) => s?.players || [])
                  .find((p) => p.id === h.mvp_player_id);
                return (
                  <tr key={h.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedId(h.id)}>
                    <td className="p-2">#{h.season_id}</td>
                    <td className="p-2">
                      {h.away_conference} {h.away_score} – {h.home_score} {h.home_conference}
                    </td>
                    <td className="p-2">
                      {mvp ? (
                        <span className="inline-flex items-center gap-1.5">
                          {mvp.first_name} {mvp.last_name} {mvp.team_name && <TeamBadge name={mvp.team_name} />}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
