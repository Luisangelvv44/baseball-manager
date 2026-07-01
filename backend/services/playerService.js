const prisma = require('../db/prisma');

async function fluctuatePlayerSkills() {
    const allPlayers = await prisma.player.findMany({
        where: { status: { in: ['active', 'free_agent'] } },
        select: { id: true, age: true, current_skill: true, growth_age: true, potential_coefficient: true },
    });

    for (const p of allPlayers) {
        const multiplier = Math.random() * 0.05 + 0.05;
        const delta = p.age < p.growth_age ? Math.round(p.potential_coefficient * multiplier) : -Math.round(p.potential_coefficient * multiplier);
        const newSkill = Math.min(100, p.current_skill + delta);
        await prisma.player.update({
            where: { id: p.id },
            data: { current_skill: newSkill },
        });
    }
}

async function updatePlayersContracts() {
    await prisma.player.updateMany({
        where: { status: 'active' },
        data: { contract_years_remaining: { decrement: 1 } },
    });
}

module.exports = { fluctuatePlayerSkills, updatePlayersContracts };
