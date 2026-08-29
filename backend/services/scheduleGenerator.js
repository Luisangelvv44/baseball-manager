// Double round-robin: cada par de equipos se enfrenta dos veces (local y visitante).
// Con 16 equipos el calendario base son 30 dias / 240 partidos, y luego cada dia
// se repite GAMES_PER_MATCHUP veces en dias consecutivos: con el valor por defecto (3)
// la temporada regular queda en 90 dias / 720 partidos, cada equipo juega 90
// (45 en casa, 45 fuera), mismo rival y mismo local/visitante los 3 dias seguidos.
//
// La primera vuelta usa el metodo del circulo (15 rondas).
// La segunda vuelta invierte local/visitante y corre en los dias 16-30.

const { GAMES_PER_MATCHUP } = require('../config');

function generateRoundRobin(teams) {
  const n = teams.length;
  const games = [];
  const ids = teams.map((t) => t.id);
  const half = n / 2;
  const rounds = n - 1;

  let arr = ids.slice(1);

  for (let round = 0; round < rounds; round++) {
    const dayNumber = round + 1;
    const roundIds = [ids[0], ...arr];

    for (let i = 0; i < half; i++) {
      const teamA = roundIds[i];
      const teamB = roundIds[n - 1 - i];

      const homeFirst = (round + i) % 2 === 0;
      const home = homeFirst ? teamA : teamB;
      const away = homeFirst ? teamB : teamA;

      games.push({ day_number: dayNumber, home_team_id: home, away_team_id: away });
    }

    arr = [arr[arr.length - 1], ...arr.slice(0, arr.length - 1)];
  }

  return games;
}

// Repite cada dia del calendario base `repeats` veces en dias consecutivos:
// dia 1 -> dias 1,2,3 ; dia 2 -> dias 4,5,6 ; ... (mismos enfrentamientos y local/visitante).
function expandSchedule(games, repeats) {
  const out = [];
  for (const g of games) {
    for (let r = 0; r < repeats; r++) {
      out.push({ ...g, day_number: (g.day_number - 1) * repeats + r + 1 });
    }
  }
  return out;
}

function generateSchedule(teams) {
  const firstLeg = generateRoundRobin(teams);
  const offset = firstLeg[firstLeg.length - 1].day_number;

  const secondLeg = firstLeg.map((g) => ({
    day_number: g.day_number + offset,
    home_team_id: g.away_team_id,
    away_team_id: g.home_team_id,
  }));

  return expandSchedule([...firstLeg, ...secondLeg], GAMES_PER_MATCHUP);
}

module.exports = { generateSchedule };
