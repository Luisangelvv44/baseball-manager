import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import BroadcastLogo from '../components/BroadcastLogo.jsx';

// Pistas de cada tono; reflejan TONE_EFFECTS de backend/services/pressTemplates.js.
const TONE_STYLES = {
  humilde: { cls: 'border-emerald-300 hover:bg-emerald-50', active: 'bg-emerald-100 border-emerald-500', hint: '+satisfacción, enfría la rivalidad' },
  confiado: { cls: 'border-blue-300 hover:bg-blue-50', active: 'bg-blue-100 border-blue-500', hint: '+audiencia si las cosas van bien' },
  provocador: { cls: 'border-red-300 hover:bg-red-50', active: 'bg-red-100 border-red-500', hint: '++audiencia, −satisfacción, +rivalidad' },
  evasivo: { cls: 'border-gray-300 hover:bg-gray-50', active: 'bg-gray-200 border-gray-500', hint: '−audiencia' },
};

const TONE_LABELS = { humilde: 'Humilde', confiado: 'Confiado', provocador: 'Provocador', evasivo: 'Evasivo' };

function triggerLabel(conf) {
  const rival = conf.opponent?.name;
  if (conf.trigger === 'playoff_group') return 'Fin de la liguilla de playoffs';
  if (conf.trigger === 'playoff_series') return rival ? `Tras la serie de playoffs ante ${rival}` : 'Tras la serie de playoffs';
  return rival ? `Tras la serie ante ${rival}` : 'Tras la serie';
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;

function Meter({ value, base = 50, color = 'bg-blue-500' }) {
  return (
    <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      <div className="absolute top-0 h-full w-px bg-gray-600" style={{ left: `${base}%` }} title="Base" />
    </div>
  );
}

function EffectChips({ effects, hasHost }) {
  if (!effects) return null;
  const chips = [];
  if (hasHost) {
    chips.push({ label: 'Audiencia', value: effects.audience });
    chips.push({ label: 'Satisfacción', value: effects.satisfaction });
  }
  if (effects.rivalry) chips.push({ label: 'Rivalidad', value: effects.rivalry });
  if (chips.length === 0) return <span className="text-xs text-gray-500">Sin efectos</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`text-xs font-semibold px-2 py-0.5 rounded ${
            c.value > 0 ? 'bg-green-100 text-green-800' : c.value < 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {c.label} {signed(c.value)}
        </span>
      ))}
    </div>
  );
}

function HostLine({ conf }) {
  return (
    <div className="flex items-center gap-3">
      {conf.host ? <BroadcastLogo name={conf.host.name} size="md" /> : <span className="text-2xl">📰</span>}
      <div>
        <p className="font-semibold">{conf.host ? conf.host.name : 'La Gaceta del Diamante'}</p>
        <p className="text-xs text-gray-500">
          Pregunta {conf.reporter_name}
          {conf.host ? ` · ${conf.host.type === 'TV' ? 'Televisión' : 'Radio'}` : ''}
        </p>
      </div>
    </div>
  );
}

function PendingConference({ conf, onDone }) {
  const [answers, setAnswers] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const complete = conf.questions.every((q) => answers[q.id]);

  async function submit() {
    setSending(true);
    setError('');
    try {
      const result = await api.answerPress(conf.id, conf.questions.map((q) => ({ questionId: q.id, tone: answers[q.id] })));
      onDone(result);
    } catch (e) {
      setError(e.message);
      setSending(false);
    }
  }

  async function skip() {
    setSending(true);
    setError('');
    try {
      onDone(await api.skipPress(conf.id));
    } catch (e) {
      setError(e.message);
      setSending(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-5 border-l-4 border-amber-500">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HostLine conf={conf} />
        <div className="text-right">
          <p className="text-sm font-semibold text-amber-700">🎤 Rueda de prensa pendiente</p>
          <p className="text-xs text-gray-500">{triggerLabel(conf)} · Día {conf.day}</p>
        </div>
      </div>

      {!conf.host && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
          No tienes contratos de TV ni radio: esta rueda no mueve la audiencia ni la satisfacción, solo la rivalidad.
        </p>
      )}

      {conf.questions.map((q, i) => (
        <div key={q.id} className="space-y-2">
          <p className="font-medium">
            <span className="text-gray-400 mr-2">{i + 1}.</span>«{q.text}»
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => {
              const style = TONE_STYLES[o.tone];
              const selected = answers[q.id] === o.tone;
              return (
                <button
                  key={o.tone}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.tone }))}
                  className={`text-left border rounded p-3 text-sm transition ${selected ? style.active : style.cls}`}
                >
                  <span className="block font-semibold">{o.label}</span>
                  <span className="block text-gray-700 italic">“{o.quote}”</span>
                  <span className="block text-xs text-gray-500 mt-1">{style.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={skip}
          disabled={sending}
          className="px-4 py-2 rounded bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 disabled:opacity-50"
        >
          No comparecer
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!complete || sending}
          className="px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50"
        >
          {sending ? 'Enviando...' : 'Responder'}
        </button>
      </div>
    </div>
  );
}

function ConferenceResult({ conf }) {
  const perQuestion = conf.effects?.perQuestion ?? [];
  return (
    <div className="bg-white rounded-lg shadow p-5 space-y-3 border-l-4 border-green-500">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HostLine conf={conf} />
        <EffectChips effects={conf.effects} hasHost={!!conf.host} />
      </div>
      {conf.status === 'skipped' ? (
        <p className="text-sm text-gray-600">No te presentaste ante la prensa.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {conf.questions.map((q) => {
            const answer = perQuestion.find((p) => p.questionId === q.id);
            return (
              <li key={q.id}>
                <p className="text-gray-500">«{q.text}»</p>
                {answer && (
                  <p className="italic">
                    <span className="not-italic font-semibold mr-1">{TONE_LABELS[answer.tone]}:</span>“{answer.quote}”
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/news" className="text-sm text-blue-600 hover:underline">Ver en la Gaceta →</Link>
    </div>
  );
}

function HistoryRow({ conf }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex flex-wrap items-center justify-between gap-2 py-2 text-left">
        <span className="text-sm">
          <span className="text-gray-500 mr-2">Día {conf.day}</span>
          {triggerLabel(conf)}
          {conf.status === 'skipped' && <span className="ml-2 text-xs text-red-600 font-semibold">No compareció</span>}
        </span>
        <EffectChips effects={conf.effects} hasHost={!!conf.host} />
      </button>
      {open && <div className="pb-3"><ConferenceResult conf={conf} /></div>}
    </li>
  );
}

export default function PressRoom() {
  const { refreshTeam } = useTeam();
  const [data, setData] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setData(await api.getPress());
    } catch (e) {
      setError('Error al cargar la sala de prensa.');
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDone(result) {
    setLastResult(result);
    await Promise.all([load(), refreshTeam?.()]);
  }

  if (error) return <div className="max-w-5xl mx-auto p-6 text-red-600">{error}</div>;
  if (!data) return <div className="max-w-5xl mx-auto p-6 text-gray-500">Cargando...</div>;

  const history = data.history.filter((c) => c.id !== lastResult?.id);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🎤 Sala de prensa</h1>
        <p className="text-sm text-gray-600">
          Una rueda de prensa cada {data.seriesInterval} series de temporada regular y al cerrar cada serie de playoffs.
          Tus respuestas mueven la audiencia, la satisfacción de tus cadenas y las rivalidades.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white rounded-lg shadow p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Audiencia de la temporada</h2>
            <span className="text-2xl font-bold">{data.audience}<span className="text-sm text-gray-500">/100</span></span>
          </div>
          <Meter value={data.audience} color={data.audience >= 50 ? 'bg-green-500' : 'bg-red-400'} />
          <p className="text-xs text-gray-500">
            Por encima de 50, cada cadena con contrato paga un bono al final de la temporada. Se reinicia a 50 cada año.
          </p>
          {data.schedule && !data.pending && (
            <p className="text-xs text-gray-600">
              Próxima rueda en {data.schedule.untilNext} {data.schedule.untilNext === 1 ? 'serie' : 'series'}.
            </p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <h2 className="font-semibold">Tus cadenas</h2>
          {data.broadcasters.length === 0 && (
            <p className="text-sm text-gray-500">
              Sin contratos vigentes. <Link to="/broadcast" className="text-blue-600 hover:underline">Ir a Transmisión</Link>
            </p>
          )}
          {data.broadcasters.map((b) => (
            <div key={b.company.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <BroadcastLogo name={b.company.name} />
                  <span className="font-medium">{b.company.name}</span>
                </span>
                <span className="text-xs text-gray-600">Bono estimado: {money(b.estimated_bonus)}</span>
              </div>
              <Meter value={b.satisfaction} color="bg-amber-500" />
              <p className="text-xs text-gray-500">Satisfacción {b.satisfaction}/100</p>
            </div>
          ))}
        </div>
      </div>

      {data.pending && <PendingConference key={data.pending.id} conf={data.pending} onDone={handleDone} />}
      {!data.pending && lastResult && <ConferenceResult conf={lastResult} />}
      {!data.pending && !lastResult && (
        <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-500">No hay ninguna rueda de prensa pendiente.</div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="font-semibold mb-2">Historial de la temporada</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hubo ruedas de prensa esta temporada.</p>
        ) : (
          <ul>{history.map((c) => <HistoryRow key={c.id} conf={c} />)}</ul>
        )}
      </div>
    </div>
  );
}
