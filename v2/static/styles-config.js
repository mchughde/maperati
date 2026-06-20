// ═══ Style registry — add new styles here, no other changes needed ═══════════

const MAP_STYLES = [
  {
    id: 'vector-bright',
    label: 'OSM Bright',
    url: 'https://tiles.openfreemap.org/styles/bright',
    type: 'vector',
  },
  {
    id: 'vector-liberty',
    label: 'Liberty',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    type: 'vector',
  },
  {
    id: 'vector-positron',
    label: 'Positron',
    url: 'https://tiles.openfreemap.org/styles/positron',
    type: 'vector',
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
