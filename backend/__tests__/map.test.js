const request = require('supertest');

jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { cityName } = require('../services/mapService');

const app = require('../index');

const teams = [
  { id: 1, name: 'Brisko Wolves', division_id: 1, division: { id: 1, name: 'Norte' }, wins: 3, losses: 1 },
  { id: 2, name: 'Ostrava Bay Comets', division_id: 2, division: { id: 2, name: 'Sur' }, wins: 1, losses: 3 },
];

beforeEach(() => {
  jest.clearAllMocks();
  prisma.team.findMany.mockResolvedValue(teams);
  prisma.season.findFirst.mockResolvedValue({ id: 7, current_day: 12, status: 'active' });
});

describe('cityName', () => {
  it('drops the mascot (last word)', () => {
    expect(cityName('Brisko Wolves')).toBe('Brisko');
    expect(cityName('Ostrava Bay Comets')).toBe('Ostrava Bay');
    expect(cityName('Solo')).toBe('Solo');
  });
});

describe('GET /api/map', () => {
  it('returns cities, current location (last finished game host) and next game', async () => {
    prisma.gameSchedule.findFirst
      .mockResolvedValueOnce({ id: 40, day_number: 11, home_team_id: 2, away_team_id: 1, status: 'finished', playoff_series_id: null })
      .mockResolvedValueOnce({ id: 41, day_number: 12, home_team_id: 1, away_team_id: 2, status: 'scheduled', playoff_series_id: 3 });

    const res = await request(app).get('/api/map');
    expect(res.status).toBe(200);
    expect(res.body.teams.map((t) => t.city)).toEqual(['Brisko', 'Ostrava Bay']);
    expect(res.body.teams[0].is_user_team).toBe(true);
    expect(res.body.currentCityTeamId).toBe(2);
    expect(res.body.nextGame).toMatchObject({ id: 41, home_team_id: 1, is_playoff: true });

    const nextWhere = prisma.gameSchedule.findFirst.mock.calls[1][0].where;
    expect(nextWhere.status).toEqual({ not: 'finished' });
  });

  it('defaults the location to the home city and looks up the given gameId', async () => {
    prisma.gameSchedule.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 5, day_number: 1, home_team_id: 2, away_team_id: 1, status: 'scheduled', playoff_series_id: null });

    const res = await request(app).get('/api/map?gameId=5');
    expect(res.status).toBe(200);
    expect(res.body.currentCityTeamId).toBe(1);
    expect(res.body.nextGame.home_team_id).toBe(2);
    expect(prisma.gameSchedule.findFirst.mock.calls[1][0].where.id).toBe(5);
  });

  it('works without an active season', async () => {
    prisma.season.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/map');
    expect(res.status).toBe(200);
    expect(res.body.nextGame).toBeNull();
    expect(res.body.currentCityTeamId).toBe(1);
    expect(prisma.gameSchedule.findFirst).not.toHaveBeenCalled();
  });
});
