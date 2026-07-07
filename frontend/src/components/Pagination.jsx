export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="text-sm bg-white border rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Anterior
      </button>
      <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="text-sm bg-white border rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Siguiente
      </button>
    </div>
  );
}
