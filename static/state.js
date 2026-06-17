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
let detourPoints     = [];  // [{lat, lng}] — serialised to session
let detourMarkerList = [];  // parallel Leaflet markers (not serialised)

const SESSION_KEY = 'maperati_session';

const CATEGORIES = {
  street:        { label: 'Best street',     color: '#7C3AED' },
  garden:        { label: 'Garden',          color: '#16a34a' },
  museum:        { label: 'Museum',          color: '#2563EB' },
  church:        { label: 'Church',          color: '#9333ea' },
  monument:      { label: 'Monument',        color: '#b45309' },
  cafe:          { label: 'Cafe/restaurant', color: '#dc2626' },
  shop:          { label: 'Market',          color: '#0891b2' },
  accommodation: { label: 'Accommodation',   color: '#0369a1' },
  shopping:      { label: 'Shop',            color: '#be185d' },
  transport:     { label: 'Transport',       color: '#374151' },
  viewpoint:     { label: 'Viewpoint',       color: '#65a30d' },
  theatre:       { label: 'Theatre',         color: '#c026d3' },
  facilities:    { label: 'Facilities',      color: '#0f766e' },
  bar:           { label: 'Bar/wine',        color: '#a16207' },
  library:       { label: 'Library',         color: '#1d4ed8' },
};

function catIconPath(cat) {
  switch(cat) {
    case 'street':   return '<polygon points="10,1.5 12.2,7.1 18.2,7.1 13.5,10.5 15.3,16 10,12.5 4.7,16 6.5,10.5 1.8,7.1 7.8,7.1"/>';
    case 'garden':   return '<path d="M10 2L5.5 9H8L4 16h5.5v3h1V16H16L12 9h2.5z"/>';
    case 'museum':   return '<path d="M0 5l10-4 10 4v2H0V5zm2 3h2.5v8H2V8zm4 0h2.5v8H6V8zm4 0h2.5v8H10V8zm4 0h2.5v8H14V8zM0 17h20v2H0z"/>';
    case 'church':   return '<path d="M9 1h2v6h6v2h-6v10H9V9H3V7h6z"/>';
    case 'monument': return '<path d="M10 1L3 18h2.5l1-2.5h7l1 2.5H17L10 1zm0 5.5l2.5 8h-5z"/>';
    case 'cafe':     return '<path d="M5 2v6c0 1 .7 1.8 1.7 2L7 18h2v-8c1-.2 1.7-1 1.7-2V2H9v5H7V2H5zm7 0v16h2V2h-2z"/>';
    case 'shop':          return '<path d="M2 7l2-4h12l2 4H2zm-1 2h18v9H1V9zm3 2v4h2v-4H4zm5 0v4h2v-4H9zm5 0v4h2v-4h-2z"/>';
    case 'accommodation': return '<path d="M2 17v-7h16v7H2zm1-4h14v-2H3v2zM3 9V5h2v1h10V5h2v4H3zm3 3h3v2H6v-2zm5 0h3v2h-3v-2z"/>';
    case 'shopping':      return '<path d="M7 8V6a3 3 0 0 1 6 0v2h3l1 11H3L4 8h3zm1 0h4V6a2 2 0 0 0-4 0v2z"/>';
    case 'transport':     return '<path d="M4 15V8l1-3h10l1 3v7H4zm2 2v1h2v-1H6zm6 0v1h2v-1h-2zM5 9h10V8H5v1zm0 4h10v-3H5v3z"/>';
    case 'viewpoint':     return '<path d="M1 10s4-7 9-7 9 7 9 7-4 7-9 7-9-7-9-7zm9-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>';
    case 'theatre':       return '<path d="M10 1a9 9 0 1 0 0 18A9 9 0 0 0 10 1zm-3 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-3 8c-2.2 0-4-1.3-4.5-3h9c-.5 1.7-2.3 3-4.5 3z"/>';
    case 'facilities':    return '<path d="M6 1a3 3 0 1 0 0 6A3 3 0 0 0 6 1zm8 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 8l-2 5h4l1 6h2l1-6h4l1 6h2l1-6h4l-2-5H4z"/>';
    case 'bar':           return '<path d="M6 2v8a4 4 0 0 0 8 0V2H6zm2 2h4v4a2 2 0 0 1-4 0V4zM5 15h10v2H5v-2z"/>';
    case 'library':       return '<path d="M2 18V4l6-3 4 2 4-2v14l-4 2-4-2-6 3zm6-2.5V3.8L4 5.5v11.7l4-1.7zm2 .3l4 1.7V5.5l-4-1.7v12z"/>';
    default:              return '<circle cx="10" cy="10" r="7"/>';
  }
}
