import { useEffect, useRef } from 'react';
import MapScene from './MapScene.js';

// Mapa interactivo de la pagina /map. `data` = respuesta de GET /api/map, `positions` = layoutCities().
export default function LeagueMap({ data, positions, selectedId, onSelect }) {
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const scene = new MapScene(stageRef.current, {
      interactive: true,
      onSelect: (id) => onSelectRef.current?.(id),
    });
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setData({ ...data, positions, selectedId });
  }, [data, positions, selectedId]);

  return (
    <div className="relative h-[420px] lg:h-[620px] bg-[#1d4e73]">
      <div ref={stageRef} className="absolute inset-0" />
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        {[
          ['+', 'Acercar', () => sceneRef.current?.zoomBy(1.4)],
          ['−', 'Alejar', () => sceneRef.current?.zoomBy(1 / 1.4)],
          ['⤢', 'Ver todo el mapa', () => sceneRef.current?.fitView()],
        ].map(([label, aria, fn]) => (
          <button
            key={aria}
            onClick={fn}
            aria-label={aria}
            className="w-9 h-9 rounded bg-white/90 hover:bg-white shadow text-lg font-semibold text-gray-700"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
