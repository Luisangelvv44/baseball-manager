const prisma = require('../db/prisma');

async function giveCpuTeamsRevenue() {
    const cpuTeamsRevenue = await prisma.team.findMany({
        where: { is_user_team: false },
        select: { id: true, fan_base: true },
    });

    for (const ct of cpuTeamsRevenue) {
        const revenuePerFan = Math.floor(Math.random() * 101) + 50; // $50–$150 entero por fan
        const revenue = ct.fan_base * revenuePerFan;
        if (revenue > 0) {
            await prisma.team.update({
                where: { id: ct.id },
                data: { budget: { increment: revenue } },
            });
        }
    }
}

module.exports = { giveCpuTeamsRevenue };
