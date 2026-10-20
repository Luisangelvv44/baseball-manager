import { useState } from 'react';

// Fachada principal del estadio: ilustracion SVG que cambia con el nivel de cada elemento
// (entrada, letrero, plaza, tienda) + tarjetas de mejora. Los datos vienen de GET /api/stadium.

const ICONS = { facade_entrance: '🚪', facade_sign: '🔤', facade_plaza: '⛲', facade_shop: '🛍️' };
const fmtMoney = (n) => `$${Math.round(n).toLocaleString()}`;

const W = 800;
const H = 440;
const WALL_TOP = 120;
const GROUND = 300;

function Sky() {
  return (
    <>
      <defs>
        <linearGradient id="fc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dc3f0" />
          <stop offset="1" stopColor="#d8eefb" />
        </linearGradient>
        <linearGradient id="fc-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe6ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#5fa8d8" stopOpacity="0.85" />
        </linearGradient>
        <pattern id="fc-brick" width="24" height="12" patternUnits="userSpaceOnUse">
          <rect width="24" height="12" fill="#a4553a" />
          <path d="M0 0H24M0 6H24M6 0V6M18 6V12" stroke="#7e3d28" strokeWidth="1" />
        </pattern>
        <filter id="fc-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width={W} height={GROUND} fill="url(#fc-sky)" />
      <circle cx="700" cy="60" r="26" fill="#fff6c4" />
      <g fill="#ffffff" opacity="0.85">
        <ellipse cx="140" cy="60" rx="46" ry="14" />
        <ellipse cx="175" cy="50" rx="30" ry="14" />
        <ellipse cx="520" cy="40" rx="38" ry="11" />
      </g>
    </>
  );
}

// Cuerpo del estadio detras de la fachada: muro de ladrillo con ventanales y torres de luz
function Building() {
  const windows = [];
  for (let i = 0; i < 12; i++) {
    const x = 70 + i * 56;
    if (x > 330 && x < 470) continue; // hueco de la entrada
    windows.push(
      <path key={i} d={`M${x} 250 V200 a16 16 0 0 1 32 0 V250 Z`} fill="#2d3748" opacity="0.75" />,
    );
  }
  return (
    <g>
      {/* gradas asomando por encima del muro */}
      <path d={`M40 ${WALL_TOP} L90 70 H710 L760 ${WALL_TOP} Z`} fill="#6b7280" />
      <path d={`M90 70 H710`} stroke="#4b5563" strokeWidth="4" />
      {[110, 690].map((x) => (
        <g key={x}>
          <rect x={x - 3} y="10" width="6" height="70" fill="#4b5563" />
          <rect x={x - 18} y="6" width="36" height="14" rx="2" fill="#374151" />
          <rect x={x - 15} y="9" width="30" height="8" fill="#fde68a" />
        </g>
      ))}
      <rect x="40" y={WALL_TOP} width="720" height={GROUND - WALL_TOP} fill="url(#fc-brick)" />
      <rect x="40" y={WALL_TOP} width="720" height="10" fill="#6b2f1e" />
      <rect x="40" y={GROUND - 8} width="720" height="8" fill="#5a2818" />
      {windows}
    </g>
  );
}

function Sign({ level, text }) {
  const cx = W / 2;
  const y = WALL_TOP + 38;
  const fontSize = text.length > 18 ? 20 : 26;
  const common = { x: cx, y, textAnchor: 'middle', fontSize, fontWeight: 800, letterSpacing: 3 };

  if (level === 1) {
    return (
      <g>
        <rect x={cx - 170} y={WALL_TOP + 14} width="340" height="36" fill="#e7dcc4" stroke="#8b7355" strokeWidth="2" />
        <text {...common} fill="#7a5c3a" fontFamily="Georgia, serif">{text}</text>
      </g>
    );
  }
  if (level === 2) {
    return (
      <text {...common} fill="#d1d5db" stroke="#4b5563" strokeWidth="1" fontFamily="Arial, sans-serif">{text}</text>
    );
  }
  if (level === 3) {
    const bulbs = [];
    for (let i = 0; i < 22; i++) bulbs.push(<circle key={i} cx={cx - 168 + i * 16} cy={WALL_TOP + 52} r="2.5" fill="#fde68a" />);
    return (
      <g>
        <text {...common} fill="#fff7d6" stroke="#b45309" strokeWidth="1" fontFamily="Arial, sans-serif" filter="url(#fc-glow)">
          {text}
        </text>
        {bulbs}
      </g>
    );
  }
  if (level === 4) {
    return (
      <g filter="url(#fc-glow)">
        <rect x={cx - 180} y={WALL_TOP + 12} width="360" height="44" rx="10" fill="none" stroke="#22d3ee" strokeWidth="3" />
        <text {...common} fill="#f472b6" fontFamily="Arial, sans-serif">{text}</text>
      </g>
    );
  }
  return (
    <g>
      <rect x={cx - 210} y={WALL_TOP - 30} width="420" height="86" rx="6" fill="#0f172a" stroke="#94a3b8" strokeWidth="4" />
      <rect x={cx - 200} y={WALL_TOP - 20} width="400" height="66" fill="#111827" />
      <text {...common} y={WALL_TOP + 22} fontSize={fontSize + 6} fill="#fbbf24" fontFamily="Arial, sans-serif" filter="url(#fc-glow)">
        {text}
      </text>
      <text x={cx} y={WALL_TOP + 40} textAnchor="middle" fontSize="11" fill="#38bdf8" letterSpacing="4">
        ★ BIENVENIDOS ★
      </text>
    </g>
  );
}

function Entrance({ level }) {
  const cx = W / 2;
  const bottom = GROUND;
  const bars = (x0, x1, top) => {
    const out = [];
    for (let x = x0; x <= x1; x += 8) out.push(<line key={x} x1={x} y1={top} x2={x} y2={bottom} stroke="#1f2937" strokeWidth="2" />);
    return out;
  };
  const turnstiles = (n) =>
    Array.from({ length: n }, (_, i) => {
      const x = cx - (n - 1) * 15 + i * 30;
      return (
        <g key={i}>
          <rect x={x - 5} y={bottom - 22} width="10" height="22" fill="#9ca3af" />
          <line x1={x - 12} y1={bottom - 16} x2={x + 12} y2={bottom - 16} stroke="#6b7280" strokeWidth="3" />
        </g>
      );
    });

  if (level === 1) {
    return (
      <g>
        <rect x={cx - 60} y={bottom - 80} width="120" height="80" fill="#1f2937" opacity="0.85" />
        <rect x={cx - 60} y={bottom - 80} width="120" height="4" fill="#111827" />
        {bars(cx - 56, cx + 56, bottom - 78)}
      </g>
    );
  }
  if (level === 2) {
    return (
      <g>
        <rect x={cx - 70} y={bottom - 86} width="140" height="86" fill="#1f2937" />
        <rect x={cx - 70} y={bottom - 86} width="140" height="12" fill="#374151" />
        <text x={cx} y={bottom - 77} textAnchor="middle" fontSize="8" fill="#e5e7eb" letterSpacing="2">ENTRADA</text>
        {turnstiles(4)}
      </g>
    );
  }
  if (level === 3) {
    return (
      <g>
        <rect x={cx - 90} y={bottom - 120} width="180" height="120" fill="#7e3d28" />
        <rect x={cx - 96} y={bottom - 128} width="192" height="14" fill="#5a2818" />
        <rect x={cx - 70} y={bottom - 100} width="140" height="100" fill="#1f2937" />
        <text x={cx} y={bottom - 118} textAnchor="middle" fontSize="9" fill="#fde68a" letterSpacing="3">PUERTA 1</text>
        {turnstiles(4)}
      </g>
    );
  }
  if (level === 4) {
    return (
      <g>
        <path d={`M${cx - 110} ${bottom} V${bottom - 110} A110 70 0 0 1 ${cx + 110} ${bottom - 110} V${bottom} Z`} fill="#d6d3c4" />
        <path d={`M${cx - 80} ${bottom} V${bottom - 100} A80 50 0 0 1 ${cx + 80} ${bottom - 100} V${bottom} Z`} fill="#1f2937" />
        {[-104, -88, 88, 104].map((dx) => (
          <rect key={dx} x={cx + dx - 6} y={bottom - 110} width="12" height="110" fill="#e7e5dc" stroke="#a8a29e" />
        ))}
        <circle cx={cx} cy={bottom - 160} r="12" fill="#d6d3c4" stroke="#a8a29e" strokeWidth="2" />
        <text x={cx} y={bottom - 156} textAnchor="middle" fontSize="11">⚾</text>
        {turnstiles(5)}
      </g>
    );
  }
  return (
    <g>
      <rect x={cx - 150} y={bottom - 150} width="300" height="150" fill="url(#fc-glass)" stroke="#e5e7eb" strokeWidth="4" />
      {[-100, -50, 0, 50, 100].map((dx) => (
        <line key={dx} x1={cx + dx} y1={bottom - 150} x2={cx + dx} y2={bottom} stroke="#e5e7eb" strokeWidth="3" />
      ))}
      <line x1={cx - 150} y1={bottom - 100} x2={cx + 150} y2={bottom - 100} stroke="#e5e7eb" strokeWidth="3" />
      <path d={`M${cx - 170} ${bottom - 150} L${cx} ${bottom - 185} L${cx + 170} ${bottom - 150} Z`} fill="#cbd5e1" stroke="#94a3b8" strokeWidth="2" />
      {turnstiles(7)}
    </g>
  );
}

function Shop({ level }) {
  const x = 120;
  const bottom = GROUND + 14;
  if (level === 1) {
    return (
      <g>
        <rect x={x - 22} y={bottom - 30} width="44" height="24" fill="#b45309" />
        <circle cx={x - 12} cy={bottom - 4} r="5" fill="#374151" />
        <circle cx={x + 12} cy={bottom - 4} r="5" fill="#374151" />
        <line x1={x} y1={bottom - 30} x2={x} y2={bottom - 64} stroke="#6b7280" strokeWidth="2" />
        <path d={`M${x - 30} ${bottom - 58} Q${x} ${bottom - 82} ${x + 30} ${bottom - 58} Z`} fill="#ef4444" />
      </g>
    );
  }
  if (level === 2) {
    return (
      <g>
        <rect x={x - 34} y={bottom - 60} width="68" height="60" fill="#fef3c7" stroke="#92400e" strokeWidth="2" />
        <rect x={x - 26} y={bottom - 50} width="52" height="22" fill="#1f2937" />
        <path d={`M${x - 42} ${bottom - 60} L${x} ${bottom - 84} L${x + 42} ${bottom - 60} Z`} fill="#dc2626" />
        <text x={x} y={bottom - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="#92400e">KIOSCO</text>
      </g>
    );
  }
  const big = level >= 4;
  const w = level === 3 ? 110 : level === 4 ? 140 : 170;
  const h = level === 3 ? 74 : level === 4 ? 96 : 136;
  const awning = [];
  for (let i = 0; i < w / 14; i++) {
    awning.push(<rect key={i} x={x - w / 2 + i * 14} y={bottom - h + 16} width="14" height="14" fill={i % 2 ? '#fff' : '#2563eb'} />);
  }
  return (
    <g>
      <rect x={x - w / 2} y={bottom - h} width={w} height={h} fill={level === 5 ? 'url(#fc-glass)' : '#f3f4f6'} stroke="#6b7280" strokeWidth="2" />
      <rect x={x - w / 2} y={bottom - h} width={w} height="16" fill="#1e3a8a" />
      <text x={x} y={bottom - h + 12} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" letterSpacing="2">
        {level === 5 ? 'MEGASTORE' : 'TIENDA'}
      </text>
      {level !== 5 && awning}
      {level === 5 && <line x1={x - w / 2} y1={bottom - h / 2} x2={x + w / 2} y2={bottom - h / 2} stroke="#e5e7eb" strokeWidth="3" />}
      <rect x={x - 14} y={bottom - 34} width="28" height="34" fill="#374151" />
      {big && (
        <>
          <rect x={x - w / 2 + 8} y={bottom - 44} width="26" height="22" fill="#bfdbfe" stroke="#6b7280" />
          <rect x={x + w / 2 - 34} y={bottom - 44} width="26" height="22" fill="#bfdbfe" stroke="#6b7280" />
          <text x={x - w / 2 + 21} y={bottom - 28} textAnchor="middle" fontSize="12">👕</text>
          <text x={x + w / 2 - 21} y={bottom - 28} textAnchor="middle" fontSize="12">🧢</text>
        </>
      )}
    </g>
  );
}

function Plaza({ level }) {
  const ground = ['#a47b52', '#6b7280', '#cbbfa8', '#d6cdb8', '#e5dcc5'][level - 1];
  const items = [];

  if (level === 1) {
    items.push(
      <g key="cars">
        <rect x="560" y="360" width="56" height="22" rx="6" fill="#b91c1c" />
        <rect x="640" y="380" width="56" height="22" rx="6" fill="#1d4ed8" />
        <rect x="230" y="390" width="56" height="22" rx="6" fill="#4b5563" />
      </g>,
    );
  }
  if (level === 2) {
    for (let i = 0; i < 9; i++) items.push(<rect key={i} x={60 + i * 80} y="400" width="40" height="4" fill="#f9fafb" />);
    items.push(<rect key="car" x="590" y="370" width="56" height="22" rx="6" fill="#b91c1c" />);
  }
  if (level >= 3) {
    // senda central hacia la entrada + jardineras con arboles
    items.push(<path key="path" d={`M${W / 2 - 70} ${GROUND} L${W / 2 - 150} ${H} H${W / 2 + 150} L${W / 2 + 70} ${GROUND} Z`} fill="#b8ab90" />);
    [70, 250, 550, 730].forEach((x) => {
      items.push(
        <g key={`t${x}`}>
          <rect x={x - 24} y="398" width="48" height="12" fill="#78716c" />
          <rect x={x - 3} y="372" width="6" height="28" fill="#78350f" />
          <circle cx={x} cy="362" r="20" fill="#16a34a" />
        </g>,
      );
    });
  }
  if (level >= 4) {
    const cx = W / 2;
    items.push(
      <g key="fountain">
        <ellipse cx={cx} cy="388" rx="70" ry="18" fill="#94a3b8" />
        <ellipse cx={cx} cy="385" rx="60" ry="13" fill="#60a5fa" />
        <rect x={cx - 5} y="345" width="10" height="40" fill="#cbd5e1" />
        <path d={`M${cx} 345 Q${cx - 30} 330 ${cx - 40} 380 M${cx} 345 Q${cx + 30} 330 ${cx + 40} 380`} stroke="#bfdbfe" strokeWidth="3" fill="none" />
      </g>,
    );
  }
  if (level >= 5) {
    // Paseo de la Fama: estatuas y estrellas en el suelo
    [170, 630].forEach((x) => {
      items.push(
        <g key={`s${x}`}>
          <rect x={x - 16} y="370" width="32" height="30" fill="#e7e5e4" stroke="#a8a29e" />
          <circle cx={x} cy="334" r="8" fill="#b08d57" />
          <rect x={x - 7} y="342" width="14" height="26" fill="#b08d57" />
          <line x1={x + 7} y1="346" x2={x + 20} y2="330" stroke="#b08d57" strokeWidth="5" />
        </g>,
      );
    });
    for (let i = 0; i < 6; i++) {
      items.push(<text key={`st${i}`} x={W / 2 - 100 + i * 40} y="428" textAnchor="middle" fontSize="14" fill="#ca8a04">★</text>);
    }
  }

  return (
    <g>
      <rect y={GROUND} width={W} height={H - GROUND} fill={ground} />
      <rect y={GROUND} width={W} height="6" fill="#9ca3af" />
      {items}
    </g>
  );
}

// Nombres de mas de 24 letras se recortan a las dos ultimas palabras para que quepan en el letrero
function signText(name) {
  const up = (name || 'ESTADIO').toUpperCase();
  if (up.length <= 24) return up;
  return up.split(' ').slice(-2).join(' ');
}

export default function FacadeView({ data, onUpgradeFacility }) {
  const [busyKey, setBusyKey] = useState(null);
  const [toast, setToast] = useState(null);
  const parts = data.facilities.filter((f) => f.group === 'facade');
  const lv = (key) => parts.find((f) => f.key === key)?.level ?? 1;

  async function handleUpgrade(part) {
    if (busyKey) return;
    setBusyKey(part.key);
    setToast(null);
    try {
      const fresh = await onUpgradeFacility(part.key);
      const up = fresh.facilities.find((f) => f.key === part.key);
      setToast({ ok: true, text: `${ICONS[part.key]} ${up.name} · ${up.levelName}` });
    } catch (err) {
      setToast({ ok: false, text: err.message });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-2">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Fachada principal del estadio">
            <Sky />
            <Building />
            <Plaza level={lv('facade_plaza')} />
            <Entrance level={lv('facade_entrance')} />
            <Sign level={lv('facade_sign')} text={signText(data.team_name)} />
            <Shop level={lv('facade_shop')} />
          </svg>
        </div>
        {toast && (
          <div className={`text-sm rounded p-2 border ${toast.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {toast.text}
          </div>
        )}
        <p className="text-xs text-gray-500">
          La fachada es lo primero que ven los aficionados: una entrada imponente sube el precio justo de las
          entradas, la plaza atrae más público y el letrero y la tienda impulsan las ventas de merchandising.
          Como las demás instalaciones, cada nivel suma mantenimiento por partido en casa.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-bold text-gray-800">Fachada principal</h3>
        {parts.map((f) => {
          const atMax = f.level >= f.max;
          const poor = !atMax && data.budget < f.next_cost;
          const disabled = atMax || poor || !!busyKey;
          const label = busyKey === f.key
            ? 'Construyendo…'
            : atMax ? 'Nivel máximo' : poor ? 'Sin fondos' : `Mejorar · ${fmtMoney(f.next_cost)}`;
          return (
            <div key={f.key} className="bg-white border rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{ICONS[f.key]} {f.name}</span>
                <span className="text-xs text-gray-500">Nv. {f.level}/{f.max}</span>
              </div>
              <div className="flex gap-1 my-1.5" aria-hidden="true">
                {Array.from({ length: f.max }, (_, i) => (
                  <span key={i} className={`h-1.5 flex-1 rounded ${i < f.level ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                ))}
              </div>
              <div className="text-xs text-gray-600">{f.levelName}</div>
              {f.effect && <div className="text-xs text-green-700">{f.effect}</div>}
              {!atMax && (
                <div className="text-xs mt-1">
                  Siguiente: {f.nextLevelName}
                  {f.nextEffect && <span className="text-gray-500"> ({f.nextEffect})</span>}
                </div>
              )}
              <button
                onClick={() => handleUpgrade(f)}
                disabled={disabled}
                className={`mt-2 w-full h-8 rounded text-sm font-semibold ${
                  disabled ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {label}
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
