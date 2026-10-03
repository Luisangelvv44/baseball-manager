/**
 * assignContracts.js
 *
 * One-time backfill for the Contract table. For every player that has no contract yet:
 *  - Past contracts are reconstructed (approximately) from PlayerSeasonRecord: consecutive
 *    seasons with the same team become one 'expired' contract (is_reconstructed = true),
 *    even if there are seasons without games in between — that is what lets the career
 *    history show those seasons with zeros.
 *  - Active players on a team get their current 'active' contract (salary,
 *    contract_years_remaining, rookie_contract), absorbing the last stint when it is with
 *    the same team. achievement_bonus starts at 0; it is set when the contract is renewed.
 * Salaries of reconstructed contracts use the player's current salary (not exact).
 *
 * Safe to re-run: players that already have any contract are skipped.
 *
 * Run from backend/: npm run contracts:backfill
 */

const prisma = require('../db/prisma');
const { backfillContracts } = require('../services/contractService');

async function main() {
  const { activeCreated, historicalCreated } = await backfillContracts(prisma);
  console.log(`Contratos vigentes creados: ${activeCreated}`);
  console.log(`Contratos historicos reconstruidos: ${historicalCreated}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
