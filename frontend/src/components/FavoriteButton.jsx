import { toggleFavorite, useFavorites } from '../utils/favorites.js';

export default function FavoriteButton({ playerId, className = '' }) {
  const { isFavorite } = useFavorites();
  const active = isFavorite(playerId);

  return (
    <button
      type="button"
      onClick={() => toggleFavorite(playerId)}
      aria-label={active ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      title={active ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      className={`text-lg leading-none transition-colors ${active ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'} ${className}`}
    >
      {active ? '★' : '☆'}
    </button>
  );
}
