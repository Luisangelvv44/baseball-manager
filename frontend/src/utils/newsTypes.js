// Configuración visual por tipo de NewsItem. Compartido entre la página de Noticias
// (/news) y la campana de alertas de la Navbar.
export const TYPE_CONFIG = {
  game:          { label: 'Partido',        bg: 'bg-blue-600',   border: 'border-blue-500',   text: 'text-blue-400'   },
  injury:        { label: 'Lesión',         bg: 'bg-red-600',    border: 'border-red-500',    text: 'text-red-400'    },
  signing:       { label: 'Fichaje',        bg: 'bg-green-600',  border: 'border-green-500',  text: 'text-green-400'  },
  auction:       { label: 'Subasta',        bg: 'bg-yellow-600', border: 'border-yellow-500', text: 'text-yellow-400' },
  trade:         { label: 'Traspaso',       bg: 'bg-cyan-600',   border: 'border-cyan-500',   text: 'text-cyan-400'   },
  walkoff:       { label: 'Walk-off',       bg: 'bg-orange-600', border: 'border-orange-500', text: 'text-orange-400' },
  no_hitter:     { label: 'Hito',           bg: 'bg-purple-600', border: 'border-purple-500', text: 'text-purple-400' },
  cycle:         { label: 'Ciclo',          bg: 'bg-pink-600',   border: 'border-pink-500',   text: 'text-pink-400'   },
  multi_hr:      { label: 'Jonrones',       bg: 'bg-indigo-600', border: 'border-indigo-500', text: 'text-indigo-400' },
  extra_innings: { label: 'Extra innings',  bg: 'bg-teal-600',   border: 'border-teal-500',   text: 'text-teal-400'   },
  streak:        { label: 'Racha',          bg: 'bg-amber-600',  border: 'border-amber-500',  text: 'text-amber-400'  },
  awards:        { label: 'Premio',         bg: 'bg-fuchsia-600',border: 'border-fuchsia-500',text: 'text-fuchsia-400'},
  derby:         { label: 'Derby',          bg: 'bg-lime-600',   border: 'border-lime-500',   text: 'text-lime-400'   },
};

export const DEFAULT_CONFIG = { label: 'Noticia', bg: 'bg-gray-600', border: 'border-gray-500', text: 'text-gray-400' };

// Ruta a la que lleva cada tipo de alerta al hacer click en la campana.
export const ALERT_ROUTE = {
  injury:    '/roster',
  trade:     '/trades',
  auction:   '/market',
  no_hitter: '/news',
  cycle:     '/news',
  multi_hr:  '/news',
};
