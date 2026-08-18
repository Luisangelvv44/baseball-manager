jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const {
  percentile,
  calculateLeagueThreshold,
  calculateLeagueMedianCostPerSkill,
  calculateBracketTax,
  calculateInefficiencyExtraPoints,
  calculateTeamLuxuryTax,
  computeLeagueLuxuryTax,
  recordLuxuryTaxProjection,
  applyLuxuryTax,
} = require('../services/luxuryTaxService');

beforeEach(() => {
  jest.clearAllMocks();
});

// Liga de referencia usada en varios tests (ver plan): 6 equipos.
// threshold = $77,500,000 (percentil 75 de las nominas)
// leagueMedianCostPerSkill = $50,000 (mediana de costo/skill)
const LEAGUE_TEAMS = [
  { id: 1, name: 'A', payroll: 60_000_000, skill: 2000 },
  { id: 2, name: 'B', payroll: 40_000_000, skill: 1000 },
  { id: 3, name: 'C', payroll: 50_000_000, skill: 1000 },
  { id: 4, name: 'D', payroll: 70_000_000, skill: 1400 },
  { id: 5, name: 'E', payroll: 80_000_000, skill: 1000 },
  { id: 6, name: 'F', payroll: 150_000_000, skill: 1500 },
];
const LEAGUE_THRESHOLD = 77_500_000;
const LEAGUE_MEDIAN_COST_PER_SKILL = 50_000;
const TEAM_F_TOTAL_TAX = 38_250_000;
// Team E (payroll $80M) also clears the $77.5M threshold: excess=$2.5M, costPerSkill=$80,000,
// ratio=1.6 -> extraPoints=min(30,(1.6-1)*10)=6 -> bracketTax=2.5M*0.20=$500,000,
// inefficiencyTax=2.5M*0.06=$150,000 -> totalTax=$650,000.
const TEAM_E_TOTAL_TAX = 650_000;

function mockLeagueQueries() {
  prisma.team.findMany.mockResolvedValue(LEAGUE_TEAMS.map((t) => ({ id: t.id, name: t.name })));
  prisma.player.findMany.mockResolvedValue(
    LEAGUE_TEAMS.map((t) => ({ team_id: t.id, salary: t.payroll, current_skill: t.skill }))
  );
}

describe('percentile', () => {
  it('interpolates linearly between two values', () => {
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(32.5);
  });

  it('returns the exact value when the index is an integer', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
});

describe('calculateLeagueThreshold / calculateLeagueMedianCostPerSkill', () => {
  it('matches the worked six-team example', () => {
    const payrolls = LEAGUE_TEAMS.map((t) => t.payroll);
    expect(calculateLeagueThreshold(payrolls)).toBe(LEAGUE_THRESHOLD);

    const costPerSkillValues = LEAGUE_TEAMS.map((t) => t.payroll / t.skill);
    expect(calculateLeagueMedianCostPerSkill(costPerSkillValues)).toBe(LEAGUE_MEDIAN_COST_PER_SKILL);
  });
});

describe('calculateTeamLuxuryTax', () => {
  it('team below threshold owes zero tax regardless of ratio', () => {
    const result = calculateTeamLuxuryTax({
      payroll: 50_000_000,
      teamSkillSum: 500, // costPerSkill=100000, muy ineficiente, pero no importa: no supera el umbral
      threshold: 77_500_000,
      leagueMedianCostPerSkill: 50_000,
    });
    expect(result.excess).toBe(0);
    expect(result.bracketTax).toBe(0);
    expect(result.inefficiencyTax).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it('bracket 1 only, efficient team', () => {
    const result = calculateTeamLuxuryTax({
      payroll: 55_000_000,
      teamSkillSum: 1100, // costPerSkill = 50000 = mediana -> ratio = 1 -> extraPoints = 0
      threshold: 50_000_000,
      leagueMedianCostPerSkill: 50_000,
    });
    expect(result.excess).toBe(5_000_000);
    expect(result.bracketTax).toBe(1_000_000);
    expect(result.inefficiencyTax).toBe(0);
    expect(result.totalTax).toBe(1_000_000);
  });

  it('bracket 2, efficient team', () => {
    const result = calculateTeamLuxuryTax({
      payroll: 70_000_000,
      teamSkillSum: 1400, // costPerSkill = 50000 = mediana -> ratio = 1
      threshold: 50_000_000,
      leagueMedianCostPerSkill: 50_000,
    });
    expect(result.excess).toBe(20_000_000);
    expect(result.bracketTax).toBe(5_500_000); // 10M*0.2 + 10M*0.35
    expect(result.inefficiencyTax).toBe(0);
    expect(result.totalTax).toBe(5_500_000);
  });

  it('bracket 3, efficient team', () => {
    const result = calculateTeamLuxuryTax({
      payroll: 90_000_000,
      teamSkillSum: 1800, // costPerSkill = 50000 = mediana -> ratio = 1
      threshold: 50_000_000,
      leagueMedianCostPerSkill: 50_000,
    });
    expect(result.excess).toBe(40_000_000);
    expect(result.bracketTax).toBe(14_750_000); // 2M + 5.25M + 7.5M
    expect(result.inefficiencyTax).toBe(0);
    expect(result.totalTax).toBe(14_750_000);
  });

  it('efficient team (ratio <= 1) never pays inefficiency tax, even above threshold', () => {
    expect(calculateInefficiencyExtraPoints(1)).toBe(0);
    expect(calculateInefficiencyExtraPoints(0.5)).toBe(0);

    const result = calculateTeamLuxuryTax({
      payroll: 90_000_000,
      teamSkillSum: 1800, // costPerSkill = 50000, ratio exacto = 1
      threshold: 50_000_000,
      leagueMedianCostPerSkill: 50_000,
    });
    expect(result.ratio).toBe(1);
    expect(result.extraPoints).toBe(0);
    expect(result.inefficiencyTax).toBe(0);
  });

  it('clamps extraPoints at the inefficiency cap', () => {
    const result = calculateTeamLuxuryTax({
      payroll: 60_000_000,
      teamSkillSum: 1200, // costPerSkill = 50000, ratio = 50000/10000 = 5
      threshold: 50_000_000,
      leagueMedianCostPerSkill: 10_000,
    });
    expect(result.excess).toBe(10_000_000);
    expect(result.ratio).toBe(5);
    expect(result.extraPoints).toBe(30); // min(30, (5-1)*10=40) = 30
    expect(result.bracketTax).toBe(2_000_000);
    expect(result.inefficiencyTax).toBe(3_000_000); // 10M * 0.30
    expect(result.totalTax).toBe(5_000_000);
  });

  it('combined realistic case (Team F from the worked example)', () => {
    const teamF = LEAGUE_TEAMS.find((t) => t.name === 'F');
    const result = calculateTeamLuxuryTax({
      payroll: teamF.payroll,
      teamSkillSum: teamF.skill,
      threshold: LEAGUE_THRESHOLD,
      leagueMedianCostPerSkill: LEAGUE_MEDIAN_COST_PER_SKILL,
    });
    expect(result.threshold).toBe(77_500_000);
    expect(result.excess).toBe(72_500_000);
    expect(result.bracketTax).toBe(31_000_000);
    expect(result.costPerSkill).toBe(100_000);
    expect(result.leagueMedianCostPerSkill).toBe(50_000);
    expect(result.ratio).toBe(2);
    expect(result.extraPoints).toBe(10);
    expect(result.inefficiencyTax).toBe(7_250_000);
    expect(result.totalTax).toBe(TEAM_F_TOTAL_TAX);
  });
});

describe('computeLeagueLuxuryTax', () => {
  it('reproduces the worked six-team example with no DB writes', async () => {
    mockLeagueQueries();

    const results = await computeLeagueLuxuryTax();

    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(prisma.finance.create).not.toHaveBeenCalled();

    const teamF = results.find((r) => r.teamId === 6);
    expect(teamF.totalTax).toBe(TEAM_F_TOTAL_TAX);
    const teamE = results.find((r) => r.teamId === 5);
    expect(teamE.totalTax).toBe(TEAM_E_TOTAL_TAX);

    for (const r of results) {
      if (r.teamId !== 6 && r.teamId !== 5) expect(r.totalTax).toBe(0);
    }
  });
});

describe('recordLuxuryTaxProjection', () => {
  it('stores a snapshot per team at the given day without charging anyone', async () => {
    mockLeagueQueries();
    prisma.luxuryTaxRecord.createMany.mockResolvedValue({ count: LEAGUE_TEAMS.length });

    const season = { id: 10, current_day: 30 };
    await recordLuxuryTaxProjection(season);

    expect(prisma.luxuryTaxRecord.createMany).toHaveBeenCalledTimes(1);
    const { data } = prisma.luxuryTaxRecord.createMany.mock.calls[0][0];
    expect(data).toHaveLength(LEAGUE_TEAMS.length);
    expect(data.every((row) => row.season_id === 10 && row.day === 30 && row.charged === false)).toBe(true);

    const teamFRow = data.find((row) => row.team_id === 6);
    expect(teamFRow.total_tax).toBe(TEAM_F_TOTAL_TAX);

    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(prisma.finance.create).not.toHaveBeenCalled();
  });
});

describe('applyLuxuryTax', () => {
  it('charges only teams above threshold and records every team, including CPU teams', async () => {
    prisma.team.findMany.mockResolvedValue(
      LEAGUE_TEAMS.map((t) => ({ id: t.id, name: t.name, is_user_team: t.id === 1 }))
    );
    prisma.player.findMany.mockResolvedValue(
      LEAGUE_TEAMS.map((t) => ({ team_id: t.id, salary: t.payroll, current_skill: t.skill }))
    );
    prisma.luxuryTaxRecord.create.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.finance.create.mockResolvedValue({});

    const season = { id: 10, current_day: 45 };
    const results = await applyLuxuryTax(season, 999);

    expect(results).toHaveLength(LEAGUE_TEAMS.length);
    expect(prisma.luxuryTaxRecord.create).toHaveBeenCalledTimes(LEAGUE_TEAMS.length);

    // Teams E (id 5, user) and F (id 6, CPU) are the only ones above threshold -> only they get charged.
    expect(prisma.team.update).toHaveBeenCalledTimes(2);
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { budget: { decrement: TEAM_F_TOTAL_TAX } },
    });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { budget: { decrement: TEAM_E_TOTAL_TAX } },
    });

    expect(prisma.finance.create).toHaveBeenCalledTimes(2);
    expect(prisma.finance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        team_id: 6,
        type: 'luxury_tax',
        amount: -TEAM_F_TOTAL_TAX,
        season_day: 999,
      }),
    });
    expect(prisma.finance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        team_id: 5,
        type: 'luxury_tax',
        amount: -TEAM_E_TOTAL_TAX,
        season_day: 999,
      }),
    });

    const teamFRecordCall = prisma.luxuryTaxRecord.create.mock.calls.find(
      (call) => call[0].data.team_id === 6
    );
    expect(teamFRecordCall[0].data.charged).toBe(true);
    expect(teamFRecordCall[0].data.total_tax).toBe(TEAM_F_TOTAL_TAX);

    const teamARecordCall = prisma.luxuryTaxRecord.create.mock.calls.find(
      (call) => call[0].data.team_id === 1
    );
    expect(teamARecordCall[0].data.charged).toBe(false);
    expect(teamARecordCall[0].data.total_tax).toBe(0);
  });
});
