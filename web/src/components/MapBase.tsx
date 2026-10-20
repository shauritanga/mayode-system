'use client';
import { LayersControl, LayerGroup, TileLayer, useMapEvents } from 'react-leaflet';

/**
 * The base map every farm map sits on: real satellite imagery with place names, and plain streets as a choice.
 * Farm boundaries, plots and pins are drawn on top of it as overlays.
 */
export function MapBase() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Satellite">
        <LayerGroup>
          <TileLayer
            attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={17}
            maxZoom={20}
          />
          <TileLayer
            attribution="Labels &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={14}
            maxZoom={20}
          />
        </LayerGroup>
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Streets">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={20}
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}

/**
 * Keeps the mouse wheel for scrolling the page: the map zooms with the wheel only after it has been clicked,
 * and goes back to scrolling the page when the pointer leaves it. Use with `scrollWheelZoom={false}`.
 */
export function ClickToZoom() {
  const map = useMapEvents({
    click: () => map.scrollWheelZoom.enable(),
    mouseout: () => map.scrollWheelZoom.disable(),
  });
  return null;
}
