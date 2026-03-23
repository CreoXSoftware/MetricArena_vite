import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// leaflet.heat is loaded via CDN in index.html since it doesn't have a proper ESM export

/** Keep one point per minDist metres — reduces marker count for value modes. */
function spatialSubsample(points, minDistMeters) {
  if (!points.length) return points;
  const out = [points[0]];
  let pLat = points[0].lat, pLon = points[0].lon;
  const minSq = minDistMeters * minDistMeters;
  for (let i = 1; i < points.length; i++) {
    const { lat, lon } = points[i];
    const dLat = (lat - pLat) * 111320;
    const dLon = (lon - pLon) * 111320 * Math.cos(pLat * Math.PI / 180);
    if (dLat * dLat + dLon * dLon >= minSq) {
      out.push(points[i]); pLat = lat; pLon = lon;
    }
  }
  return out;
}

/** Map a normalised value 0-1 to a blue → cyan → orange → red colour string. */
function valueToColor(t) {
  t = Math.max(0, Math.min(1, t));
  const stops = [
    [0,    [30,  100, 255]],
    [0.35, [0,   210, 220]],
    [0.65, [255, 160,   0]],
    [1.0,  [255,  50,  50]],
  ];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
  const f = t0 === t1 ? 0 : (t - t0) / (t1 - t0);
  return `rgb(${Math.round(c0[0] + f * (c1[0] - c0[0]))},${Math.round(c0[1] + f * (c1[1] - c0[1]))},${Math.round(c0[2] + f * (c1[2] - c0[2]))})`;
}

let heatLoaded = false;
const loadHeat = () => {
  if (heatLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    if (window.L && window.L.heatLayer) { heatLoaded = true; resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js';
    script.onload = () => { heatLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
};

export default function HeatMap({ data, chartView }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const heatLayerRef = useRef(null);
  const polylineRef = useRef(null);

  const radiusRef = useRef(15);
  const intensityRef = useRef(0.8);
  const modeRef = useRef('density');

  const [radius, setRadius] = React.useState(15);
  const [intensity, setIntensity] = React.useState(8);
  const [mode, setMode] = React.useState('density');

  // Init map
  useEffect(() => {
    if (!mapRef.current || !data || data.length === 0) return;
    if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }

    const lats = data.map(d => d.lat);
    const lons = data.map(d => d.lon);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;

    const map = L.map(mapRef.current, { zoomControl: true }).setView([centerLat, centerLon], 18);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB', maxZoom: 20
    }).addTo(map);

    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 300);
    setTimeout(() => map.invalidateSize(), 800);

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [data]);

  // Update heatmap
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !data) return;

    loadHeat().then(() => {
      // Guard: map may have been destroyed while waiting for heat lib to load
      if (!mapInstanceRef.current || !mapInstanceRef.current.getContainer()) return;

      if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);
      if (polylineRef.current) map.removeLayer(polylineRef.current);

      const viewData = data.filter(d => d.t >= chartView.tStart && d.t <= chartView.tEnd);
      polylineRef.current = L.polyline(viewData.map(d => [d.lat, d.lon]), { color: '#00e5a080', weight: 2 }).addTo(map);

      const int = intensity / 10;

      if (mode === 'density') {
        // Accumulation is intentional: slow / frequented areas appear hotter.
        const gradient = { 0.2: '#0a0a6b', 0.4: '#00b8ff', 0.6: '#00e5a0', 0.8: '#ffaa00', 1.0: '#ff6b6b' };
        const heatPoints = viewData.map(d => [d.lat, d.lon, Math.min(1, int)]);
        const layerOpts = { radius, blur: Math.max(1, radius * 0.8), maxZoom: 20, max: 1.0, gradient };
        heatLayerRef.current = L.heatLayer(heatPoints, layerOpts).addTo(map);
      } else {
        // Value mode: colour each point directly by its normalised value.
        // L.circleMarker avoids leaflet.heat's blob accumulation entirely.
        const field = mode === 'speed' ? 'speed' : 'linMag';
        const sampled = spatialSubsample(viewData, 2);
        const vals = sampled.map(d => d[field]);
        const maxVal = Math.max(...vals) || 1;
        const dotRadius = Math.max(2, Math.round(radius / 4));
        const renderer = L.canvas({ padding: 0.5 });
        const markers = sampled.map((d, i) =>
          L.circleMarker([d.lat, d.lon], {
            radius: dotRadius,
            fillColor: valueToColor(vals[i] / maxVal),
            fillOpacity: Math.min(1, int * 0.9),
            stroke: false,
            renderer,
          })
        );
        heatLayerRef.current = L.layerGroup(markers).addTo(map);
      }
    });
  }, [data, chartView, radius, intensity, mode]);

  return (
    <div className="section">
      <div className="section-title"><span className="dot"></span> GPS Heatmap</div>
      <div id="map-container">
        <div id="map" ref={mapRef}></div>
      </div>
      <div className="heatmap-controls">
        <div className="ctrl-group">
          <label>Heat:</label>
          <select value={mode} onChange={e => setMode(e.target.value)}
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid #333', borderRadius: '4px', padding: '2px 6px', fontSize: '13px' }}>
            <option value="density">Density</option>
            <option value="speed">Speed</option>
            <option value="accel">Acceleration</option>
          </select>
        </div>
        <div className="ctrl-group">
          <label>Radius: <span>{radius}</span></label>
          <input type="range" min="5" max="50" value={radius} onChange={e => setRadius(+e.target.value)} />
        </div>
        <div className="ctrl-group">
          <label>Intensity: <span>{(intensity / 10).toFixed(1)}</span></label>
          <input type="range" min="1" max="20" value={intensity} onChange={e => setIntensity(+e.target.value)} />
        </div>
      </div>
    </div>
  );
}
