import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getLat, getLng } from '../shopUtils';

// Leaflet's default marker icons don't resolve under Vite; point them at the CDN.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function ShopMap({ center, shops, onSelectShop }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // Initialise the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined;
    const map = L.map(containerRef.current).setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update centre + markers whenever position or shops change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setView(center, map.getZoom() || 13);

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // User position marker.
    const userMarker = L.circleMarker(center, {
      radius: 8,
      color: '#15803d',
      weight: 2,
      fillColor: '#22c55e',
      fillOpacity: 0.9,
    })
      .addTo(map)
      .bindPopup('You are here');
    markersRef.current.push(userMarker);

    // Shop markers.
    (shops || []).forEach((shop) => {
      const lat = getLat(shop);
      const lng = getLng(shop);
      if (lat == null || lng == null) return;
      const marker = L.marker([lat, lng]).addTo(map).bindPopup(shop.name || 'Shop');
      if (onSelectShop) {
        marker.on('click', () => onSelectShop(shop));
      }
      markersRef.current.push(marker);
    });
  }, [center, shops, onSelectShop]);

  return <div ref={containerRef} className="map" />;
}
