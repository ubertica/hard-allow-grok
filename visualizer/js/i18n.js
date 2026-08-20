const i18n = {
  en: {
    title: 'HARD ALLOW Context Graph',
    reload: '↻ Reload',
    fit: '⊘ Fit',
    search: 'Search nodes...',
    filters: 'Filters',
    'cat.system': 'System',
    'cat.agents': 'Agents',
    'cat.projects': 'Projects',
    'cat.hardAllow': 'HARD ALLOW',
    details: 'Details',
    selectNode: 'Select a node to see details.',
    stats: 'Stats',
    nodes: 'Nodes',
    edges: 'Edges',
    lastSync: 'Last sync',
    status: 'Status',
    type: 'Type',
    capabilities: 'Capabilities',
    grants: 'Grants injected',
    noDetails: 'No additional details.',
    connected: 'Live',
    disconnected: 'Offline',
    updated: 'Updated',
    pathFinder: 'Path Finder',
    pathFrom: 'From node...',
    pathTo: 'To node...',
    findPath: 'Find Path',
    clear: 'Clear',
    pathFound: 'Path found',
    noPath: 'No path found',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    createNode: 'Create Node / Edge',
    newNode: 'New node',
    newEdge: 'New edge',
    create: 'Create',
    overview: 'Overview',
    content: 'Content',
    raw: 'Raw JSON',
    relations: 'Relations',
    children: 'Children',
    exportTitle: 'Export Graph',
    close: 'Close',
    hydrate: 'Hydrate',
    hydrating: 'Hydrating...',
    theme: 'Theme',
    askLLM: 'Ask LLM Interpreter',
    ask: 'Ask'
  },
  es: {
    title: 'Grafo de Contexto HARD ALLOW',
    reload: '↻ Recargar',
    fit: '⊘ Ajustar',
    search: 'Buscar nodos...',
    filters: 'Filtros',
    'cat.system': 'Sistema',
    'cat.agents': 'Agentes',
    'cat.projects': 'Proyectos',
    'cat.hardAllow': 'HARD ALLOW',
    details: 'Detalles',
    selectNode: 'Selecciona un nodo para ver detalles.',
    stats: 'Estadísticas',
    nodes: 'Nodos',
    edges: 'Enlaces',
    lastSync: 'Última sinc.',
    status: 'Estado',
    type: 'Tipo',
    capabilities: 'Capacidades',
    grants: 'Grants inyectados',
    noDetails: 'Sin detalles adicionales.',
    connected: 'En vivo',
    disconnected: 'Desconectado',
    updated: 'Actualizado',
    pathFinder: 'Buscador de Rutas',
    pathFrom: 'Desde nodo...',
    pathTo: 'Hasta nodo...',
    findPath: 'Encontrar Ruta',
    clear: 'Limpiar',
    pathFound: 'Ruta encontrada',
    noPath: 'No se encontró ruta',
    edit: 'Editar',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    createNode: 'Crear Nodo / Enlace',
    newNode: 'Nuevo nodo',
    newEdge: 'Nuevo enlace',
    create: 'Crear',
    overview: 'Resumen',
    content: 'Contenido',
    raw: 'JSON Crudo',
    relations: 'Relaciones',
    children: 'Hijos',
    exportTitle: 'Exportar Grafo',
    close: 'Cerrar',
    hydrate: 'Hidratar',
    hydrating: 'Hidratando...',
    theme: 'Tema',
    askLLM: 'Preguntar al Intérprete LLM',
    ask: 'Preguntar'
  }
};

let currentLang = localStorage.getItem('ha-visualizer-lang') || navigator.language.slice(0, 2) || 'en';
if (!i18n[currentLang]) currentLang = 'en';

function t(key) {
  return (i18n[currentLang] && i18n[currentLang][key]) || i18n.en[key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[currentLang][key]) el.textContent = i18n[currentLang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (i18n[currentLang][key]) el.placeholder = i18n[currentLang][key];
  });
}

function setLanguage(lang) {
  currentLang = i18n[lang] ? lang : 'en';
  localStorage.setItem('ha-visualizer-lang', currentLang);
  applyTranslations();
  document.documentElement.lang = currentLang;
}
