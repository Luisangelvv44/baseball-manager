// Sufijo ordinal en inglés: 1ST, 2ND, 3RD, 4TH... (11TH, 12TH, 13TH, 21ST, 22ND...)
function ordinalSuffix(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'TH';
  switch (n % 10) {
    case 1: return 'ST';
    case 2: return 'ND';
    case 3: return 'RD';
    default: return 'TH';
  }
}

// Nombre visible de una temporada a partir de su número de edición (orden cronológico, no id).
export function seasonLabel(edition) {
  return edition != null ? `${edition}${ordinalSuffix(edition)} Edition` : 'Temporada';
}
