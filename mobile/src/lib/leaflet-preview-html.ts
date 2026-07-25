/**
 * Lightweight, non-interactive Leaflet map that renders a saved farm/plot
 * boundary polygon over Esri satellite imagery. Used as a preview card on the
 * farm/plot detail screen. Keyless. All interaction is disabled so it behaves
 * like a static image the parent can wrap in a TouchableOpacity.
 */
export function boundaryPreviewHtml(geometry: any): string {
  const geoStr = JSON.stringify(geometry ?? null);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;padding:0;background:#0b1f17;}</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var map = L.map('map', {
    zoomControl:false, attributionControl:false, dragging:false, touchZoom:false,
    scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false, keyboard:false, tap:false,
  });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
  var geo = ${geoStr};
  if (geo && geo.coordinates && geo.coordinates[0]) {
    var latlngs = geo.coordinates[0].map(function(c){ return [c[1], c[0]]; });
    // White casing under a bright green line so the shape pops on satellite.
    L.polygon(latlngs, { color:'#ffffff', weight:6, opacity:0.9, fill:false }).addTo(map);
    var poly = L.polygon(latlngs, { color:'#10B981', weight:3, fillColor:'#10B981', fillOpacity:0.22 }).addTo(map);
    // Small margin so the boundary fills most of the card but isn't edge-to-edge.
    try { map.fitBounds(poly.getBounds(), { padding:[28,28], maxZoom:18 }); } catch(e){ map.setView(latlngs[0], 16); }
  } else {
    map.setView([-6.8, 39.28], 13);
  }
})();
</script>
</body>
</html>`;
}
