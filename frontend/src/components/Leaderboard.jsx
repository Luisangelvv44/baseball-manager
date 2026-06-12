export default function Leaderboard({ teams, userTeamId }) {
  const divisions = {};
  teams.forEach((t) => {
    const div = t.division_name || 'Liga';
    if (!divisions[div]) divisions[div] = [];
    divisions[div].push(t);
  });

  Object.values(divisions).forEach((list) => {
    list.sort((a, b) => {
      const totalA = a.wins + a.losses;
      const totalB = b.wins + b.losses;
      const pctA = totalA ? a.wins / totalA : 0;
      const pctB = totalB ? b.wins / totalB : 0;
      return pctB - pctA;
    });
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {Object.entries(divisions).map(([divName, list]) => (
        <div key={divName} className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold mb-2">{divName}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-1">#</th>
                <th className="py-1">Equipo</th>
                <th className="py-1">G</th>
                <th className="py-1">P</th>
                <th className="py-1">PCT</th>
                <th className="py-1">DIF</th>
              </tr>
            </thead>
            <tbody>
              {list.map((team, idx) => {
                const total = team.wins + team.losses;
                const pct = total ? (team.wins / total).toFixed(3) : '.000';
                const diff = team.runs_scored - team.runs_allowed;
                const isUser = team.id === userTeamId;
                return (
                  <tr key={team.id} className={`border-b last:border-0 ${isUser ? 'bg-blue-100 font-bold' : ''}`}>
                    <td className="py-1">{idx + 1}</td>
                    <td className="py-1">{team.name}</td>
                    <td className="py-1">{team.wins}</td>
                    <td className="py-1">{team.losses}</td>
                    <td className="py-1">{pct}</td>
                    <td className="py-1">{diff > 0 ? `+${diff}` : diff}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
