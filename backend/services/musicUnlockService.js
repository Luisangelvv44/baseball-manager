// Canciones desbloqueables de la banda sonora (frontend/public/audio/music, `unlockable` en
// tracks.json). Nada se guarda: el desbloqueo se deriva del historial de la partida, asi que una
// partida antigua desbloquea al instante lo que ya habia conseguido. Metas pensadas para una
// franquicia larga: la mayoria llega pronto y las ultimas piden anos de dinastia.

const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

const FINAL_ROUND = 3; // la final Oeste vs Este (playoffService.js)

// stat: clave de getFranchiseMilestones(); se desbloquea con stat >= goal
const MUSIC_UNLOCKS = [
  { trackId: 'track_06', stat: 'seasons', goal: 1, hint: 'Completa tu primera temporada' },
  { trackId: 'track_07', stat: 'playoffAppearances', goal: 1, hint: 'Clasifica a los playoffs' },
  { trackId: 'track_08', stat: 'championships', goal: 1, hint: 'Gana un campeonato' },
  { trackId: 'track_09', stat: 'retiredNumbers', goal: 1, hint: 'Retira el número de una leyenda' },
  { trackId: 'track_10', stat: 'championships', goal: 5, hint: 'Gana 5 campeonatos' },
  { trackId: 'track_11', stat: 'hallOfFamers', goal: 1, hint: 'Lleva a un jugador de tu equipo al Salón de la Fama' },
  { trackId: 'track_12', stat: 'championships', goal: 15, hint: 'Gana 15 campeonatos' },
];

async function getFranchiseMilestones(teamId = USER_TEAM_ID) {
  const [seasons, playoffSeasons, championships, retiredNumbers, hallOfFamers] = await Promise.all([
    prisma.seasonRecord.count(),
    prisma.playoffSeries.findMany({
      where: { OR: [{ home_team_id: teamId }, { away_team_id: teamId }] },
      select: { season_id: true },
      distinct: ['season_id'],
    }),
    prisma.playoffSeries.count({ where: { round: FINAL_ROUND, winner_id: teamId } }),
    prisma.retiredNumber.count({ where: { team_id: teamId } }),
    prisma.hallOfFameCandidate.count({ where: { status: 'inducted', primary_team_id: teamId } }),
  ]);
  return {
    seasons: Number(seasons) || 0,
    playoffAppearances: playoffSeasons?.length || 0,
    championships: Number(championships) || 0,
    retiredNumbers: Number(retiredNumbers) || 0,
    hallOfFamers: Number(hallOfFamers) || 0,
  };
}

// Puro: estado de cada desbloqueo a partir de los hitos
function evaluateUnlocks(milestones) {
  return MUSIC_UNLOCKS.map(({ trackId, stat, goal, hint }) => {
    const progress = Math.min(milestones[stat] ?? 0, goal);
    return { trackId, hint, goal, progress, unlocked: progress >= goal };
  });
}

async function getMusicUnlocks(teamId = USER_TEAM_ID) {
  const milestones = await getFranchiseMilestones(teamId);
  const songs = evaluateUnlocks(milestones);
  return {
    unlocked: songs.filter((s) => s.unlocked).map((s) => s.trackId),
    songs,
  };
}

module.exports = { MUSIC_UNLOCKS, FINAL_ROUND, getFranchiseMilestones, evaluateUnlocks, getMusicUnlocks };
