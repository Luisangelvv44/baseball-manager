// Layout inicial del estadio (confirmado por el usuario), filas/columnas 1-indexed:
//
//        col1            col2     col3
// row1:  empty           field    field
// row2:  grandstand(G1)  field    field
// row3:  empty           grandstand(G2)  empty
//
// El campo es un bloque 2x2. Las celdas "empty" son construibles a futuro.

const GRID_SIZE = 3;

const BASE_PRICE = 15.0;
const BASE_CAPACITY = 100;       // nivel 1 = 100; fórmula: 100 * 2^(level-1)
const BUILD_COST = 500000;       // costo de construir una nueva sección en celda vacía
const UPGRADE_BASE_COST = 20000; // nivel 1→2 = $20,000; fórmula: 20000 * 2^(currentLevel-1)

const INITIAL_LAYOUT = [
  { row: 1, col: 1, type: 'empty' },
  { row: 1, col: 2, type: 'field' },
  { row: 1, col: 3, type: 'field' },
  { row: 2, col: 1, type: 'grandstand', label: 'Grada Norte', level: 1 },
  { row: 2, col: 2, type: 'field' },
  { row: 2, col: 3, type: 'field' },
  { row: 3, col: 1, type: 'empty' },
  { row: 3, col: 2, type: 'grandstand', label: 'Grada Sur', level: 1 },
  { row: 3, col: 3, type: 'empty' },
];

function generateStadiumSections(teamId) {
  return INITIAL_LAYOUT.map((cell) => {
    if (cell.type === 'grandstand') {
      return {
        team_id: teamId,
        row_pos: cell.row,
        col_pos: cell.col,
        section_type: 'grandstand',
        label: cell.label,
        price_per_ticket: BASE_PRICE,
        upgrade_level: cell.level,
        capacity: BASE_CAPACITY * Math.pow(2, cell.level - 1),
      };
    }
    if (cell.type === 'field') {
      return {
        team_id: teamId,
        row_pos: cell.row,
        col_pos: cell.col,
        section_type: 'field',
        label: 'Campo',
        price_per_ticket: 0,
        upgrade_level: 0,
        capacity: 0,
      };
    }
    // empty
    return {
      team_id: teamId,
      row_pos: cell.row,
      col_pos: cell.col,
      section_type: 'empty',
      label: null,
      price_per_ticket: 0,
      upgrade_level: 0,
      capacity: 0,
    };
  });
}

// nivel 1→2 = $20,000, 2→3 = $40,000, 3→4 = $80,000, etc.
function getUpgradeCost(currentLevel) {
  return UPGRADE_BASE_COST * Math.pow(2, Math.max(0, currentLevel - 1));
}

module.exports = {
  generateStadiumSections,
  getUpgradeCost,
  GRID_SIZE,
  BASE_PRICE,
  BASE_CAPACITY,
  BUILD_COST,
};
