'use strict';

// ═══ State ═══════════════════════════════════════════════
let datasetStops   = [];
let filteredStops  = [];
let selectedStops  = [];

let drawing        = false;
let drawMode       = 'free';
let mapClickMode   = false;
let addStopMode    = null; // null = numbered; or a CATEGORIES key
let bboxMode       = false;
let bboxCorner1    = null;
let bboxRect       = null;
let bboxBounds     = null;

let printAreaMode       = false;
let printAreaCorner1    = null;
let printAreaCornerMark = null;
let printAreaRect       = null;
let printAreaBounds     = null;

let routeCoords    = [];
let routeSegments  = [];
let routeDistM     = 0;
let routePolyline  = null;
let dotMarkers     = [];
let ctxLatLng      = null;
let eraseMode      = false;
let eraseStart     = null;
let eraseMarker    = null;
let stopMarkers    = [];
let _stopMarkers   = {};
let datasetMarkers  = L.layerGroup();
let allMarkersLayer = L.layerGroup();
let osmPoiMarkers   = L.layerGroup();

let geoDebounce    = null;
let customIdSeq    = 1;
let stopUndoStack        = [];
let elevationData        = [];
let elevationDists       = [];
let routeEndpointMarkers = [];
let _elevTimer;
let _saveTimer;
let undoStack = [];
let redoStack = [];

const SESSION_KEY = 'maperati_session';

const CATEGORIES = {
  street:   { label: 'Best street',     color: '#7C3AED' },
  garden:   { label: 'Garden',          color: '#16a34a' },
  museum:   { label: 'Museum',          color: '#2563EB' },
  church:   { label: 'Church',          color: '#9333ea' },
  monument: { label: 'Monument',        color: '#b45309' },
  cafe:     { label: 'Cafe/restaurant', color: '#dc2626' },
  shop:     { label: 'Market',          color: '#0891b2' },
};

function catIconPath(cat) {
  switch(cat) {
    case 'street':   return '<polygon points="10,1.5 12.2,7.1 18.2,7.1 13.5,10.5 15.3,16 10,12.5 4.7,16 6.5,10.5 1.8,7.1 7.8,7.1"/>';
    case 'garden':   return '<path d="M10 2L5.5 9H8L4 16h5.5v3h1V16H16L12 9h2.5z"/>';
    case 'museum':   return '<path d="M0 5l10-4 10 4v2H0V5zm2 3h2.5v8H2V8zm4 0h2.5v8H6V8zm4 0h2.5v8H10V8zm4 0h2.5v8H14V8zM0 17h20v2H0z"/>';
    case 'church':   return '<path d="M9 1h2v6h6v2h-6v10H9V9H3V7h6z"/>';
    case 'monument': return '<path d="M10 1L3 18h2.5l1-2.5h7l1 2.5H17L10 1zm0 5.5l2.5 8h-5z"/>';
    case 'cafe':     return '<path d="M5 2v6c0 1 .7 1.8 1.7 2L7 18h2v-8c1-.2 1.7-1 1.7-2V2H9v5H7V2H5zm7 0v16h2V2h-2z"/>';
    case 'shop':     return '<path d="M2 7l2-4h12l2 4H2zm-1 2h18v9H1V9zm3 2v4h2v-4H4zm5 0v4h2v-4H9zm5 0v4h2v-4h-2z"/>';
    default:         return '<circle cx="10" cy="10" r="7"/>';
  }
}
