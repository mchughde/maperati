// ═══ Style registry — add new styles here, no other changes needed ═══════════

const MAP_STYLES = [
  {
    id: 'vector-bright',
    label: 'OSM Bright',
    url: 'https://tiles.openfreemap.org/styles/bright',
    type: 'vector',
    attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  },
  {
    id: 'vector-liberty',
    label: 'Liberty',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    type: 'vector',
    attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  },
  {
    id: 'vector-positron',
    label: 'Positron',
    url: 'https://tiles.openfreemap.org/styles/positron',
    type: 'vector',
    attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  },
  {
    id: 'raster-osm',
    label: 'OpenStreetMap',
    url: null,
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'raster-carto-light',
    label: 'CartoDB Light',
    url: null,
    type: 'raster',
    tiles: ['https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors © CARTO',
  },
  {
    id: 'raster-carto-voyager',
    label: 'CartoDB Voyager',
    url: null,
    type: 'raster',
    tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors © CARTO',
  },
  {
    id: 'raster-esri-satellite',
    label: 'ESRI Satellite',
    url: null,
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: '© Esri, Maxar, Earthstar Geographics',
  },
];

function buildRasterStyle(styleDef) {
  return {
    version: 8,
    sources: {
      'raster-tiles': {
        type: 'raster',
        tiles: styleDef.tiles,
        tileSize: 256,
        attribution: styleDef.attribution || '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'raster-layer', type: 'raster', source: 'raster-tiles' }],
  };
}

function getStyleValue(styleId) {
  const s = MAP_STYLES.find(x => x.id === styleId) || MAP_STYLES[0];
  return s.type === 'raster' ? buildRasterStyle(s) : s.url;
}

// ═══ Map credit line ═══════════════════════════════════════════════════════════
// Shown instead of MapLibre's own attribution control (create the map with
// attributionControl: false). MapLibre 4 builds its credit line from HTML the map
// providers send, and its clean-up of that HTML has a known flaw (GHSA-jrc7-96c5-q579,
// fixed only in MapLibre 6): a provider's server could slip in code that runs on
// mchughde.github.io, where every Pages app keeps its saved data. This control
// shows only the fixed plain text in MAP_STYLES, so nothing from outside reaches it.
class MapCredit {
  onAdd() {
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-attrib';
    this._inner = document.createElement('div');
    this._inner.className = 'maplibregl-ctrl-attrib-inner';
    this._container.appendChild(this._inner);
    return this._container;
  }
  onRemove() { this._container.parentNode?.removeChild(this._container); }
  show(styleId) {
    const s = MAP_STYLES.find(x => x.id === styleId) || MAP_STYLES[0];
    this._inner.textContent = s.attribution || '© OpenStreetMap contributors';
  }
}
