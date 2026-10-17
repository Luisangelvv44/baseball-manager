// Calibracion del costo de mantenimiento por asistencia (STADIUM_MAINTENANCE_TIERS en config.js).
// Compara tres modelos: la curva original (0.5 -> 10 $/persona, exponente 2, tope en 1M), tramos en
// dolares fijos y los tramos actuales de config.js (los altos como fraccion del precio justo).
// Solo llama a funciones puras de services/economy.js: no toca la base de datos.
// Uso: npm run maintenance:calibrate  (o node scripts/calibrateMaintenance.js [simulaciones])

const { computeHomeGameRevenue, computeMaintenanceCost, getFairTicketPrice, getSectionFairPrice } = require('../services/economy');
const { STADIUM_MAINTENANCE_TIERS, TICKET_RING_PREMIUM } = require('../config');

const SIMS = Number(process.argv[2]) || 300;
const REPUTATIONS = [20, 100, 1000];
const FAN_BASES = [100_000, 500_000, 1_000_000, 3_000_000, 10_000_000];
const CAPACITIES = [10_000, 200_000, 3_000_000];
const ATTENDANCES = [5_000, 50_000, 300_000, 1_000_000, 3_000_000];

// Modelos anteriores, copiados aqui solo para comparar.
function curveCost(attendance) {
  if (!attendance || attendance <= 0) return 0;
  const ratio = Math.min(1, attendance / 1_000_000);
  return Math.round(attendance * (0.5 + 9.5 * ratio ** 2));
}
const FIXED_TIERS = [
  { upTo: 20_000, perFan: 0.5 }, { upTo: 100_000, perFan: 2 }, { upTo: 500_000, perFan: 5 },
  { upTo: 2_000_000, perFan: 9 }, { upTo: Infinity, perFan: 14 },
];
const fixedCost = (a) => computeMaintenanceCost(a, 0, FIXED_TIERS);

// Estadio de `capacity` asientos repartido por igual entre los anillos, cada grada a su precio justo.
function buildStadium(capacity, reputation) {
  const fair = getFairTicketPrice(reputation);
  return TICKET_RING_PREMIUM.map((_, i) => ({
    capacity: Math.round(capacity / TICKET_RING_PREMIUM.length),
    ring: i + 1,
    price_per_ticket: Math.round(getSectionFairPrice(fair, i + 1) * 100) / 100,
  }));
}

function simulate(capacity, fanBase, reputation, isPlayoff = false) {
  const sections = buildStadium(capacity, reputation);
  const acc = { attendance: 0, tickets: 0, curve: 0, fixed: 0, share: 0 };
  for (let i = 0; i < SIMS; i++) {
    const r = computeHomeGameRevenue(sections, reputation, fanBase, isPlayoff);
    acc.attendance += r.attendance;
    acc.tickets += r.ticketRevenue;
    acc.curve += curveCost(r.attendance);
    acc.fixed += fixedCost(r.attendance);
    acc.share += r.operatingCost;
  }
  for (const k of Object.keys(acc)) acc[k] /= SIMS;
  return acc;
}

const money = (n) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(2);
  return `${n < 0 ? '-' : ''}$${s}`;
};
const num = (n) => Math.round(n).toLocaleString('es-ES');
const pct = (n) => `${(n * 100).toFixed(1)}%`;

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join('  ');
  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
  console.log();
}

const marginal = (fn, a) => (fn(a + 1000) - fn(a)) / 1000;
// Entrada media de un estadio repartido por igual entre anillos, a precio justo.
const avgTicket = (rep) => getFairTicketPrice(rep) * TICKET_RING_PREMIUM.reduce((s, p) => s + p, 0) / TICKET_RING_PREMIUM.length;

console.log('\nTramos actuales (config.js):');
let from = 0;
for (const t of STADIUM_MAINTENANCE_TIERS) {
  const rate = t.perFan != null ? `$${t.perFan}/asistente` : `${t.fairPriceShare * 100}% del precio justo`;
  console.log(`  ${num(from)} – ${t.upTo === Infinity ? '∞' : num(t.upTo)}: ${rate}`);
  from = t.upTo;
}
console.log('\nPrecio justo y entrada media por reputación:');
REPUTATIONS.forEach((r) => console.log(`  rep ${r}: justo $${getFairTicketPrice(r).toFixed(2)}, entrada media $${avgTicket(r).toFixed(2)}`));
console.log();

console.log('1) Costo del asistente siguiente (marginal) frente a la entrada media');
table(
  ['Asistencia', 'Curva', 'Fijos', ...REPUTATIONS.map((r) => `%justo rep ${r}`), ...REPUTATIONS.map((r) => `Margen rep ${r}`)],
  ATTENDANCES.map((a) => {
    const share = REPUTATIONS.map((r) => marginal((x) => computeMaintenanceCost(x, getFairTicketPrice(r)), a));
    return [
      num(a), `$${marginal(curveCost, a).toFixed(2)}`, `$${marginal(fixedCost, a).toFixed(2)}`,
      ...share.map((m) => `$${m.toFixed(2)}`),
      ...share.map((m, i) => pct(1 - m / avgTicket(REPUTATIONS[i]))),
    ];
  }),
);
console.log('   "Margen" = lo que queda de la entrada media de ese asistente tras pagar su mantenimiento (modelo %justo).\n');

console.log(`2) Partido en casa de temporada regular, promedio de ${SIMS} simulaciones, gradas a su precio justo`);
for (const rep of REPUTATIONS) {
  console.log(`\n   Reputación ${rep}`);
  const rows = [];
  for (const fans of FAN_BASES) {
    for (const cap of CAPACITIES) {
      const r = simulate(cap, fans, rep);
      const t = Math.max(1, r.tickets);
      rows.push([
        num(fans), num(cap), num(r.attendance), money(r.tickets),
        money(r.curve), money(r.fixed), money(r.share),
        pct(r.curve / t), pct(r.fixed / t), pct(r.share / t),
      ]);
    }
  }
  table(['Afición', 'Asientos', 'Asistencia', 'Taquilla', 'Curva', 'Fijos', '%justo', 'Curva/taq', 'Fijos/taq', '%justo/taq'], rows);
}

console.log('3) Playoffs (14–25 % de la afición), estadio de 3M asientos');
const playoffRows = [];
for (const rep of REPUTATIONS) {
  for (const fans of [1_000_000, 3_000_000, 10_000_000]) {
    const r = simulate(3_000_000, fans, rep, true);
    const t = Math.max(1, r.tickets);
    playoffRows.push([rep, num(fans), num(r.attendance), money(r.tickets), pct(r.curve / t), pct(r.fixed / t), pct(r.share / t)]);
  }
}
table(['Rep', 'Afición', 'Asistencia', 'Taquilla', 'Curva/taq', 'Fijos/taq', '%justo/taq'], playoffRows);
