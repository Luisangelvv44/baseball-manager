# Ambiente de la pantalla VS

Lo usa `frontend/src/utils/introAmbience.js`. Cada archivo es opcional: si falta, esa capa no suena.

| Archivo | Uso |
|---|---|
| `crowd_loop.mp3` | Público del estadio en bucle, desde la intro hasta que termina la simulación del partido |
| `crowd_loop_playoffs.mp3` | Variante de playoffs (si falta: `crowd_loop`) |
| `intro_music.mp3` | Música de entrada; baja (ducking) mientras habla el narrador |
| `intro_music_playoffs.mp3` | Variante de playoffs (si falta: `intro_music`) |
| `crowd_cheer.mp3` | Ovación cuando termina el narrador (y en el último out si tu equipo no juega) |
| `crowd_cheer_win.mp3` | Último out: tu equipo gana (si falta: `crowd_cheer`) |
| `crowd_cheer_loss.mp3` | Último out: tu equipo pierde (si falta: `crowd_cheer`) |

Se generan con ElevenLabs desde `backend/`: `npm run ambience:audio` (`--dry-run`, `--only <id>`, `--force`).
La clave necesita los permisos `sound_generation` y `music_generation`. Se pueden reemplazar por
cualquier mp3 propio con licencia de uso (mismo nombre).
