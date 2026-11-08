jest.mock('../db/prisma');
jest.mock('../services/gamePlay', () => ({ playGame: jest.fn(), applyRandomFanChange: jest.fn() }));

const prisma = require('../db/prisma');
const {
  generatePlayoffBracket,
  buildGroupStandings,
  updateSeriesAfterGame,
  advancePlayoffRound,
} = require('../services/playoffService');

beforeEach(() => {
  jest.clearAllMocks();
});

// [homeSeed, awaySeed] del orden pedido; los resultados: el local gana salvo que se indique otra cosa.
const ORDER = [[3, 2], [3, 1], [2, 3], [2, 1], [1, 2], [1, 3]];
function groupSeries(group, seedIds, winners, diff = 1) {
  return ORDER.map(([h, a], g) => {
    const home_team_id = seedIds[h - 1];
    const away_team_id = seedIds[a - 1];
    const winner_id = seedIds[winners[g] - 1];
    const homeWon = winner_id === home_team_id;
    return {
      id: group * 10 + g,
      season_id: 1,
      round: 0,
      series_order: group * 6 + g,
      status: 'completed',
      home_team_id,
      away_team_id,
      winner_id,
      home_team: { name: `T${home_team_id}`, division: { name: `D${group}` } },
      away_team: { name: `T${away_team_id}` },
      games: [{ status: 'finished', home_score: homeWon ? diff : 0, away_score: homeWon ? 0 : diff }],
    };
  });
}

describe('generatePlayoffBracket', () => {
  it('creates the 6 group games per division in the requested order, only the first one active', async () => {
    prisma.playoffSeries.findFirst.mockResolvedValue(null);
    prisma.playoffSeries.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, home_wins: 0, away_wins: 0, ...data }));
    prisma.gameSchedule.create.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    const team = (id, division_id) => ({ id, division_id, wins: 50 - id, losses: id, desperation_index: 0, fan_base: 1000, reputation: 50 });
    prisma.team.findMany.mockResolvedValue([team(1, 1), team(2, 1), team(3, 1), team(4, 1)]);

    await generatePlayoffBracket(1);

    const created = prisma.playoffSeries.create.mock.calls.map((c) => c[0].data);
    expect(created.map((s) => [s.home_team_id, s.away_team_id])).toEqual([[3, 2], [3, 1], [2, 3], [2, 1], [1, 2], [1, 3]]);
    expect(created.map((s) => s.status)).toEqual(['active', 'pending', 'pending', 'pending', 'pending', 'pending']);
    expect(created.every((s) => s.round === 0 && s.wins_needed === 1)).toBe(true);
    expect(prisma.gameSchedule.create).toHaveBeenCalledTimes(1);
    expect(prisma.gameSchedule.create.mock.calls[0][0].data).toMatchObject({ home_team_id: 3, away_team_id: 2, day_number: 1001 });
  });
});

describe('group stage flow', () => {
  it('activates the next game of the division when one finishes', async () => {
    const series = { id: 5, season_id: 1, round: 0, series_order: 6, home_team_id: 3, away_team_id: 2, status: 'active' };
    prisma.playoffSeries.findUnique.mockResolvedValue(series);
    prisma.playoffSeries.update.mockImplementation(({ where, data }) => Promise.resolve(
      where.id === 5
        ? { ...series, ...data, home_wins: 1, away_wins: 0, wins_needed: 1 }
        : { id: where.id, season_id: 1, round: 0, series_order: 7, home_team_id: 3, away_team_id: 1, home_wins: 0, away_wins: 0, ...data }
    ));
    prisma.playoffSeries.findFirst.mockResolvedValue({ id: 6 });
    prisma.gameSchedule.create.mockResolvedValue({});

    await updateSeriesAfterGame({ playoff_series_id: 5, home_team_id: 3, away_team_id: 2 }, { homeScore: 4, awayScore: 1 });

    expect(prisma.playoffSeries.findFirst).toHaveBeenCalledWith({ where: { season_id: 1, round: 0, series_order: 7 } });
    expect(prisma.gameSchedule.create.mock.calls[0][0].data).toMatchObject({ home_team_id: 3, away_team_id: 1, day_number: 1002 });
  });

  it('does not activate anything after the last game of a division', async () => {
    const series = { id: 5, season_id: 1, round: 0, series_order: 5, home_team_id: 1, away_team_id: 3, status: 'active' };
    prisma.playoffSeries.findUnique.mockResolvedValue(series);
    prisma.playoffSeries.update.mockImplementation(({ data }) => Promise.resolve({ ...series, ...data, home_wins: 1, away_wins: 0, wins_needed: 1 }));

    await updateSeriesAfterGame({ playoff_series_id: 5, home_team_id: 1, away_team_id: 3 }, { homeScore: 2, awayScore: 1 });

    expect(prisma.playoffSeries.findFirst).not.toHaveBeenCalled();
  });

  it('ranks by wins, then run differential, then regular-season seed', () => {
    // Todos 2-2: decide la diferencia; con diff identica, la posicion de temporada regular
    const [group] = buildGroupStandings(groupSeries(0, [1, 2, 3], [3, 1, 2, 2, 1, 3]));
    expect(group.teams.map((t) => t.wins)).toEqual([2, 2, 2]);
    expect(group.teams.map((t) => t.seed)).toEqual([1, 2, 3]);
    expect(group.division).toBe('D0');
  });

  it('builds cross-division quarters, 1st vs 2nd of the sibling division', async () => {
    const series = [
      ...groupSeries(0, [1, 2, 3], [2, 1, 2, 2, 1, 1]), // 1 y 2 clasifican
      ...groupSeries(1, [4, 5, 6], [5, 4, 5, 5, 4, 4]),
      ...groupSeries(2, [7, 8, 9], [8, 7, 8, 8, 7, 7]),
      ...groupSeries(3, [10, 11, 12], [11, 10, 11, 11, 10, 10]),
    ];
    prisma.playoffSeries.findMany.mockResolvedValue(series);
    prisma.playoffSeries.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, home_wins: 0, away_wins: 0, ...data }));
    prisma.gameSchedule.create.mockResolvedValue({});

    const result = await advancePlayoffRound(1);

    expect(result).toEqual({ advanced: true, nextRound: 1 });
    const q = prisma.playoffSeries.create.mock.calls.map((c) => c[0].data);
    expect(q.map((s) => s.round)).toEqual([1, 1, 1, 1]);
    const [a1, a2] = buildGroupStandings(series)[0].teams;
    const [b1, b2] = buildGroupStandings(series)[1].teams;
    expect([q[0].home_team_id, q[0].away_team_id]).toEqual([a1.team_id, b2.team_id]);
    expect([q[1].home_team_id, q[1].away_team_id]).toEqual([b1.team_id, a2.team_id]);
    expect(q[0].wins_needed).toBe(2);
  });

  it('does not advance while group games are pending', async () => {
    const series = groupSeries(0, [1, 2, 3], [3, 1, 2, 2, 1, 3]);
    series[5].status = 'pending';
    prisma.playoffSeries.findMany.mockResolvedValue(series);

    const result = await advancePlayoffRound(1);

    expect(result.advanced).toBe(false);
    expect(prisma.playoffSeries.create).not.toHaveBeenCalled();
  });
});
