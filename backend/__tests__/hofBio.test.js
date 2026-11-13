jest.mock('../db/prisma');
jest.mock('../services/aiService', () => ({
  generateText: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(true),
  hasAlteredName: jest.requireActual('../services/aiService').hasAlteredName,
}));
jest.mock('../services/seasonEdition', () => ({
  getSeasonEditionMap: jest.fn().mockResolvedValue(new Map([[5, 3], [9, 7]])),
}));

const prisma = require('../db/prisma');
const { generateText, isEnabled } = require('../services/aiService');
const {
  gatherBioFacts, templateBio, buildBioPrompt, validBio, generateBioForCandidate, ensureBiosInBackground,
} = require('../services/hofBio');

const candidate = {
  id: 40,
  player_id: 7,
  role: 'BATTER',
  status: 'inducted',
  bio: null,
  seasons_played: 14,
  career_totals: { games: 1500, hits: 1820, home_runs: 412, rbi: 1100 },
  last_vote_pct: 81.5,
  years_on_ballot: 1,
  inducted_season_id: 9,
  player: {
    first_name: 'Ramón', last_name: 'Castillo', position: 'C',
    children: [{ first_name: 'Andrés', last_name: 'Castillo' }],
    retired_numbers: [{ number: 23, team: { name: 'Halcones de Norte' } }],
  },
  primary_team: { name: 'Halcones de Norte' },
};

function mockCareer() {
  prisma.playerSeasonRecord.findMany.mockResolvedValue([
    { season_id: 1, team_id: 2, team: { name: 'Toros de Sur' } },
    { season_id: 2, team_id: 2, team: { name: 'Toros de Sur' } },
    { season_id: 3, team_id: 1, team: { name: 'Halcones de Norte' } },
    { season_id: 3, team_id: 1, team: { name: 'Halcones de Norte' } },
    { season_id: 4, team_id: 1, team: { name: 'Halcones de Norte' } },
  ]);
  prisma.seasonAward.findMany.mockResolvedValue([{ category: 'MVP' }, { category: 'MVP' }, { category: 'SEASON_WIN_STREAK_RECORD' }]);
}

const goodBio = 'Ramón Castillo fue receptor durante 14 temporadas. Empezó en Toros de Sur y se convirtió en leyenda de Halcones de Norte, '
  + 'donde acumuló 412 jonrones y ganó 2 veces el premio al Jugador Más Valioso. Entró al Salón de la Fama con el 81.5% de los votos '
  + 'en su primer año. Su número 23 ya cuelga en el estadio y su hijo Andrés Castillo se forma en el programa juvenil.';

beforeEach(() => {
  jest.clearAllMocks();
  isEnabled.mockReturnValue(true);
  mockCareer();
});

describe('gatherBioFacts', () => {
  it('arma trayectoria por equipos, premios conocidos, herederos y numero retirado', async () => {
    const f = await gatherBioFacts(candidate);
    expect(f.teams).toEqual([{ name: 'Toros de Sur', seasons: 2 }, { name: 'Halcones de Norte', seasons: 2 }]);
    expect(f.awards).toEqual([{ label: 'Jugador Más Valioso', count: 2 }]);
    expect(f.position).toBe('receptor');
    expect(f.inductedEdition).toBe(7);
    expect(f.heirs).toEqual(['Andrés Castillo']);
    expect(f.retiredNumbers).toEqual([{ number: 23, team: 'Halcones de Norte' }]);
  });
});

describe('templateBio / buildBioPrompt', () => {
  it('la plantilla usa solo los datos', async () => {
    const bio = templateBio(await gatherBioFacts(candidate));
    expect(bio).toMatch(/Ramón Castillo, receptor, leyenda de Halcones de Norte, jugó 14 temporadas/);
    expect(bio).toMatch(/Toros de Sur, Halcones de Norte/);
    expect(bio).toMatch(/412 jonrones/);
    expect(bio).toMatch(/2 premios Jugador Más Valioso/);
    expect(bio).toMatch(/Andrés Castillo/);
    expect(bio).not.toMatch(/undefined|null/);
  });

  it('el prompt lleva los datos y prohibe inventar', async () => {
    const p = buildBioPrompt(await gatherBioFacts(candidate));
    expect(p).toMatch(/Equipos \(en orden\): Toros de Sur \(2 temporadas\), Halcones de Norte/);
    expect(p).toMatch(/No inventes apodos/);
  });
});

describe('validBio', () => {
  it('acepta una biografia con cifras y nombres de los datos', async () => {
    expect(validBio(goodBio, await gatherBioFacts(candidate))).toBe(true);
  });

  it('rechaza cifras inventadas, nombres alterados, sin el nombre o fuera de largo', async () => {
    const f = await gatherBioFacts(candidate);
    expect(validBio(goodBio.replace('412', '450'), f)).toBe(false);
    expect(validBio(goodBio.replace('Toros de Sur', 'Toros del Sur'), f)).toBe(false);
    expect(validBio(goodBio.replace(/Ramón Castillo/g, 'El Muro'), f)).toBe(false);
    expect(validBio('Ramón Castillo fue grande.', f)).toBe(false);
  });
});

describe('generateBioForCandidate', () => {
  it('guarda la biografia valida solo si aun no tiene', async () => {
    prisma.hallOfFameCandidate.findUnique.mockResolvedValue(candidate);
    generateText.mockResolvedValue({ text: `"${goodBio}"` });
    const bio = await generateBioForCandidate(40, { seasonId: 9 });
    expect(bio).toBe(goodBio);
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ seasonId: 9 }));
    expect(prisma.hallOfFameCandidate.updateMany).toHaveBeenCalledWith({ where: { id: 40, bio: null }, data: { bio: goodBio } });
  });

  it('no hace nada si la IA esta apagada, ya tiene bio, no es exaltado o la IA falla', async () => {
    isEnabled.mockReturnValue(false);
    expect(await generateBioForCandidate(40)).toBeNull();
    expect(prisma.hallOfFameCandidate.findUnique).not.toHaveBeenCalled();

    isEnabled.mockReturnValue(true);
    prisma.hallOfFameCandidate.findUnique.mockResolvedValueOnce({ ...candidate, bio: 'ya' });
    expect(await generateBioForCandidate(40)).toBeNull();
    prisma.hallOfFameCandidate.findUnique.mockResolvedValueOnce({ ...candidate, status: 'candidate' });
    expect(await generateBioForCandidate(40)).toBeNull();

    prisma.hallOfFameCandidate.findUnique.mockResolvedValueOnce(candidate);
    generateText.mockResolvedValueOnce({ text: goodBio.replace('412', '999') });
    expect(await generateBioForCandidate(40)).toBeNull();
    expect(prisma.hallOfFameCandidate.updateMany).not.toHaveBeenCalled();
  });

  it('nunca lanza aunque la DB falle', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    prisma.hallOfFameCandidate.findUnique.mockRejectedValue(new Error('db down'));
    expect(await generateBioForCandidate(40)).toBeNull();
    console.warn.mockRestore();
  });

  it('ensureBiosInBackground no hace nada sin IA', () => {
    isEnabled.mockReturnValue(false);
    ensureBiosInBackground([1, 2]);
    expect(prisma.hallOfFameCandidate.findUnique).not.toHaveBeenCalled();
  });
});
