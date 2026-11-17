const {
  buildNarratorClips,
  matchupClipId,
  finalClipId,
  SHARED_CLIP_COUNTS,
} = require('../services/narratorClips');
const { buildRows } = require('../scripts/generateNarrationScripts');
const { TEAM_DIVISIONS } = require('../seeders/data/names');
const { DIVISION_CONFERENCES } = require('../config');
const { seededRng } = require('../services/introNarration');

const baseFacts = {
  homeName: 'Brisko Wolves',
  awayName: 'Thalgrove Miners',
  homeConference: 'Oeste',
  awayConference: 'Oeste',
  playoffRound: null,
  isRivalry: false,
  streaks: [],
  hrLeader: null,
  heir: null,
};

const opts = { rng: seededRng(7), streakMin: 3, hrMin: 10 };

describe('buildNarratorClips', () => {
  it('regular season without hooks: matchup + closer', () => {
    const clips = buildNarratorClips(baseFacts, opts);
    expect(clips).toHaveLength(2);
    expect(clips[0]).toBe('matchup__thalgrove-miners__at__brisko-wolves__v1');
    expect(clips[1]).toMatch(/^closer__v[1-5]$/);
  });

  it('adds a hook clip for a rivalry', () => {
    const clips = buildNarratorClips({ ...baseFacts, isRivalry: true }, opts);
    expect(clips).toHaveLength(3);
    expect(clips[1]).toMatch(/^hook_rivalry__v[1-3]$/);
  });

  it('maps streaks to home/away clips', () => {
    const home = buildNarratorClips({
      ...baseFacts, streaks: [{ teamName: 'Brisko Wolves', type: 'W', length: 5 }],
    }, opts);
    expect(home[1]).toMatch(/^hook_win_streak_home__v/);

    const away = buildNarratorClips({
      ...baseFacts, streaks: [{ teamName: 'Thalgrove Miners', type: 'L', length: 4 }],
    }, opts);
    expect(away[1]).toMatch(/^hook_loss_streak_away__v/);
  });

  it('ignores streaks below the minimum', () => {
    const clips = buildNarratorClips({
      ...baseFacts, streaks: [{ teamName: 'Brisko Wolves', type: 'W', length: 2 }],
    }, opts);
    expect(clips).toHaveLength(2);
  });

  it('playoffs: round clip first, no hook', () => {
    const clips = buildNarratorClips({ ...baseFacts, playoffRound: 2, isRivalry: true }, opts);
    expect(clips).toHaveLength(3);
    expect(clips[0]).toMatch(/^round_semis__v[12]$/);
    expect(clips[1]).toBe('matchup__thalgrove-miners__at__brisko-wolves__v1');
  });

  it('cross-conference final uses the final clip', () => {
    const clips = buildNarratorClips({
      ...baseFacts, awayName: 'Druvask Knights', awayConference: 'Este', playoffRound: 3,
    }, opts);
    expect(clips[0]).toMatch(/^round_final__v[12]$/);
    expect(clips[1]).toBe('final__druvask-knights__at__brisko-wolves__v1');
  });

  it('is deterministic for the same seed', () => {
    const facts = { ...baseFacts, isRivalry: true };
    expect(buildNarratorClips(facts, { ...opts, rng: seededRng(42) }))
      .toEqual(buildNarratorClips(facts, { ...opts, rng: seededRng(42) }));
  });
});

describe('narrator clips vs generated scripts', () => {
  const ids = new Set(buildRows().map((r) => r.id));

  it('every shared clip the game can pick has a script', () => {
    for (const [category, count] of Object.entries(SHARED_CLIP_COUNTS)) {
      for (let v = 1; v <= count; v++) expect(ids.has(`${category}__v${v}`)).toBe(true);
    }
  });

  it('every team pairing has its matchup or final clip', () => {
    const teams = TEAM_DIVISIONS.flatMap((d) => d.teams.map((name) => ({ name, conf: DIVISION_CONFERENCES[d.name] })));
    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue;
        const id = home.conf === away.conf
          ? matchupClipId(away.name, home.name, 1)
          : finalClipId(away.name, home.name, 1);
        expect(ids.has(id)).toBe(true);
      }
    }
  });
});
