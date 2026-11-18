const request = require('supertest');

jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { evaluateUnlocks, getFranchiseMilestones, MUSIC_UNLOCKS } = require('../services/musicUnlockService');

const app = require('../index');

function mockSave({ seasons = 0, playoffSeasons = 0, championships = 0, retired = 0, hof = 0 } = {}) {
  prisma.seasonRecord.count.mockResolvedValue(seasons);
  prisma.playoffSeries.findMany.mockResolvedValue(
    Array.from({ length: playoffSeasons }, (_, i) => ({ season_id: i + 1 })),
  );
  prisma.playoffSeries.count.mockResolvedValue(championships);
  prisma.retiredNumber.count.mockResolvedValue(retired);
  prisma.hallOfFameCandidate.count.mockResolvedValue(hof);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('evaluateUnlocks', () => {
  it('locks everything for a brand new franchise', () => {
    const songs = evaluateUnlocks({ seasons: 0, playoffAppearances: 0, championships: 0, retiredNumbers: 0, hallOfFamers: 0 });
    expect(songs).toHaveLength(MUSIC_UNLOCKS.length);
    expect(songs.every((s) => !s.unlocked && s.progress === 0)).toBe(true);
  });

  it('unlocks by thresholds and caps progress at the goal', () => {
    const songs = evaluateUnlocks({ seasons: 19, playoffAppearances: 16, championships: 12, retiredNumbers: 2, hallOfFamers: 0 });
    const byId = Object.fromEntries(songs.map((s) => [s.trackId, s]));
    expect(byId.track_06).toMatchObject({ unlocked: true, progress: 1, goal: 1 });
    expect(byId.track_10).toMatchObject({ unlocked: true, progress: 5 });
    expect(byId.track_11).toMatchObject({ unlocked: false, progress: 0 });
    expect(byId.track_12).toMatchObject({ unlocked: false, progress: 12, goal: 15 });
  });
});

describe('getFranchiseMilestones', () => {
  it('counts the user team finals won, distinct playoff seasons and legacy', async () => {
    mockSave({ seasons: 3, playoffSeasons: 2, championships: 1, retired: 1, hof: 1 });
    const m = await getFranchiseMilestones(1);
    expect(m).toEqual({ seasons: 3, playoffAppearances: 2, championships: 1, retiredNumbers: 1, hallOfFamers: 1 });
    expect(prisma.playoffSeries.count).toHaveBeenCalledWith({ where: { round: 3, winner_id: 1 } });
    expect(prisma.hallOfFameCandidate.count).toHaveBeenCalledWith({ where: { status: 'inducted', primary_team_id: 1 } });
  });
});

describe('GET /api/music/unlocks', () => {
  it('returns the unlocked track ids and every song state', async () => {
    mockSave({ seasons: 2, playoffSeasons: 1, championships: 0 });
    const res = await request(app).get('/api/music/unlocks');
    expect(res.status).toBe(200);
    expect(res.body.unlocked).toEqual(['track_06', 'track_07']);
    expect(res.body.songs).toHaveLength(MUSIC_UNLOCKS.length);
  });
});
