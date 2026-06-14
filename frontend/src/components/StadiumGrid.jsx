export default function StadiumGrid({ sections, floors, onCellClick }) {
  const map = {};
  sections.forEach((s) => {
    map[`${s.row_pos}-${s.col_pos}`] = s;
  });

  const size = floors * 2 + 2;
  const indices = Array.from({ length: size }, (_, i) => i + 1);

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

  return (
    <div
      className="gap-1 mx-auto"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        maxWidth: `${size * 72}px`,
      }}
    >
      {indices.map((r) =>
        indices.map((c) => {
          const section = map[`${r}-${c}`];
          return (
            <div
              key={`${r}-${c}`}
              onClick={() => {
                if (section && (section.section_type === 'grandstand' || section.section_type === 'empty')) {
                  onCellClick(section);
                }
              }}
              className={`aspect-square rounded border-2 border-gray-300 flex items-center justify-center text-center font-semibold p-1 whitespace-pre-line ${cellStyle(section)}`}
              style={{ fontSize: size <= 4 ? '0.75rem' : size <= 6 ? '0.65rem' : '0.55rem' }}
            >
              {cellLabel(section)}
            </div>
          );
        })
      )}
    </div>
  );
}
