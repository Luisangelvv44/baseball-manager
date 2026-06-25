// Layout inicial del estadio 4x4 (filas/columnas 1-indexed):
//
//        col1            col2     col3    col4
// row1:  empty           empty    empty   empty
// row2:  empty           field    field   empty
// row3:  grandstand(G1)  field    field   empty
// row4:  empty           grandstand(G2)  empty  empty
//
// El campo es un bloque 2x2 en (2,2)-(3,3). Cuando se añade una planta,
// todas las secciones se desplazan +1 en fila y columna para centrar el campo.

const GRID_SIZE = 4;

const BASE_PRICE = 15.0;
const BASE_CAPACITY = 100;        // nivel 1 = 100; fórmula: 100 * 2^(level-1)
const BUILD_COST = 500000;        // costo de construir una nueva sección en celda vacía
const UPGRADE_BASE_COST = 100000; // nivel 1→2 = $100,000; fórmula: 100000 * 2^(currentLevel-1)
const FLOOR_EXPAND_BASE_COST = 2_000_000; // planta 2 = $2M, planta 3 = $4M, planta 4 = $8M

const INITIAL_LAYOUT = [
  { row: 1, col: 1, type: 'empty' },
  { row: 1, col: 2, type: 'empty' },
  { row: 1, col: 3, type: 'empty' },
  { row: 1, col: 4, type: 'empty' },
  { row: 2, col: 1, type: 'empty' },
  { row: 2, col: 2, type: 'field' },
  { row: 2, col: 3, type: 'field' },
  { row: 2, col: 4, type: 'empty' },
  { row: 3, col: 1, type: 'grandstand', label: 'Grada Norte', level: 1 },
  { row: 3, col: 2, type: 'field' },
  { row: 3, col: 3, type: 'field' },
  { row: 3, col: 4, type: 'empty' },
  { row: 4, col: 1, type: 'empty' },
  { row: 4, col: 2, type: 'grandstand', label: 'Grada Sur', level: 1 },
  { row: 4, col: 3, type: 'empty' },
  { row: 4, col: 4, type: 'empty' },
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

// planta 1→2 = $2M, 2→3 = $4M, 3→4 = $8M
function getFloorExpandCost(currentFloors) {
  return FLOOR_EXPAND_BASE_COST * Math.pow(2, currentFloors - 1);
}

// Genera el anillo exterior de celdas vacías para la nueva planta NxN.
// Al añadir la planta N, el grid pasa de (N-1)*2+2 a N*2+2.
// Se añaden: fila 1, fila newSize, columna 1, columna newSize.
function generateOuterRingCells(newFloor, teamId) {
  const newSize = newFloor * 2 + 2;
  const positions = [];

  for (let c = 1; c <= newSize; c++) positions.push({ r: 1, c });
  for (let c = 1; c <= newSize; c++) positions.push({ r: newSize, c });
  for (let r = 2; r <= newSize - 1; r++) positions.push({ r, c: 1 });
  for (let r = 2; r <= newSize - 1; r++) positions.push({ r, c: newSize });

  return positions.map(({ r, c }) => ({
    team_id: teamId,
    row_pos: r,
    col_pos: c,
    section_type: 'empty',
    label: null,
    price_per_ticket: 0,
    upgrade_level: 0,
    capacity: 0,
  }));
}

module.exports = {
  generateStadiumSections,
  getUpgradeCost,
  getFloorExpandCost,
  generateOuterRingCells,
  GRID_SIZE,
  BASE_PRICE,
  BASE_CAPACITY,
  BUILD_COST,
  FLOOR_EXPAND_BASE_COST,
};
