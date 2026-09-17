import { useEffect, useState } from 'react';
import { api } from '../api.js';
import PlayerSprite, { teamSlugFromName } from './PlayerSprite.jsx';

// Carga la apariencia del jugador bajo demanda (solo al montarse, ej. dentro de un modal
// ya abierto) y renderiza su sprite con el uniforme correcto: equipo actual, ultimo
// equipo si esta retirado, o blanco/MLB si es agente libre o no se conoce ninguno.
export default function PlayerSpriteLoader({ playerId, width = 140, className }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    api.getPlayerSprite(playerId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [playerId]);

  if (error) return null;

  if (!data) {
    return <div className="bg-gray-100 rounded animate-pulse" style={{ width, height: width * 1.23 }} />;
  }

  return (
    <PlayerSprite
      width={width}
      className={className}
      headNumber={data.appearance.head_number}
      eyeType={data.appearance.eye_type}
      faceType={data.appearance.face_type}
      skinTone={data.appearance.skin_tone}
      team={teamSlugFromName(data.sprite_team_name)}
    />
  );
}
