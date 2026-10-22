const request = require('supertest');

jest.mock('../db/prisma');
jest.mock('../services/newsService', () => ({ createNews: jest.fn().mockResolvedValue({}) }));

const prisma = require('../db/prisma');
const { createNews } = require('../services/newsService');
const {
  runHallOfFameSeason,
  summarizeCareer,
  computeLegacyScore,
  percentileOf,
  computeVotePct,
  resolveVote,
  roleOf,
} = require('../services/legacyService');
const { USER_TEAM_ID, HISTORICAL_CPU_STAT_DIVISOR, HOF_INDUCTION_REPUTATION_BONUS } = require('../config');

const app = require('../index');

const season = { id: 20, current_day: 99 };
const noNoise = () => 0.5; // ruido = 0

function record(overrides = {}) {
  return {
    season_id: 1,
    team_id: USER_TEAM_ID,
    games: 0, at_bats: 0, hits: 0, home_runs: 0, walks: 0, strikeouts: 0, rbi: 0,
    pitching_games: 0, pitching_outs: 0, earned_runs: 0, pitching_strikeouts: 0,
    hits_allowed: 0, wins: 0, losses: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.hallOfFameCandidate.findMany.mockResolvedValue([]);
  prisma.hallOfFameCandidate.update.mockResolvedValue({});
  prisma.hallOfFameCandidate.create.mockResolvedValue({});
  prisma.player.findMany.mockResolvedValue([]);
  prisma.playerSeasonRecord.findMany.mockResolvedValue([]);
  prisma.seasonAward.findMany.mockResolvedValue([]);
});

describe('pure helpers', () => {
  it('roleOf maps P to PITCHER and everything else to BATTER', () => {
    expect(roleOf('P')).toBe('PITCHER');
    expect(roleOf('SS')).toBe('BATTER');
  });

  it('summarizeCareer weights CPU stints, counts seasons and picks the primary team', () => {
    const career = summarizeCareer([
      record({ season_id: 1, team_id: 5, hits: 30, home_runs: 9 }),
      record({ season_id: 2, team_id: 5, hits: 30 }),
      record({ season_id: 3, team_id: USER_TEAM_ID, hits: 40, home_runs: 10 }),
    ]);
    expect(career.seasonsPlayed).toBe(3);
    expect(career.primaryTeamId).toBe(5);
    expect(career.careerTotals.hits).toBe(100);
    expect(career.weighted.hits).toBeCloseTo(40 + 60 / HISTORICAL_CPU_STAT_DIVISOR);
    expect(career.weighted.home_runs).toBeCloseTo(10 + 9 / HISTORICAL_CPU_STAT_DIVISOR);
  });

  it('summarizeCareer breaks primary-team ties by the most recent team', () => {
    const career = summarizeCareer([
      record({ season_id: 1, team_id: 5 }),
      record({ season_id: 2, team_id: 7 }),
    ]);
    expect(career.primaryTeamId).toBe(7);
  });

  it('summarizeCareer computes ERA from outs and earned runs', () => {
    const { careerTotals } = summarizeCareer([record({ pitching_games: 10, pitching_outs: 270, earned_runs: 30 })]);
    expect(careerTotals.innings_pitched).toBe(90);
    expect(careerTotals.era).toBe(3);
  });

  it('computeLegacyScore adds award points and never goes negative', () => {
    const base = computeLegacyScore('BATTER', { hits: 100, home_runs: 10, rbi: 50, walks: 0 });
    expect(computeLegacyScore('BATTER', { hits: 100, home_runs: 10, rbi: 50, walks: 0 }, ['MVP'])).toBe(base + 40);
    expect(computeLegacyScore('PITCHER', { wins: 0, strikeouts: 0, innings: 0, earned_runs: 500 })).toBe(0);
  });

  it('percentileOf counts ties as half', () => {
    expect(percentileOf(5, [1, 2, 3, 4, 5])).toBeCloseTo(0.9);
    expect(percentileOf(10, [])).toBe(1);
  });

  it('computeVotePct is linear between the ballot percentile and 1.0, plus momentum', () => {
    expect(computeVotePct(0.9, 0, noNoise)).toBe(5);
    expect(computeVotePct(1, 0, noNoise)).toBe(95);
    expect(computeVotePct(0.95, 2, noNoise)).toBe(56);
  });

  it('resolveVote: induction at 75%, drop under 5% or after 10 years', () => {
    expect(resolveVote(75, 1)).toBe('inducted');
    expect(resolveVote(4.9, 1)).toBe('dropped');
    expect(resolveVote(60, 10)).toBe('dropped');
    expect(resolveVote(60, 3)).toBe('candidate');
  });
});

describe('runHallOfFameSeason', () => {
  const candidate = (overrides) => ({
    id: 1,
    player_id: 100,
    role: 'BATTER',
    legacy_score: 500,
    primary_team_id: USER_TEAM_ID,
    years_on_ballot: 0,
    vote_history: [],
    player: { first_name: 'Juan', last_name: 'Leyenda' },
    ...overrides,
  });

  it('inducts a top candidate, records the vote and rewards the primary team', async () => {
    // pool: el candidato es el mejor de 50 -> percentil 0.99 -> 86% sin ruido
    const pool = Array.from({ length: 49 }, (_, i) => ({ role: 'BATTER', legacy_score: i }));
    prisma.hallOfFameCandidate.findMany
      .mockResolvedValueOnce([...pool, { role: 'BATTER', legacy_score: 500 }])
      .mockResolvedValueOnce([candidate()]);
    prisma.team.findUnique.mockResolvedValue({ reputation: 100 });

    const { votes } = await runHallOfFameSeason(season, noNoise);

    expect(votes).toEqual([{ id: 1, player_id: 100, status: 'inducted', pct: 86 }]);
    expect(prisma.hallOfFameCandidate.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: 'inducted',
        years_on_ballot: 1,
        last_vote_pct: 86,
        vote_history: [{ season_id: 20, pct: 86 }],
        inducted_season_id: 20,
      },
    });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: USER_TEAM_ID },
      data: { reputation: 100 + HOF_INDUCTION_REPUTATION_BONUS },
    });
    expect(createNews).toHaveBeenCalledWith(
      'hall_of_fame',
      expect.stringContaining('Juan Leyenda entra al Salón de la Fama'),
      99,
      20,
      { teamId: USER_TEAM_ID, alert: true },
    );
  });

  it('only votes candidates registered in earlier seasons', async () => {
    await runHallOfFameSeason(season, noNoise);
    expect(prisma.hallOfFameCandidate.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { status: 'candidate', evaluated_season_id: { lt: 20 } },
    }));
  });

  it('keeps a mid candidate on the ballot and drops one that falls under 5%', async () => {
    const pool = Array.from({ length: 20 }, (_, i) => ({ role: 'BATTER', legacy_score: i * 10 }));
    prisma.hallOfFameCandidate.findMany
      .mockResolvedValueOnce(pool)
      .mockResolvedValueOnce([
        candidate({ id: 1, legacy_score: 185, primary_team_id: 4 }), // percentil 0.95 -> 50%
        candidate({ id: 2, legacy_score: 100, primary_team_id: 4 }), // percentil bajo -> 0%
      ]);

    const { votes } = await runHallOfFameSeason(season, noNoise);

    expect(votes.map((v) => v.status)).toEqual(['candidate', 'dropped']);
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it('registers retirees: best one goes to the ballot, short careers are not_qualified', async () => {
    const pool = Array.from({ length: 18 }, (_, i) => ({ role: 'BATTER', legacy_score: i }));
    prisma.hallOfFameCandidate.findMany.mockResolvedValueOnce(pool).mockResolvedValueOnce([]);
    prisma.player.findMany.mockResolvedValue([
      { id: 10, first_name: 'Star', last_name: 'One', position: 'CF' },
      { id: 11, first_name: 'Brief', last_name: 'Two', position: 'C' },
    ]);
    const starSeasons = [1, 2, 3, 4, 5, 6].map((s) => record({ player_id: 10, season_id: s, hits: 50, home_runs: 10, rbi: 40 }));
    prisma.playerSeasonRecord.findMany.mockResolvedValue([
      ...starSeasons,
      record({ player_id: 11, season_id: 1, hits: 500 }),
    ]);
    prisma.seasonAward.findMany.mockResolvedValue([{ player_id: 10, category: 'MVP' }]);

    const { registered } = await runHallOfFameSeason(season, noNoise);

    expect(registered).toEqual([10]);
    const creates = prisma.hallOfFameCandidate.create.mock.calls.map(([arg]) => arg.data);
    expect(creates).toEqual([
      expect.objectContaining({ player_id: 10, role: 'BATTER', seasons_played: 6, status: 'candidate', evaluated_season_id: 20 }),
      expect.objectContaining({ player_id: 11, seasons_played: 1, status: 'not_qualified' }),
    ]);
    expect(createNews).toHaveBeenCalledWith('hall_of_fame', expect.stringContaining('Star One'), 99, 20);
  });
});

describe('GET /api/history/hall-of-fame', () => {
  it('splits inducted and ballot entries with editions', async () => {
    prisma.season.findMany.mockResolvedValue([{ id: 7 }, { id: 8 }, { id: 9 }]);
    prisma.hallOfFameCandidate.findMany.mockResolvedValue([
      {
        player_id: 1, status: 'inducted', role: 'BATTER', legacy_score: 900, seasons_played: 12,
        career_totals: { hits: 400 }, primary_team_id: USER_TEAM_ID, years_on_ballot: 1, last_vote_pct: 90,
        vote_history: [{ season_id: 9, pct: 90 }], inducted_season_id: 9, evaluated_season_id: 8,
        player: { first_name: 'A', last_name: 'B', position: 'SS' }, primary_team: { name: 'Team X' },
      },
      {
        player_id: 2, status: 'candidate', role: 'PITCHER', legacy_score: 600, seasons_played: 9,
        career_totals: { wins: 80 }, primary_team_id: 3, years_on_ballot: 0, last_vote_pct: null,
        vote_history: null, inducted_season_id: null, evaluated_season_id: 9,
        player: { first_name: 'C', last_name: 'D', position: 'P' }, primary_team: null,
      },
    ]);

    const res = await request(app).get('/api/history/hall-of-fame');

    expect(res.status).toBe(200);
    expect(res.body.inducted).toHaveLength(1);
    expect(res.body.inducted[0]).toMatchObject({ player_name: 'A B', is_user_team: true, inducted_edition: 3, vote_history: [{ edition: 3, pct: 90 }] });
    expect(res.body.ballot[0]).toMatchObject({ player_name: 'C D', team_name: null, retired_edition: 3, vote_history: [] });
    expect(res.body.rules).toEqual({ induction_pct: 75, drop_pct: 5, max_years: 10 });
  });
});
