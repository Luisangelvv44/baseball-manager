// Double round-robin: cada par de equipos se enfrenta dos veces (local y visitante).
// Con 16 equipos: 30 dias, 240 partidos, cada equipo juega 30 (15 en casa, 15 fuera).
//
// La primera vuelta usa el metodo del circulo (15 rondas).
// La segunda vuelta invierte local/visitante y corre en los dias 16-30.

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

function generateSchedule(teams) {
  const firstLeg = generateRoundRobin(teams);
  const offset = firstLeg[firstLeg.length - 1].day_number;

  const secondLeg = firstLeg.map((g) => ({
    day_number: g.day_number + offset,
    home_team_id: g.away_team_id,
    away_team_id: g.home_team_id,
  }));

  return [...firstLeg, ...secondLeg];
}

module.exports = { generateSchedule };
