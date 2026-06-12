// Round-robin simple (metodo del circulo): con 16 equipos, da 15 rondas
// de 8 partidos cada una = 120 partidos en total, donde cada equipo
// juega exactamente una vez contra cada uno de los otros 15.
//
// Recibe un array de equipos [{id, division_id}, ...] (16 items)
// Devuelve [{day_number, home_team_id, away_team_id}, ...]

function generateSchedule(teams) {
  const n = teams.length;
  const games = [];

  // Copia de IDs; si n es impar se agregaria un "bye" (null) - no aplica aqui (16)
  const ids = teams.map((t) => t.id);

  const half = n / 2;
  const rounds = n - 1;

  // Arreglo rotativo: fijamos ids[0], rotamos el resto
  let arr = ids.slice(1); // n-1 elementos

  for (let round = 0; round < rounds; round++) {
    const dayNumber = round + 1;
    const roundIds = [ids[0], ...arr];

    for (let i = 0; i < half; i++) {
      const teamA = roundIds[i];
      const teamB = roundIds[n - 1 - i];

      // Alternar local/visitante segun la ronda para repartir partidos en casa
      const homeFirst = (round + i) % 2 === 0;
      const home = homeFirst ? teamA : teamB;
      const away = homeFirst ? teamB : teamA;

      games.push({ day_number: dayNumber, home_team_id: home, away_team_id: away });
    }

    // Rotar: el ultimo elemento pasa al frente
    arr = [arr[arr.length - 1], ...arr.slice(0, arr.length - 1)];
  }

  return games;
}

module.exports = { generateSchedule };
