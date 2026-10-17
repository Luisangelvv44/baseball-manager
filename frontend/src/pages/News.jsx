import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { seasonLabel } from '../utils/seasonLabel.js';
import {
  SECTIONS, buildStory, luxuryStory, quoteFor, adsFor,
} from './news/gazetteStories.js';
import './news/gazette.css';

const PORTADA_ARTICLES = 9;
// En portada estas notas van a "Breves" salvo que sean del equipo del usuario.
const BRIEF_TYPES = new Set(['game', 'signing', 'injury']);
const MARKET_LABEL = { auction: 'Subasta', signing: 'Movimiento', trade: 'Traspaso' };

const BALL = (
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill="var(--paper)" stroke="var(--ink)" strokeWidth="4" />
    <path d="M26 14c14 14 14 58 0 72M74 14c-14 14-14 58 0 72" fill="none" stroke="var(--stamp)" strokeWidth="3.5" strokeLinecap="round" />
    <g stroke="var(--stamp)" strokeWidth="2.5" strokeLinecap="round">
      <path d="M31 24l-8 3M34 36l-9 1M35 48h-10M34 60l-9-1M31 72l-8-3M69 24l8 3M66 36l9 1M65 48h10M66 60l9-1M69 72l8-3" />
    </g>
  </svg>
);

function Story({ story, lead = false, wide = false, day }) {
  const cls = lead ? 'gz-story gz-lead' : `gz-story${wide ? ' wide' : ''}`;
  const g = story.game;
  return (
    <article className={cls}>
      <p className="gz-kicker">
        {story.kicker}
        {story.mine && <span className="gz-mine">Tu equipo</span>}
      </p>
      <h2>{story.headline}</h2>
      {story.deck && <p className="deck">{story.deck}</p>}
      <p className="gz-byline">Por {story.by} · Jornada {day}</p>
      {lead && (
        <figure className="gz-photo">
          <div className="gz-halftone">
            {g && <span className="score">{g.away.runs}–{g.home.runs}</span>}
            {BALL}
          </div>
          <figcaption>
            {g ? `${g.away.name} en ${g.home.name}, jornada ${day}. Foto de archivo.` : `Imagen de archivo de la jornada ${day}.`}
          </figcaption>
        </figure>
      )}
      <div className="body">
        {story.body.map((p, i) => <p key={i}>{p}</p>)}
        {story.table && (
          <table className="gz-ledger">
            <caption>{story.table.title}</caption>
            <tbody>
              {story.table.rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
              <tr className="total"><td>{story.table.total[0]}</td><td>{story.table.total[1]}</td></tr>
            </tbody>
          </table>
        )}
        {story.link && (
          <p><Link className="more" to={story.link[0]}>{story.link[1]} →</Link></p>
        )}
      </div>
    </article>
  );
}

function Linescore({ game }) {
  const cols = Array.from({ length: game.innings }, (_, i) => i + 1);
  const row = (side) => {
    const t = game[side];
    return (
      <tr className={game.winner === side ? 'win' : ''}>
        <td>{t.name}</td>
        {t.line.map((r, i) => <td key={i}>{r}</td>)}
        <td className="tot">{t.runs}</td>
        <td>{t.hits}</td>
      </tr>
    );
  };
  return (
    <Link to={`/game/${game.id}`} className={`gz-game${game.mine ? ' me' : ''}`}>
      <div className="gz-scroll">
        <table className="gz-linescore">
          <thead>
            <tr>
              <th>{game.playoff ? 'Playoffs' : ''}</th>
              {cols.map((n) => <th key={n}>{n}</th>)}
              <th className="tot">C</th>
              <th>H</th>
            </tr>
          </thead>
          <tbody>{row('away')}{row('home')}</tbody>
        </table>
      </div>
      {game.innings > 9 && <p className="note">Partido de {game.innings} entradas.</p>}
    </Link>
  );
}

export default function News() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [day, setDay] = useState(null);
  const [section, setSection] = useState('portada');

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getGazette(day, data?.season?.id)
      .then(setData)
      .catch((e) => setError(e.message || 'No se pudo cargar la gaceta'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const view = useMemo(() => {
    if (!data?.season) return null;
    const days = data.days;
    const isLatest = days.length === 0 || data.day === days[days.length - 1];
    const ctx = { games: data.games, standings: data.standings, isLatest };
    const userTeamName = data.userTeam?.name ?? 'Tu equipo';

    const all = data.items.map((i) => buildStory(i, ctx));
    const lux = data.luxuryTax ? luxuryStory(data.luxuryTax, userTeamName) : null;
    const luxToday = lux && data.luxuryTax.day === data.day;

    const counts = {};
    for (const s of SECTIONS) counts[s.id] = 0;
    for (const s of all) {
      counts[s.section]++;
      if (s.mine) counts.mio++;
    }
    if (lux) { counts.finanzas++; counts.mio++; }
    counts.portada = all.length + (luxToday ? 1 : 0);

    let articles;
    let briefs = [];
    if (section === 'portada') {
      const pool = luxToday ? [...all, lux] : all;
      const featured = pool.filter((s) => s.mine || !BRIEF_TYPES.has(s.item?.type));
      featured.sort((a, b) => b.priority - a.priority);
      articles = featured.slice(0, PORTADA_ARTICLES);
      briefs = pool.filter((s) => !articles.includes(s));
    } else if (section === 'mio') {
      articles = [...all.filter((s) => s.mine), ...(lux ? [lux] : [])].sort((a, b) => b.priority - a.priority);
    } else {
      articles = [...all.filter((s) => s.section === section), ...(section === 'finanzas' && lux ? [lux] : [])]
        .sort((a, b) => b.priority - a.priority);
    }

    const [lead, ...rest] = articles;
    // Las notas con tabla van a lo ancho al final; si queda una impar suelta también se ensancha.
    const normal = rest.filter((s) => !s.table);
    const wide = rest.filter((s) => s.table);
    if (normal.length % 2 === 1) wide.unshift(normal.pop());

    return {
      isLatest,
      lead,
      normal,
      wide,
      briefs,
      counts,
      injuries: data.items.filter((i) => i.type === 'injury'),
      quote: quoteFor(data.day ?? 0),
      ads: adsFor(data.day ?? 0, data.standings),
    };
  }, [data, section]);

  const days = data?.days ?? [];
  const idx = days.indexOf(data?.day);
  const goto = (d) => setDay(d);
  const sectionLabel = (s) => (s.id === 'mio' ? (data?.userTeam?.name ?? s.label) : s.label);

  return (
    <div className="gz">
      <div className="gz-grain" aria-hidden="true" />
      <div className="gz-sheet">
        <header>
          <div className="gz-strip">
            <span>Año {data?.season?.edition ?? '—'} · Núm. {data?.day ?? '—'}</span>
            <span className="hide-sm">Liga de los Dieciséis</span>
            <span>Precio: una moneda</span>
          </div>
          <h1 className="gz-nameplate">La Gaceta del Diamante</h1>
          <div className="gz-rules" />
          <div className="gz-strip gz-dateline">
            <span>
              {data?.season ? `${seasonLabel(data.season.edition)} · Jornada ${data.day}` : 'Sin temporada'}
            </span>
            <span className="hide-sm">{view && !view.isLatest ? 'Edición de archivo' : 'Edición de la tarde'}</span>
            <span className="gz-daynav">
              <button type="button" disabled={loading || idx <= 0} onClick={() => goto(days[idx - 1])} aria-label="Edición anterior">← Anterior</button>
              <select
                aria-label="Elegir jornada"
                value={data?.day ?? ''}
                disabled={loading || days.length === 0}
                onChange={(e) => goto(Number(e.target.value))}
              >
                {days.length === 0 && <option value="">—</option>}
                {[...days].reverse().map((d) => <option key={d} value={d}>Día {d}</option>)}
              </select>
              <button type="button" disabled={loading || idx < 0 || idx >= days.length - 1} onClick={() => goto(days[idx + 1])} aria-label="Edición siguiente">Siguiente →</button>
              <button type="button" disabled={loading || (view?.isLatest ?? true)} onClick={() => goto(null)}>Hoy</button>
            </span>
          </div>
        </header>

        <nav className="gz-sections" aria-label="Secciones">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-pressed={section === s.id} onClick={() => setSection(s.id)}>
              {sectionLabel(s)}
              {view && s.id !== 'portada' && <span className="count">{view.counts[s.id]}</span>}
            </button>
          ))}
        </nav>

        {loading && !data ? (
          <p className="gz-loading">Las rotativas están imprimiendo la edición…</p>
        ) : error ? (
          <p className="gz-loading">{error}</p>
        ) : !view ? (
          <p className="gz-loading">Todavía no hay temporada en curso. Empieza una partida para que la Gaceta tenga de qué escribir.</p>
        ) : (
          <>
            <div className="gz-page" style={{ opacity: loading ? 0.5 : 1 }}>
              <main className="gz-main" aria-live="polite">
                {view.lead ? (
                  <>
                    <Story story={view.lead} lead day={data.day} />
                    <div className="gz-stories">
                      {view.normal.map((s) => <Story key={s.id} story={s} day={data.day} />)}
                      {view.wide.map((s) => <Story key={s.id} story={s} wide day={data.day} />)}
                    </div>
                  </>
                ) : (
                  <p className="gz-empty">
                    {data.items.length === 0
                      ? 'Sin noticias todavía. Avanza días de temporada para que la redacción tenga material.'
                      : 'Hoy no hay noticias en esta sección.'}
                  </p>
                )}
                {view.briefs.length > 0 && (
                  <section className="gz-briefs gz-box" aria-labelledby="gz-h-briefs">
                    <h3 id="gz-h-briefs">Breves de la jornada</h3>
                    <ul>
                      {view.briefs.map((s) => (
                        <li key={s.id}><b>{s.kicker}</b>{s.headline}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </main>

              <aside className="gz-rail">
                <section className="gz-box" aria-labelledby="gz-h-std">
                  <h3 id="gz-h-std">Clasificación{view.isLatest ? '' : ' (actual)'}</h3>
                  <div className="gz-scroll">
                    <table className="gz-std">
                      <thead><tr><th /><th>Equipo</th><th>G</th><th>P</th><th>Dif</th></tr></thead>
                      <tbody>
                        {data.standings.map((t, i) => (
                          <tr key={t.id} className={t.mine ? 'me' : ''}>
                            <td>{i + 1}</td>
                            <td>{t.name}</td>
                            <td>{t.wins}</td>
                            <td>{t.losses}</td>
                            <td>{t.run_diff > 0 ? `+${t.run_diff}` : t.run_diff}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="gz-box" aria-labelledby="gz-h-mkt">
                  <h3 id="gz-h-mkt">Mesa de mercado</h3>
                  <ul className="gz-list">
                    {data.market.length === 0 && <li className="nil">Sin movimientos esta temporada.</li>}
                    {data.market.map((m) => (
                      <li key={m.id} className={m.mine ? 'me' : ''}>
                        {m.headline}
                        <span className="meta">{MARKET_LABEL[m.type]} · día {m.season_day}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="gz-box" aria-labelledby="gz-h-med">
                  <h3 id="gz-h-med">Parte médico</h3>
                  <ul className="gz-list">
                    {view.injuries.length === 0 && <li className="nil">Sin novedades en la enfermería.</li>}
                    {view.injuries.map((i) => (
                      <li key={i.id} className={i.mine ? 'me' : ''}>{i.headline}</li>
                    ))}
                  </ul>
                </section>

                <blockquote className="gz-quote">
                  “{view.quote[0]}”<small>{view.quote[1]}</small>
                </blockquote>
              </aside>
            </div>

            <div className="gz-foot">
              <section className="gz-box" aria-labelledby="gz-h-res">
                <h3 id="gz-h-res">Resultados de la jornada</h3>
                <div className="gz-games">
                  {data.games.length === 0
                    ? <p className="gz-list"><span className="nil">No se jugaron partidos este día.</span></p>
                    : data.games.map((g) => <Linescore key={g.id} game={g} />)}
                </div>
              </section>
              <section className="gz-box" aria-labelledby="gz-h-cla">
                <h3 id="gz-h-cla">Anuncios clasificados</h3>
                <div className="gz-ads">
                  {view.ads.map((a, i) => (
                    <div key={i} className={`gz-ad${a.dbl ? ' dbl' : ''}`}>
                      <b>{a.t}</b>{a.x}<span className="tel">{a.tel}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        <p className="gz-colophon">
          Impreso en los talleres de la Liga de los Dieciséis. Las ofertas de subasta expresan siempre el salario anual del jugador.
        </p>
      </div>
    </div>
  );
}
