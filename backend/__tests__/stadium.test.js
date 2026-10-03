const request = require('supertest');

jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { mockTeam, mockSeason } = require('./mockData');
const { GRANDSTAND_MAX_LEVEL, STADIUM_FACILITIES, FACILITY_UPKEEP_PER_LEVEL } = require('../config');
const {
  getFacilityUpgradeCost,
  getFacilityBonuses,
  describeFacilities,
} = require('../services/stadiumFacilityService');
const { computeHomeGameRevenue, computeMaintenanceCost } = require('../services/economy');

const app = require('../index');

const grandstand = (level) => ({
  id: 7, team_id: 1, row_pos: 3, col_pos: 1, section_type: 'grandstand',
  label: 'Grada Norte', price_per_ticket: 15, upgrade_level: level, capacity: 100 * 2 ** (level - 1),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('stadiumFacilityService', () => {
  it('costs base * factor^(level-1) and returns null at max', () => {
    expect(getFacilityUpgradeCost('lights', 1)).toBe(1_000_000);
    expect(getFacilityUpgradeCost('lights', 4)).toBe(8_000_000);
    expect(getFacilityUpgradeCost('lights', 5)).toBeNull();
    expect(getFacilityUpgradeCost('field', 9)).toBe(128_000_000);
    expect(getFacilityUpgradeCost('field', 10)).toBeNull();
    expect(getFacilityUpgradeCost('nope', 1)).toBeNull();
  });

  it('bonuses are neutral at level 1 (and for missing team)', () => {
    const neutral = { attendanceRateBonus: 0, merchMultiplier: 1, injuryProbMultiplier: 1, injuryDaysReduction: 0, upkeep: 0 };
    expect(getFacilityBonuses({ field_level: 1, lights_level: 1, board_level: 1, medical_level: 1 })).toEqual(neutral);
    expect(getFacilityBonuses(null)).toEqual(neutral);
  });

  it('bonuses at max levels', () => {
    const b = getFacilityBonuses({ field_level: 10, lights_level: 5, board_level: 5, medical_level: 5 });
    expect(b.attendanceRateBonus).toBeCloseTo(9 * 0.003 + 4 * 0.005);
    expect(b.merchMultiplier).toBeCloseTo(1.24);
    expect(b.injuryProbMultiplier).toBeCloseTo(0.68);
    expect(b.injuryDaysReduction).toBe(2);
    expect(b.upkeep).toBe((9 + 4 + 4 + 4) * FACILITY_UPKEEP_PER_LEVEL);
  });

  it('describeFacilities lists every facility starting at level 1', () => {
    const list = describeFacilities({});
    expect(list.map((f) => f.key)).toEqual(Object.keys(STADIUM_FACILITIES));
    expect(list.every((f) => f.level === 1 && f.next_cost > 0 && f.nextLevelName)).toBe(true);
    expect(list.find((f) => f.key === 'field').max).toBe(10);
  });
});

describe('economy with facility bonuses', () => {
  const sections = [{ capacity: 100000, price_per_ticket: 10 }];

  it('is unchanged without bonuses', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const r = computeHomeGameRevenue(sections, 50, 100000);
    expect(r.attendance).toBe(4000);
    expect(r.merchRevenue).toBe(20000);
    expect(r.operatingCost).toBe(2001); // 4000 asistentes, casi el minimo de $0.5/persona
  });

  it('applies attendance, merch and upkeep bonuses', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const r = computeHomeGameRevenue(sections, 50, 100000, false, 0, {
      attendanceRateBonus: 0.02, merchMultiplier: 1.5, upkeep: 3000,
    });
    expect(r.attendance).toBe(6000);
    expect(r.merchRevenue).toBe(30000);
    expect(r.operatingCost).toBe(6002); // 6000 asistentes (~$0.5/persona) + 3000 de upkeep
  });
});

describe('computeMaintenanceCost', () => {
  it('costs nothing with no attendance', () => {
    expect(computeMaintenanceCost(0)).toBe(0);
  });

  it('reaches $10 per fan at 1M attendance and stays capped above it', () => {
    expect(computeMaintenanceCost(1_000_000)).toBe(10_000_000);
    expect(computeMaintenanceCost(2_000_000)).toBe(20_000_000);
  });

  it('grows with an accelerated curve', () => {
    expect(computeMaintenanceCost(500_000)).toBe(1_437_500); // $2.875/persona
  });

  it('charges more per fan as attendance grows', () => {
    const perFan = [50_000, 200_000, 500_000, 900_000].map((a) => computeMaintenanceCost(a) / a);
    for (let i = 1; i < perFan.length; i++) expect(perFan[i]).toBeGreaterThan(perFan[i - 1]);
    expect(perFan[0]).toBeGreaterThanOrEqual(0.5);
  });
});

describe('GET /api/stadium', () => {
  it('returns facilities and no upgrade cost for grandstands at max level', async () => {
    prisma.stadiumSection.findMany.mockResolvedValue([grandstand(GRANDSTAND_MAX_LEVEL), grandstand(3)]);
    prisma.team.findUnique.mockResolvedValue({ ...mockTeam, stadium_floors: 1, field_level: 4 });

    const res = await request(app).get('/api/stadium');
    expect(res.status).toBe(200);
    expect(res.body.max_grandstand_level).toBe(15);
    expect(res.body.sections[0].next_upgrade_cost).toBeNull();
    expect(res.body.sections[1].next_upgrade_cost).toBe(400000);
    expect(res.body.facilities.find((f) => f.key === 'field').level).toBe(4);
  });
});

describe('POST /api/stadium/:id/upgrade', () => {
  it('rejects grandstands already at level 15', async () => {
    prisma.stadiumSection.findUnique.mockResolvedValue(grandstand(GRANDSTAND_MAX_LEVEL));
    const res = await request(app).post('/api/stadium/7/upgrade');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nivel maximo/);
    expect(prisma.stadiumSection.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/stadium/facilities/:key/upgrade', () => {
  it('upgrades a facility, charges the budget and logs a finance entry', async () => {
    prisma.team.findUnique.mockResolvedValue({ ...mockTeam, budget: 5_000_000, lights_level: 2 });
    prisma.season.findFirst.mockResolvedValue(mockSeason);

    const res = await request(app).post('/api/stadium/facilities/lights/upgrade');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ newLevel: 3, cost: 2_000_000, newBudget: 3_000_000 });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { budget: 3_000_000, lights_level: 3 },
    });
    expect(prisma.finance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'stadium_upgrade', amount: -2_000_000, season_day: 5 }),
    }));
  });

  it('returns 404 for an unknown facility', async () => {
    const res = await request(app).post('/api/stadium/facilities/roof/upgrade');
    expect(res.status).toBe(404);
  });

  it('rejects upgrades past the max level', async () => {
    prisma.team.findUnique.mockResolvedValue({ ...mockTeam, field_level: 10 });
    const res = await request(app).post('/api/stadium/facilities/field/upgrade');
    expect(res.status).toBe(400);
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it('rejects when the budget is insufficient', async () => {
    prisma.team.findUnique.mockResolvedValue({ ...mockTeam, budget: 100, medical_level: 1 });
    const res = await request(app).post('/api/stadium/facilities/medical/upgrade');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Presupuesto insuficiente', cost: 4_000_000 });
    expect(prisma.team.update).not.toHaveBeenCalled();
  });
});
