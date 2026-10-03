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
const {
  computeHomeGameRevenue,
  computeMaintenanceCost,
  getFairTicketPrice,
  getSectionFairPrice,
  ringPremium,
  priceDemandFactor,
} = require('../services/economy');
const { ringOf } = require('../seeders/generators/stadiumGenerator');

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
    const neutral = {
      attendanceRateBonus: 0, merchMultiplier: 1, injuryProbMultiplier: 1, injuryDaysReduction: 0, fairPriceBonus: 0, upkeep: 0,
    };
    expect(getFacilityBonuses({ field_level: 1, lights_level: 1, board_level: 1, medical_level: 1 })).toEqual(neutral);
    expect(getFacilityBonuses(null)).toEqual(neutral);
  });

  it('bonuses at max levels', () => {
    const b = getFacilityBonuses({ field_level: 10, lights_level: 5, board_level: 5, medical_level: 5 });
    expect(b.attendanceRateBonus).toBeCloseTo(9 * 0.003 + 4 * 0.005);
    expect(b.merchMultiplier).toBeCloseTo(1.24);
    expect(b.injuryProbMultiplier).toBeCloseTo(0.68);
    expect(b.injuryDaysReduction).toBe(2);
    expect(b.fairPriceBonus).toBe((9 + 4 + 4) * 2); // campo, luces y marcador; medicas no
    expect(b.upkeep).toBe((9 + 4 + 4 + 4) * FACILITY_UPKEEP_PER_LEVEL);
  });

  it('medical facilities do not raise the fair price', () => {
    expect(getFacilityBonuses({ medical_level: 5 }).fairPriceBonus).toBe(0);
    expect(getFacilityBonuses({ board_level: 3 }).fairPriceBonus).toBe(4);
  });

  it('describeFacilities lists every facility starting at level 1', () => {
    const list = describeFacilities({});
    expect(list.map((f) => f.key)).toEqual(Object.keys(STADIUM_FACILITIES));
    expect(list.every((f) => f.level === 1 && f.next_cost > 0 && f.nextLevelName)).toBe(true);
    expect(list.find((f) => f.key === 'field').max).toBe(10);
  });
});

describe('economy with facility bonuses', () => {
  // precio = precio justo con reputacion 50 ($35) -> la demanda no se ajusta por precio
  const sections = [{ capacity: 100000, price_per_ticket: 35 }];

  it('is unchanged without bonuses', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const r = computeHomeGameRevenue(sections, 50, 100000);
    expect(r.attendance).toBe(4000);
    expect(r.fairPrice).toBe(35);
    expect(r.ticketRevenue).toBe(140000);
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

describe('ticket price demand', () => {
  it('fair price grows with reputation and facility bonus', () => {
    expect(getFairTicketPrice(50)).toBe(35);
    expect(getFairTicketPrice(100)).toBe(60);
    expect(getFairTicketPrice(50, 10)).toBe(45);
  });

  it('demand factor: bonus below fair price, exponential drop above it', () => {
    expect(priceDemandFactor(35, 35)).toBe(1);
    expect(priceDemandFactor(0, 35)).toBeCloseTo(1.3);
    expect(priceDemandFactor(70, 35)).toBeCloseTo(Math.exp(-1));
    const factors = [0, 20, 35, 50, 70, 105, 350].map((p) => priceDemandFactor(p, 35));
    for (let i = 1; i < factors.length; i++) expect(factors[i]).toBeLessThan(factors[i - 1]);
  });

  it('cheap tickets draw more fans, capped by section capacity', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const r = computeHomeGameRevenue([{ capacity: 100000, price_per_ticket: 0 }], 50, 100000);
    expect(r.attendance).toBe(5200); // 4000 * 1.3
    expect(r.ticketRevenue).toBe(0);

    const small = computeHomeGameRevenue([{ capacity: 1000, price_per_ticket: 0 }], 50, 100000);
    expect(small.attendance).toBe(1000);
  });

  it('gouging prices earn less than the fair price', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const fair = computeHomeGameRevenue([{ capacity: 100000, price_per_ticket: 35 }], 50, 100000);
    const doubled = computeHomeGameRevenue([{ capacity: 100000, price_per_ticket: 70 }], 50, 100000);
    const gouged = computeHomeGameRevenue([{ capacity: 100000, price_per_ticket: 3500 }], 50, 100000);
    expect(doubled.ticketRevenue).toBeLessThan(fair.ticketRevenue);
    expect(gouged.attendance).toBe(0);
    expect(gouged.ticketRevenue).toBe(0);
  });

  it('each grandstand is priced independently', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const r = computeHomeGameRevenue([
      { capacity: 50000, price_per_ticket: 35 },
      { capacity: 50000, price_per_ticket: 3500 },
    ], 50, 100000);
    expect(r.attendance).toBe(2000); // solo la grada a precio justo recibe su mitad de la demanda
    expect(r.ticketRevenue).toBe(70000);
  });

  it('ring 1 (next to the field) has the highest premium; unknown/far rings use the last one', () => {
    expect(ringPremium(1)).toBe(1.5);
    expect(ringPremium(2)).toBe(1.3);
    expect(ringPremium(4)).toBe(1);
    expect(ringPremium(9)).toBe(1);
    expect(ringPremium(undefined)).toBe(1);
    expect(getSectionFairPrice(35, 1)).toBeCloseTo(52.5);
  });

  it('ringOf matches the stadium grid (field 2x2 at the center)', () => {
    // 1 planta: grid 4x4, campo en (2..3, 2..3)
    expect(ringOf(3, 1, 1)).toBe(1);
    expect(ringOf(4, 2, 1)).toBe(1);
    // 2 plantas: grid 6x6, campo en (3..4, 3..4)
    expect(ringOf(4, 2, 2)).toBe(1);
    expect(ringOf(1, 1, 2)).toBe(2);
  });

  it('closer grandstands get more of the demand and a higher fair price', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const near = { capacity: 50000, price_per_ticket: 35, ring: 1 };
    const far = { capacity: 50000, price_per_ticket: 35, ring: 4 };
    const r = computeHomeGameRevenue([near, far], 50, 100000);
    // 4000 de demanda, pesos 1.5 : 1 -> 2400 cerca (precio 35 < justo 52.5, factor 1.1) y 1600 lejos
    expect(r.attendance).toBe(2640 + 1600);

    // al mismo precio alto, la grada cercana retiene mas gente que la lejana
    const pricey = (ring) => computeHomeGameRevenue([{ capacity: 100000, price_per_ticket: 70, ring }], 50, 100000);
    expect(pricey(1).attendance).toBeGreaterThan(pricey(4).attendance);
  });

  it('buyers that do not fit in a full grandstand spill over to others with room', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const r = computeHomeGameRevenue([
      { capacity: 1000, price_per_ticket: 35, ring: 1 },
      { capacity: 100000, price_per_ticket: 35, ring: 4 },
    ], 50, 100000);
    expect(r.attendance).toBeGreaterThan(4000); // nadie se pierde: la cercana se llena y el resto va lejos
    expect(r.attendance).toBeLessThanOrEqual(4000 * 1.1 + 1);
  });

  it('accepts Decimal-like prices from Prisma', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const r = computeHomeGameRevenue([{ capacity: 100000, price_per_ticket: { valueOf: () => 35, toString: () => '35' } }], 50, 100000);
    expect(r.ticketRevenue).toBe(140000);
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
    expect(res.body.fair_price).toBe(getFairTicketPrice(mockTeam.reputation, 3 * 2)); // campo nivel 4
    expect(res.body.sections[0].ring).toBe(1);
    expect(res.body.sections[0].fair_price).toBeCloseTo(res.body.fair_price * 1.5);
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
