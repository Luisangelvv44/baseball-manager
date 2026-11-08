// Calendario por conferencia: un equipo solo juega con los de su macro division (Oeste/Este).
// Cada conferencia (12 equipos) arma una vuelta de 15 series: las 11 del round-robin completo mas 4
// contra rivales de su propia division. La segunda vuelta repite las 15 con local/visitante invertido
// y cada serie son GAMES_PER_MATCHUP juegos en dias consecutivos: 30 series x 3 = 90 juegos por equipo
// (45 en casa, 45 fuera).

const { DIVISION_CONFERENCES, GAMES_PER_MATCHUP } = require('../config');

const EXTRA_DIVISION_ROUNDS = 4;

// Metodo del circulo. Devuelve un arreglo de rondas: [[{ home_team_id, away_team_id }, ...], ...]
function generateRoundRobin(ids) {
  const n = ids.length;
  const half = n / 2;
  const rounds = [];
  let arr = ids.slice(1);

  for (let round = 0; round < n - 1; round++) {
    const roundIds = [ids[0], ...arr];
    const games = [];

    for (let i = 0; i < half; i++) {
      const teamA = roundIds[i];
      const teamB = roundIds[n - 1 - i];
      const homeFirst = (round + i) % 2 === 0;
      games.push({ home_team_id: homeFirst ? teamA : teamB, away_team_id: homeFirst ? teamB : teamA });
    }

    rounds.push(games);
    arr = [arr[arr.length - 1], ...arr.slice(0, arr.length - 1)];
  }

  return rounds;
}

// Las rondas extra de division juntan la misma ronda de cada division de la conferencia. El local es
// el visitante de ese cruce en el round-robin, para que cada vuelta reparta la localia del par.
function divisionExtraRounds(teams, baseRounds) {
  const awayOf = new Map(baseRounds.flat().map((g) => [pairKey(g), g.away_team_id]));
  const byDivision = new Map();
  for (const t of teams) {
    if (!byDivision.has(t.division_id)) byDivision.set(t.division_id, []);
    byDivision.get(t.division_id).push(t.id);
  }

  const perDivision = [...byDivision.values()].map(generateRoundRobin);
  return Array.from({ length: EXTRA_DIVISION_ROUNDS }, (_, r) =>
    perDivision.flatMap((rounds) => rounds[r]).map((g) => {
      const home = awayOf.get(pairKey(g));
      return { home_team_id: home, away_team_id: home === g.home_team_id ? g.away_team_id : g.home_team_id };
    }));
}

function pairKey(g) {
  return [g.home_team_id, g.away_team_id].sort((a, b) => a - b).join('-');
}

// Vuelta de una conferencia: intercala una ronda de division cada 3 del round-robin.
function conferenceLeg(teams) {
  const base = generateRoundRobin(teams.map((t) => t.id));
  const extras = divisionExtraRounds(teams, base);
  const leg = [];
  base.forEach((round, i) => {
    leg.push(round);
    if ((i + 1) % 3 === 0 && extras.length) leg.push(extras.shift());
  });
  return [...leg, ...extras];
}

function generateSchedule(teams) {
  const conferences = new Map();
  for (const t of teams) {
    const conference = DIVISION_CONFERENCES[t.division?.name];
    if (!conference) throw new Error(`El equipo ${t.id} no tiene una division con conferencia`);
    if (!conferences.has(conference)) conferences.set(conference, []);
    conferences.get(conference).push(t);
  }

  const legs = [...conferences.values()].map(conferenceLeg);
  const legLength = legs[0].length;
  const games = [];
  for (const leg of legs) {
    leg.forEach((round, r) => {
      for (const g of round) {
        for (let rep = 0; rep < GAMES_PER_MATCHUP; rep++) {
          games.push({ ...g, day_number: r * GAMES_PER_MATCHUP + rep + 1 });
          games.push({
            home_team_id: g.away_team_id,
            away_team_id: g.home_team_id,
            day_number: (r + legLength) * GAMES_PER_MATCHUP + rep + 1,
          });
        }
      }
    });
  }
  return games;
}

module.exports = { generateSchedule };
