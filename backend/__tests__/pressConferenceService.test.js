jest.mock('../db/prisma');
jest.mock('../services/newsService', () => ({ createNews: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/rivalryService', () => ({
  getRivalryIntensity: jest.fn().mockResolvedValue(0),
  adjustRivalryIntensity: jest.fn().mockResolvedValue({}),
}));
jest.mock('../services/broadcastService', () => ({
  getTeamBroadcasts: jest.fn().mockResolvedValue({ 1: [] }),
}));

const prisma = require('../db/prisma');
const { createNews } = require('../services/newsService');
const { adjustRivalryIntensity } = require('../services/rivalryService');
const { getTeamBroadcasts } = require('../services/broadcastService');
const {
  groupIntoSeries,
  seriesProgress,
  seriesUntilNextConference,
  audienceBonus,
  maybeCreateAfterUserGame,
  maybeCreateAfterGroupStage,
  answerConference,
  skipConference,
  settlePressSeason,
} = require('../services/pressConferenceService');
const {
  USER_TEAM_ID,
  PRESS_SERIES_INTERVAL,
  PRESS_SKIP_AUDIENCE_PENALTY,
  PRESS_AUDIENCE_BONUS_MAX_PCT,
  PRESS_RIVALRY_PROVOKE_BONUS,
} = require('../config');

// Calendario del usuario: `blocks` series de 3 partidos, rivales 2, 3, 4...; el usuario es local.
function schedule(blocks, finishedUpTo, { lose = [] } = {}) {
  const games = [];
  let id = 1;
  for (let b = 0; b < blocks; b++) {
    for (let g = 0; g < 3; g++) {
      const finished = id <= finishedUpTo;
      const lost = lose.includes(id);
      games.push({
        id,
        season_id: 7,
        day_number: id,
        home_team_id: USER_TEAM_ID,
        away_team_id: 2 + b,
        home_score: finished ? (lost ? 1 : 5) : null,
        away_score: finished ? (lost ? 4 : 2) : null,
        status: finished ? 'finished' : 'scheduled',
        is_user_game: true,
        playoff_series_id: null,
      });
      id++;
    }
  }
  return games;
}

const season = { id: 7, current_day: 30, status: 'active' };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.pressConference.findMany.mockResolvedValue([]);
  prisma.pressConference.findFirst.mockResolvedValue(null);
  prisma.pressConference.create.mockImplementation(({ data }) => Promise.resolve({ id: 11, ...data }));
  prisma.pressConference.update.mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
  prisma.season.findUnique.mockResolvedValue(season);
  prisma.team.findUnique.mockImplementation(({ where }) => Promise.resolve(
    where.id === USER_TEAM_ID
      ? { id: USER_TEAM_ID, name: 'Halcones', division_id: 1, division: { name: 'Oeste Norte' }, press_audience: 50 }
      : { id: where.id, name: `Rival ${where.id}` }
  ));
  prisma.team.findMany.mockResolvedValue([{ id: USER_TEAM_ID }, { id: 2 }, { id: 3 }]);
  prisma.team.update.mockResolvedValue({});
  prisma.newsItem.findFirst.mockResolvedValue(null);
  prisma.player.findFirst.mockResolvedValue(null);
  prisma.broadcastRelation.findUnique.mockResolvedValue(null);
  prisma.broadcastRelation.upsert.mockResolvedValue({});
  prisma.broadcastRelation.findMany.mockResolvedValue([]);
  prisma.broadcastRelation.update.mockResolvedValue({});
  prisma.broadcastContract.findMany.mockResolvedValue([]);
  prisma.broadcastCompany.update.mockResolvedValue({});
  prisma.finance.create.mockResolvedValue({});
  getTeamBroadcasts.mockResolvedValue({ [USER_TEAM_ID]: [] });
});

function mockSchedule(games) {
  prisma.gameSchedule.findMany.mockImplementation(({ where }) => Promise.resolve(
    where.playoff_series_id === null ? games : games.filter((g) => g.status === 'finished').reverse()
  ));
}

describe('series helpers', () => {
  it('groups consecutive games against the same opponent', () => {
    const series = groupIntoSeries(schedule(3, 0));
    expect(series).toHaveLength(3);
    expect(series.map((s) => s.opponentId)).toEqual([2, 3, 4]);
  });

  it('detects the game that closes a series and its record', () => {
    const games = schedule(2, 6, { lose: [5] });
    expect(seriesProgress(games, 5).closes).toBe(false);
    expect(seriesProgress(games, 6)).toEqual({ closes: true, seriesNumber: 2, wins: 2, losses: 1, opponentId: 3 });
  });

  it('counts series until the next conference', () => {
    expect(seriesUntilNextConference(schedule(4, 6))).toEqual({ completed: 2, untilNext: PRESS_SERIES_INTERVAL - 2 });
  });

  it('pays a bonus only above the base audience', () => {
    expect(audienceBonus(1_000_000, 50)).toBe(0);
    expect(audienceBonus(1_000_000, 30)).toBe(0);
    expect(audienceBonus(1_000_000, 100)).toBe(Math.round(1_000_000 * PRESS_AUDIENCE_BONUS_MAX_PCT));
  });
});

describe('maybeCreateAfterUserGame', () => {
  it(`creates a conference when the ${PRESS_SERIES_INTERVAL}th series ends`, async () => {
    const games = schedule(4, 9);
    mockSchedule(games);
    const conf = await maybeCreateAfterUserGame(games[8]);
    expect(conf).toBeTruthy();
    expect(conf.trigger).toBe('series');
    expect(conf.opponent_team_id).toBe(4);
    expect(conf.status).toBe('pending');
    expect(conf.questions[0].tag).toBe('series_sweep');
    expect(conf.host_company_id).toBeNull();
  });

  it('does nothing mid-series or on a series that is not a multiple of the interval', async () => {
    const games = schedule(4, 9);
    mockSchedule(games);
    expect(await maybeCreateAfterUserGame(games[7])).toBeNull();
    expect(await maybeCreateAfterUserGame(games[5])).toBeNull();
    expect(prisma.pressConference.create).not.toHaveBeenCalled();
  });

  it('skips the previous pending conference first', async () => {
    const games = schedule(4, 4);
    mockSchedule(games);
    prisma.pressConference.findMany.mockResolvedValueOnce([{ id: 3, season_id: 7, day: 9, host_company_id: 50, status: 'pending' }]);
    await maybeCreateAfterUserGame(games[3]);
    expect(prisma.pressConference.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 3 }, data: expect.objectContaining({ status: 'skipped' }),
    }));
  });

  it('hosts the conference with a contracted broadcaster, TV first', async () => {
    const games = schedule(3, 9);
    mockSchedule(games);
    getTeamBroadcasts.mockResolvedValue({ [USER_TEAM_ID]: [{ id: 8, type: 'RADIO' }, { id: 9, type: 'TV' }] });
    const conf = await maybeCreateAfterUserGame(games[8]);
    expect(conf.host_company_id).toBe(9);
  });

  it('creates a playoff conference when the user series is decided', async () => {
    prisma.playoffSeries.findUnique.mockResolvedValue({
      id: 70, round: 3, status: 'completed', home_team_id: USER_TEAM_ID, away_team_id: 5, winner_id: USER_TEAM_ID,
    });
    mockSchedule([]);
    const conf = await maybeCreateAfterUserGame({ id: 500, season_id: 7, day_number: 1031, playoff_series_id: 70 });
    expect(conf.trigger).toBe('playoff_series');
    expect(conf.questions[0].tag).toBe('playoff_champion');
  });

  it('ignores playoff games that do not end a series and group games', async () => {
    prisma.playoffSeries.findUnique.mockResolvedValueOnce({ id: 70, round: 1, status: 'active' });
    expect(await maybeCreateAfterUserGame({ id: 1, season_id: 7, playoff_series_id: 70 })).toBeNull();
    prisma.playoffSeries.findUnique.mockResolvedValueOnce({ id: 71, round: 0, status: 'completed' });
    expect(await maybeCreateAfterUserGame({ id: 2, season_id: 7, playoff_series_id: 71 })).toBeNull();
  });
});

describe('maybeCreateAfterGroupStage', () => {
  it('creates a qualified conference once', async () => {
    mockSchedule([]);
    prisma.playoffSeries.findFirst
      .mockResolvedValueOnce({ id: 1, round: 0 })
      .mockResolvedValueOnce({ id: 9, round: 1 });
    const conf = await maybeCreateAfterGroupStage(7);
    expect(conf.trigger).toBe('playoff_group');
    expect(conf.questions[0].tag).toBe('playoff_group_qualified');

    prisma.playoffSeries.findFirst.mockResolvedValueOnce({ id: 1, round: 0 });
    prisma.pressConference.findFirst.mockResolvedValueOnce({ id: 11, trigger: 'playoff_group' });
    expect(await maybeCreateAfterGroupStage(7)).toBeNull();
  });

  it('does nothing if the user did not play the group stage', async () => {
    prisma.playoffSeries.findFirst.mockResolvedValueOnce(null);
    expect(await maybeCreateAfterGroupStage(7)).toBeNull();
  });
});

describe('answering and skipping', () => {
  const questions = [
    { id: 'q1', mood: 'good', rival: true, options: [{ tone: 'provocador', quote: 'Que tiemblen.' }, { tone: 'humilde', quote: 'Calma.' }] },
  ];
  const pending = { id: 11, season_id: 7, day: 30, opponent_team_id: 4, host_company_id: 9, status: 'pending', questions };

  it('applies audience (clamped), host satisfaction, rivalry and publishes news', async () => {
    prisma.pressConference.findUnique.mockResolvedValue(pending);
    prisma.team.findUnique.mockImplementation(({ where }) => Promise.resolve(
      where.id === USER_TEAM_ID ? { name: 'Halcones', press_audience: 98 } : { name: 'Toros' }
    ));
    const result = await answerConference(11, [{ questionId: 'q1', tone: 'provocador' }]);

    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: USER_TEAM_ID }, data: { press_audience: 100 } });
    expect(prisma.broadcastRelation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { company_id: 9, team_id: USER_TEAM_ID, satisfaction: 47 },
    }));
    expect(adjustRivalryIntensity).toHaveBeenCalledWith(USER_TEAM_ID, 4, PRESS_RIVALRY_PROVOKE_BONUS);
    expect(createNews).toHaveBeenCalledWith('press', expect.stringContaining('Toros'), 30, 7, { teamId: USER_TEAM_ID });
    expect(result.status).toBe('answered');
    expect(result.effects).toEqual(expect.objectContaining({ audience: 5, satisfaction: -3, rivalry: PRESS_RIVALRY_PROVOKE_BONUS }));
  });

  it('without a host broadcaster only the rivalry moves', async () => {
    prisma.pressConference.findUnique.mockResolvedValue({ ...pending, host_company_id: null });
    await answerConference(11, [{ questionId: 'q1', tone: 'provocador' }]);
    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(prisma.broadcastRelation.upsert).not.toHaveBeenCalled();
    expect(adjustRivalryIntensity).toHaveBeenCalled();
  });

  it('rejects answering a finished conference', async () => {
    prisma.pressConference.findUnique.mockResolvedValue({ ...pending, status: 'answered' });
    await expect(answerConference(11, [])).rejects.toMatchObject({ code: 'PRESS_NOT_PENDING' });
  });

  it('skipping costs audience and satisfaction', async () => {
    prisma.pressConference.findUnique.mockResolvedValue(pending);
    const result = await skipConference(11);
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: USER_TEAM_ID }, data: { press_audience: 50 - PRESS_SKIP_AUDIENCE_PENALTY },
    });
    expect(result.status).toBe('skipped');
    expect(createNews).toHaveBeenCalledWith('press', expect.stringMatching(/no se presenta/), 30, 7, { teamId: USER_TEAM_ID });
  });
});

describe('settlePressSeason', () => {
  it('pays the audience bonus, resets audience and decays satisfaction', async () => {
    prisma.team.findUnique.mockResolvedValue({ press_audience: 80 });
    prisma.broadcastContract.findMany.mockResolvedValue([
      { company_id: 9, annual_payment: 2_000_000, company: { id: 9, name: 'Canal 9', type: 'TV' } },
    ]);
    prisma.broadcastRelation.findMany.mockResolvedValue([{ id: 1, satisfaction: 90 }, { id: 2, satisfaction: 50 }]);

    const result = await settlePressSeason(season);
    const expected = Math.round(2_000_000 * PRESS_AUDIENCE_BONUS_MAX_PCT * 0.6);
    expect(result.bonuses).toEqual([{ companyId: 9, amount: expected }]);
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: USER_TEAM_ID }, data: { budget: { increment: expected } } });
    expect(prisma.broadcastCompany.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { money: { decrement: expected } } });
    expect(prisma.finance.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'broadcast_bonus', amount: expected }) });
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: USER_TEAM_ID }, data: { press_audience: 50 } });
    expect(prisma.broadcastRelation.update).toHaveBeenCalledTimes(1);
    expect(prisma.broadcastRelation.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { satisfaction: 80 } });
  });

  it('pays nothing at or below the base audience', async () => {
    prisma.team.findUnique.mockResolvedValue({ press_audience: 40 });
    prisma.broadcastContract.findMany.mockResolvedValue([
      { company_id: 9, annual_payment: 2_000_000, company: { id: 9, name: 'Canal 9', type: 'TV' } },
    ]);
    const result = await settlePressSeason(season);
    expect(result.bonuses).toEqual([]);
    expect(prisma.finance.create).not.toHaveBeenCalled();
  });
});
