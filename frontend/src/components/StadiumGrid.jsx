export default function StadiumGrid({ sections, onCellClick }) {
  // mapa rapido por (row,col)
  const map = {};
  sections.forEach((s) => {
    map[`${s.row_pos}-${s.col_pos}`] = s;
  });

  const cellStyle = (section) => {
    if (!section) return 'bg-gray-200';
    switch (section.section_type) {
      case 'field':
        return 'bg-green-500 text-white';
      case 'grandstand':
        return 'bg-amber-200 hover:bg-amber-300 cursor-pointer';
      case 'empty':
        return 'bg-gray-100 hover:bg-gray-200 cursor-pointer border-dashed';
      default:
        return 'bg-gray-200';
    }
  };

  const cellLabel = (section) => {
    if (!section) return '';
    if (section.section_type === 'field') return 'Campo';
    if (section.section_type === 'grandstand') {
      return `${section.label}\nNivel ${section.upgrade_level}\n$${Number(section.price_per_ticket).toFixed(2)}`;
    }
    if (section.section_type === 'empty') return '+ Construir';
    return '';
  };

  const rows = [1, 2, 3];
  const cols = [1, 2, 3];

  return (
    <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
      {rows.map((r) =>
        cols.map((c) => {
          const section = map[`${r}-${c}`];
          return (
            <div
              key={`${r}-${c}`}
              onClick={() => {
                if (section && (section.section_type === 'grandstand' || section.section_type === 'empty')) {
                  onCellClick(section);
                }
              }}
              className={`aspect-square rounded-lg border-2 border-gray-300 flex items-center justify-center text-center text-xs font-semibold p-2 whitespace-pre-line ${cellStyle(section)}`}
            >
              {cellLabel(section)}
            </div>
          );
        })
      )}
    </div>
  );
}
