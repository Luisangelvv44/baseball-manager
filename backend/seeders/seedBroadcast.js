// Inserta las empresas de transmisión e inicializa fan_base en equipos existentes.
// Seguro de correr sobre un save existente (no borra datos).
const prisma = require('../db/prisma');

const TV_COMPANIES = [
  { name: 'ESPN Baseball',      price_per_fan: 0.5000 },
  { name: 'Fox Sports',         price_per_fan: 0.4200 },
  { name: 'TNT Sports',         price_per_fan: 0.3600 },
  { name: 'MLB Network',        price_per_fan: 0.3000 },
  { name: 'NBC Sports',         price_per_fan: 0.2500 },
  { name: 'CBS Sports',         price_per_fan: 0.2000 },
  { name: 'TBS',                price_per_fan: 0.1700 },
  { name: 'Bally Sports',       price_per_fan: 0.1400 },
  { name: 'NESN',               price_per_fan: 0.1200 },
  { name: 'Regional Sports TV', price_per_fan: 0.1000 },
];

const RADIO_COMPANIES = [
  { name: 'SiriusXM Baseball',  price_per_fan: 0.0800 },
  { name: 'ESPN Radio',         price_per_fan: 0.0670 },
  { name: 'CBS Sports Radio',   price_per_fan: 0.0560 },
  { name: 'iHeart Baseball',    price_per_fan: 0.0470 },
  { name: 'Fox Sports Radio',   price_per_fan: 0.0400 },
  { name: 'The Sports Hub',     price_per_fan: 0.0340 },
  { name: 'AM 680 KNBR',        price_per_fan: 0.0280 },
  { name: 'Sports Radio 1050',  price_per_fan: 0.0240 },
  { name: 'The Fan Network',    price_per_fan: 0.0200 },
  { name: 'Local Diamond Radio',price_per_fan: 0.0200 },
];

async function main() {
  const existing = await prisma.broadcastCompany.count();
  if (existing === 0) {
    console.log('Insertando empresas de transmisión...');
    for (const c of TV_COMPANIES) {
      await prisma.broadcastCompany.create({ data: { ...c, type: 'TV' } });
    }
    for (const c of RADIO_COMPANIES) {
      await prisma.broadcastCompany.create({ data: { ...c, type: 'RADIO' } });
    }
    console.log('20 empresas creadas.');
  } else {
    console.log(`Empresas ya existen (${existing}), se omite.`);
  }

  // Inicializar fan_base en equipos que tengan fan_base = 0
  const teams = await prisma.team.findMany({ where: { fan_base: 0 } });
  for (const team of teams) {
    const fanBase = team.is_user_team ? 100000 : team.reputation * 1000;
    await prisma.team.update({ where: { id: team.id }, data: { fan_base: fanBase } });
  }
  if (teams.length > 0) {
    console.log(`fan_base inicializado para ${teams.length} equipos.`);
  } else {
    console.log('fan_base ya estaba configurado en todos los equipos.');
  }

  console.log('Listo.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect();
    process.exit(1);
  });
