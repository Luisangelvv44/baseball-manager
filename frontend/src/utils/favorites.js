import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'market-favorite-players';
const CHANGE_EVENT = 'favorites-changed';

export function getFavoriteIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter(Number.isInteger) : [];
  } catch (_) {
    return [];
  }
}

function saveFavoriteIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch (_) {
    // localStorage no disponible; los favoritos no persisten en esta sesión
  }
}

export function toggleFavorite(playerId) {
  const ids = getFavoriteIds();
  const next = ids.includes(playerId)
    ? ids.filter((id) => id !== playerId)
    : [...ids, playerId];
  saveFavoriteIds(next);
}

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(getFavoriteIds()));

  useEffect(() => {
    const sync = () => setFavoriteIds(new Set(getFavoriteIds()));
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isFavorite = useCallback((playerId) => favoriteIds.has(playerId), [favoriteIds]);

  return { favoriteIds, isFavorite, toggleFavorite };
}
