/**
 * Self-contained Leaflet map for farm-boundary mapping, rendered inside a
 * react-native-webview. Keyless: Esri World Imagery (satellite) + OpenStreetMap
 * (street). Supports:
 *   - Walk mode: RN streams GPS points in; we draw the polygon live.
 *   - Draw mode: freehand finger drawing → simplified, editable polygon.
 *   - Live area (ha/acres) + perimeter (m) via turf.
 *   - Vertex editing via Leaflet-Geoman.
 *   - Load an existing boundary for editing.
 *
 * Messaging:
 *   RN → web:  window.onRNMessage(jsonString)   { cmd, ... }
 *   web → RN:  window.ReactNativeWebView.postMessage(jsonString)  { type, ... }
 */
export function boundaryMapHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="stylesheet" href="https://unpkg.com/@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background:#0b1f17; }
  .leaflet-control-attribution { font-size: 9px; }
  .pt-marker { background:#10B981; border:2px solid #fff; border-radius:50%; width:12px; height:12px; box-shadow:0 0 0 2px rgba(16,185,129,0.4); }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/@geoman-io/leaflet-geoman-free@2.14.2/dist/leaflet-geoman.min.js"></script>
<script src="https://unpkg.com/@turf/turf@6/turf.min.js"></script>
<script>
(function () {
  var post = function (o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} };

  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-6.8, 39.28], 16);

  var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' });
  var street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' });
  satellite.addTo(map);
  var currentBase = satellite;

  // ---- shared polygon state ----
  var poly = null;          // the editable L.polygon (draw mode / loaded)
  var walkPts = [];         // [[lat,lng], ...] for walk mode
  var walkLine = null, walkPoly = null, walkMarkers = [], accCircle = null;
  var mode = 'walk';
  var freehand = { active: false, pts: [], line: null };

  function ring(latlngs) {
    // latlngs: array of L.LatLng or [lat,lng]; returns closed [ [lng,lat], ... ]
    var r = latlngs.map(function (p) { return Array.isArray(p) ? [p[1], p[0]] : [p.lng, p.lat]; });
    if (r.length && (r[0][0] !== r[r.length-1][0] || r[0][1] !== r[r.length-1][1])) r.push(r[0]);
    return r;
  }

  function metricsFor(latlngs) {
    if (!latlngs || latlngs.length < 3) return { pointCount: latlngs ? latlngs.length : 0, areaHa: 0, areaAcres: 0, perimeterM: 0 };
    var gj = turf.polygon([ring(latlngs)]);
    var area = turf.area(gj);                         // m²
    var perim = turf.length(turf.polygonToLine(gj), { units: 'meters' });
    return {
      pointCount: latlngs.length,
      areaHa: +(area / 10000).toFixed(2),
      areaAcres: +(area / 4046.8564224).toFixed(2),
      perimeterM: +perim.toFixed(1),
    };
  }

  function emitMetrics() {
    var latlngs = currentLatLngs();
    post(Object.assign({ type: 'metrics' }, metricsFor(latlngs)));
  }

  function currentLatLngs() {
    if (mode === 'walk') return walkPts.map(function (p) { return { lat: p[0], lng: p[1] }; });
    if (poly) return poly.getLatLngs()[0];
    return [];
  }

  // ---------- WALK MODE ----------
  function redrawWalk() {
    walkMarkers.forEach(function (m) { map.removeLayer(m); });
    walkMarkers = [];
    walkPts.forEach(function (p) {
      var mk = L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="pt-marker"></div>', iconSize: [12,12], iconAnchor: [6,6] }) });
      mk.addTo(map); walkMarkers.push(mk);
    });
    if (walkLine) map.removeLayer(walkLine);
    if (walkPoly) map.removeLayer(walkPoly);
    if (walkPts.length >= 2 && walkPts.length < 3) {
      walkLine = L.polyline(walkPts, { color: '#10B981', weight: 3 }).addTo(map);
    } else if (walkPts.length >= 3) {
      walkPoly = L.polygon(walkPts, { color: '#10B981', weight: 3, fillColor: '#10B981', fillOpacity: 0.25 }).addTo(map);
    }
    emitMetrics();
  }

  function addPoint(lat, lng, acc) {
    walkPts.push([lat, lng]);
    if (accCircle) map.removeLayer(accCircle);
    if (acc) accCircle = L.circle([lat, lng], { radius: acc, color: '#3B82F6', weight: 1, fillOpacity: 0.08 }).addTo(map);
    map.panTo([lat, lng], { animate: true });
    if (map.getZoom() < 16) map.setZoom(17);
    redrawWalk();
  }

  // ---------- DRAW MODE (freehand) ----------
  function clearPoly() {
    if (poly) { try { poly.pm.disable(); } catch(e){} map.removeLayer(poly); poly = null; }
  }
  function makeEditablePolygon(latlngs) {
    clearPoly();
    poly = L.polygon(latlngs, { color: '#10B981', weight: 3, fillColor: '#10B981', fillOpacity: 0.25 }).addTo(map);
    poly.pm.enable({ allowSelfIntersection: false, snappable: true });
    poly.on('pm:markerdrag pm:vertexadded pm:vertexremoved pm:edit', emitMetrics);
    try { map.fitBounds(poly.getBounds(), { padding: [40,40] }); } catch(e){}
    emitMetrics();
  }

  function beginFreehand() {
    freehand.active = true; freehand.pts = [];
    map.dragging.disable();
    if (freehand.line) { map.removeLayer(freehand.line); freehand.line = null; }
  }
  function endFreehand() {
    map.dragging.enable();
    if (!freehand.active) return;
    freehand.active = false;
    var pts = freehand.pts;
    if (freehand.line) { map.removeLayer(freehand.line); freehand.line = null; }
    if (pts.length < 3) return;
    // simplify the stroke, then close into a polygon
    var line = turf.lineString(pts.map(function (ll) { return [ll.lng, ll.lat]; }));
    var simp = turf.simplify(line, { tolerance: 0.00003, highQuality: true });
    var coords = simp.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }); // [lat,lng]
    makeEditablePolygon(coords);
  }

  var container = map.getContainer();
  container.addEventListener('touchstart', function (e) {
    if (mode !== 'draw' || poly) return; // only freehand when no polygon yet
    beginFreehand();
  }, { passive: true });
  container.addEventListener('touchmove', function (e) {
    if (mode !== 'draw' || !freehand.active) return;
    var t = e.touches[0];
    var rect = container.getBoundingClientRect();
    var ll = map.containerPointToLatLng([t.clientX - rect.left, t.clientY - rect.top]);
    freehand.pts.push(ll);
    if (!freehand.line) freehand.line = L.polyline([], { color: '#10B981', weight: 3, dashArray: '4' }).addTo(map);
    freehand.line.addLatLng(ll);
  }, { passive: true });
  container.addEventListener('touchend', function () {
    if (mode === 'draw' && freehand.active) endFreehand();
  });

  // ---------- COMMANDS from RN ----------
  window.onRNMessage = function (json) {
    var m; try { m = JSON.parse(json); } catch (e) { return; }
    switch (m.cmd) {
      case 'init':
        if (m.center) map.setView([m.center.lat, m.center.lng], 17);
        mode = m.mode || 'walk';
        if (m.existing && m.existing.coordinates) {
          var coords = m.existing.coordinates[0].map(function (c) { return [c[1], c[0]]; });
          if (coords.length > 1) coords.pop(); // drop closing dup
          mode = 'draw';
          makeEditablePolygon(coords);
          post({ type: 'mode', mode: 'draw' });
        }
        post({ type: 'ready' });
        break;
      case 'setMode':
        mode = m.mode;
        if (mode === 'draw' && walkPts.length >= 3 && !poly) {
          // carry a walked shape into editable draw mode
          makeEditablePolygon(walkPts.map(function (p) { return [p[0], p[1]]; }));
        }
        emitMetrics();
        break;
      case 'setLayer':
        map.removeLayer(currentBase);
        currentBase = (m.layer === 'street') ? street : satellite;
        currentBase.addTo(map);
        break;
      case 'addPoint': addPoint(m.lat, m.lng, m.acc); break;
      case 'undo':
        if (mode === 'walk') { walkPts.pop(); redrawWalk(); }
        break;
      case 'clear':
        walkPts = []; redrawWalk(); clearPoly();
        if (accCircle) { map.removeLayer(accCircle); accCircle = null; }
        emitMetrics();
        break;
      case 'recenter':
        if (m.center) map.panTo([m.center.lat, m.center.lng]);
        break;
      case 'getResult': {
        var latlngs = currentLatLngs();
        if (!latlngs || latlngs.length < 3) { post({ type: 'result', ok: false }); break; }
        var closed = ring(latlngs);
        var gj = turf.polygon([closed]);
        var c = turf.centroid(gj).geometry.coordinates; // [lng,lat]
        var mm = metricsFor(latlngs);
        post({ type: 'result', ok: true, geometry: { type: 'Polygon', coordinates: [closed] },
               centerLat: c[1], centerLng: c[0], areaHa: mm.areaHa, areaAcres: mm.areaAcres, perimeterM: mm.perimeterM });
        break;
      }
    }
  };

  // iOS + Android WebView both dispatch 'message' on document/window
  document.addEventListener('message', function (e) { window.onRNMessage(e.data); });
  window.addEventListener('message', function (e) { window.onRNMessage(e.data); });

  post({ type: 'loaded' });
})();
</script>
</body>
</html>`;
}
