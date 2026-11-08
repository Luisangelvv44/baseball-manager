const { generateSchedule } = require('../services/scheduleGenerator');

const DIVISIONS = ['Division Noroeste', 'Division Suroeste', 'Division Noreste', 'Division Sureste'];
const teams = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  division_id: Math.floor(i / 6) + 1,
  division: { name: DIVISIONS[Math.floor(i / 6)] },
}));
const conferenceOf = (id) => (id <= 12 ? 'Oeste' : 'Este');

describe('generateSchedule with 24 teams', () => {
  const games = generateSchedule(teams);

  it('plays 90 days with every team exactly once per day', () => {
    expect(Math.max(...games.map((g) => g.day_number))).toBe(90);
    for (let day = 1; day <= 90; day++) {
      const ids = games.filter((g) => g.day_number === day).flatMap((g) => [g.home_team_id, g.away_team_id]);
      expect(ids).toHaveLength(24);
      expect(new Set(ids).size).toBe(24);
    }
  });

  it('only matches teams of the same conference', () => {
    expect(games.every((g) => conferenceOf(g.home_team_id) === conferenceOf(g.away_team_id))).toBe(true);
  });

  it('gives every team 45 home and 45 away games', () => {
    for (const { id } of teams) {
      expect(games.filter((g) => g.home_team_id === id)).toHaveLength(45);
      expect(games.filter((g) => g.away_team_id === id)).toHaveLength(45);
    }
  });

  it('faces every conference rival, with more games against the own division', () => {
    const vs = (a, b) => games.filter((g) => [g.home_team_id, g.away_team_id].sort((x, y) => x - y).join() === [a, b].sort((x, y) => x - y).join()).length;
    for (let rival = 7; rival <= 12; rival++) expect(vs(1, rival)).toBe(6);
    const division = [2, 3, 4, 5, 6].map((rival) => vs(1, rival)).sort((a, b) => a - b);
    expect(division).toEqual([6, 12, 12, 12, 12]);
  });

  it('repeats each series for 3 consecutive days with the same home team', () => {
    const day1 = games.filter((g) => g.day_number === 1);
    const day3 = games.filter((g) => g.day_number === 3);
    expect(day3.map((g) => [g.home_team_id, g.away_team_id])).toEqual(day1.map((g) => [g.home_team_id, g.away_team_id]));
  });
});
