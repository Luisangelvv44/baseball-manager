import { api } from '../api.js';

// Avanza el dia y navega segun el resultado. Logica compartida por el Dashboard
// (boton "Avanzar Dia") y GameView (boton "Avanzar Dia" tras jugar el partido).
//
// - navigate:      de useNavigate()
// - refreshTeam:   de useTeam(), opcional
// - refreshAlerts: de useTeam(), opcional; refresca la campana de alertas
// - setMessage:    setter opcional para mensajes en pantalla
// - onStay:        callback opcional para el caso "sin partido hoy"; si no se pasa,
//                  se navega al Dashboard.
export async function advanceDayAndRoute({ navigate, refreshTeam, refreshAlerts, setMessage, onStay }) {
  const result = await api.advanceDay();
  refreshTeam?.();
  refreshAlerts?.();

  if (!result.advanced && result.userGameId) {
    return navigate(`/game/${result.userGameId}`);
  }
  if (result.seasonFinished) {
    setMessage?.('¡La temporada ha terminado! Toca hacer el Draft anual.');
    return navigate('/draft');
  }
  if (result.playoffs) {
    setMessage?.('¡La temporada regular terminó! Los playoffs han comenzado.');
    return navigate('/playoffs');
  }
  if (result.userGameId) {
    setMessage?.(`Dia ${result.day}. Tienes un partido${result.inPlayoffs ? ' de playoffs' : ''} hoy.`);
    return navigate(`/game/${result.userGameId}`);
  }

  setMessage?.(`Dia ${result.day}. Sin partido hoy. Se simularon ${result.simulated} partidos.`);
  if (onStay) return onStay();
  return navigate('/');
}
