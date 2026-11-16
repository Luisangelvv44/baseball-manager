jest.mock('../db/prisma');
jest.mock('../services/lineup', () => ({ getLineup: jest.fn() }));
jest.mock('../services/rivalryService', () => ({ getRivalryIntensity: jest.fn().mockResolvedValue(0) }));
jest.mock('../services/ttsService', () => ({ synthesizeSpeech: jest.fn() }));
jest.mock('../services/aiService', () => ({ isEnabled: jest.fn().mockReturnValue(true) }));

const prisma = require('../db/prisma');
const { getLineup } = require('../services/lineup');
const { getRivalryIntensity } = require('../services/rivalryService');
const { synthesizeSpeech } = require('../services/ttsService');
const { isEnabled } = require('../services/aiService');
const { getIntroFacts, getIntroAudio, resetIntroAudioCache } = require('../services/gameIntroService');

const game = { id: 7, season_id: 1, home_team_id: 1, away_team_id: 2, status: 'scheduled', playoff_series_id: null };

const lineupFor = (teamId) => ({
  teamId,
  pitcher: { id: teamId * 100, first_name: 'Pitcher', last_name: `T${teamId}` },
  players: [{ id: teamId * 100 + 1, first_name: 'Bat', last_name: `T${teamId}` }],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetIntroAudioCache();
  isEnabled.mockReturnValue(true);
  prisma.team.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(where.id === 1 ? { id: 1, name: 'Brisko Wolves' } : { id: 2, name: 'Thalgrove Miners' }));
  getLineup.mockImplementation((teamId) => Promise.resolve(lineupFor(teamId)));
  getRivalryIntensity.mockResolvedValue(0);
  prisma.gameSchedule.findMany.mockResolvedValue([]);
  prisma.gameEvent.groupBy.mockResolvedValue([]);
  prisma.player.findMany.mockResolvedValue([]);
});

describe('getIntroFacts', () => {
  it('reune ciudad, abridores, jonronero y heredero', async () => {
    prisma.gameEvent.groupBy.mockResolvedValue([
      { player_id: 101, _count: { _all: 12 } },
      { player_id: 201, _count: { _all: 30 } },
    ]);
    prisma.player.findMany.mockResolvedValue([{ id: 101, parent_id: 9 }]);
    prisma.player.findUnique.mockResolvedValue({ first_name: 'Ramon', last_name: 'Castillo' });

    const facts = await getIntroFacts(game);

    expect(facts).toMatchObject({
      city: 'Brisko',
      homeName: 'Brisko Wolves',
      awayName: 'Thalgrove Miners',
      homePitcher: 'Pitcher T1',
      awayPitcher: 'Pitcher T2',
      playoffRound: null,
      isRivalry: false,
      hrLeader: { name: 'Bat T2', count: 30 },
      heir: { name: 'Bat T1', parentName: 'Ramon Castillo' },
    });
  });

  it('lee la ronda de playoffs de la serie', async () => {
    prisma.playoffSeries.findUnique.mockResolvedValue({ round: 3 });
    const facts = await getIntroFacts({ ...game, playoff_series_id: 5 });
    expect(facts.playoffRound).toBe(3);
  });
});

describe('getIntroAudio', () => {
  it('devuelve null sin IA disponible y no llama al TTS', async () => {
    isEnabled.mockReturnValue(false);
    expect(await getIntroAudio(game)).toBeNull();
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('devuelve null para partidos terminados', async () => {
    expect(await getIntroAudio({ ...game, status: 'finished' })).toBeNull();
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it('cachea el audio: precarga y reproduccion llaman al TTS una sola vez', async () => {
    synthesizeSpeech.mockResolvedValue(Buffer.from('mp3'));
    const [a, b] = await Promise.all([getIntroAudio(game), getIntroAudio(game)]);
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(a.audio.toString()).toBe('mp3');
    expect(b.text).toBe(a.text);
    expect(a.text).toContain('Pitcher T1');
  });

  it('no cachea fallos del TTS', async () => {
    synthesizeSpeech.mockResolvedValueOnce(null).mockResolvedValueOnce(Buffer.from('mp3'));
    expect(await getIntroAudio(game)).toBeNull();
    expect((await getIntroAudio(game)).audio.toString()).toBe('mp3');
    expect(synthesizeSpeech).toHaveBeenCalledTimes(2);
  });
});
