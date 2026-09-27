import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import ShopMap from '../components/ShopMap.jsx';
import { formatDistance } from '../shopUtils';
import Icon from '../components/Icon.jsx';

const DEFAULT_CENTER = [12.9716, 77.5946]; // Bengaluru fallback until GPS resolves

function ShopCard({ shop }) {
  const distance = formatDistance(shop);
  return (
    <Link to={`/shop/${shop.id}`} className="shop-card">
      <div className="shop-card-body">
        <h3>{shop.name}</h3>
        {shop.address && <p className="muted">{shop.address}</p>}
        <div className="chip-row">
          {distance && <span className="chip">{distance} away</span>}
          {shop.is_open === true && <span className="chip chip-open">Open</span>}
          {shop.is_open === false && <span className="chip chip-closed">Closed</span>}
        </div>
      </div>
      <span className="shop-card-cta">Browse →</span>
    </Link>
  );
}

function ShopSection({ title, shops, empty }) {
  return (
    <section className="shop-section">
      <h2>{title}</h2>
      {shops.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="shop-grid">
          {shops.map((shop) => (
            <ShopCard key={shop.id} shop={shop} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualError, setManualError] = useState('');
  const [layers, setLayers] = useState({ within5km: [], within10km: [], within20km: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDiscovery = useCallback(async (lat, lng) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/discover', { params: { lat, lng } });
      setLayers({
        within5km: res.data?.within5km || [],
        within10km: res.data?.within10km || [],
        within20km: res.data?.within20km || [],
      });
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load nearby shops. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationError('Geolocation is not supported by this browser.');
      setShowManualLocation(true);
      return;
    }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setPosition(coords);
        setLocating(false);
        fetchDiscovery(coords[0], coords[1]);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow location access to discover nearby shops.'
            : 'Unable to get your location. Please try again.'
        );
        setShowManualLocation(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [fetchDiscovery]);

  // Try to locate on first load.
  useEffect(() => {
    locate();
  }, [locate]);

  const applyManualLocation = useCallback(
    (lat, lng) => {
      const coords = [lat, lng];
      setPosition(coords);
      setLocationError('');
      setManualError('');
      setShowManualLocation(false);
      fetchDiscovery(lat, lng);
    },
    [fetchDiscovery]
  );

  const handleManualSubmit = useCallback(() => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setManualError('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    applyManualLocation(lat, lng);
  }, [manualLat, manualLng, applyManualLocation]);

  // De-dupe layers: a shop within 5 km also appears in the 10/20 km payloads.
  const groups = useMemo(() => {
    const in5 = layers.within5km;
    const ids5 = new Set(in5.map((s) => s.id));
    const in10 = layers.within10km.filter((s) => !ids5.has(s.id));
    const ids10 = new Set(in10.map((s) => s.id));
    const in20 = layers.within20km.filter((s) => !ids5.has(s.id) && !ids10.has(s.id));
    return { in5, in10, in20 };
  }, [layers]);

  const allShops = useMemo(
    () => [...groups.in5, ...groups.in10, ...groups.in20],
    [groups]
  );

  const handleSelectShop = useCallback(
    (shop) => {
      if (shop?.id) navigate(`/shop/${shop.id}`);
    },
    [navigate]
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Shops near you</h1>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setManualError('');
              setShowManualLocation((v) => !v);
            }}
          >
            {showManualLocation ? 'Cancel manual location' : 'Set location manually'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={locate}
            disabled={locating}
          >
            {locating ? 'Locating…' : (<><Icon name="location" size={16} /> Use my location</>)}
          </button>
        </div>
      </div>

      {locationError && <div className="banner banner-error">{locationError}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      {showManualLocation && (
        <div className="manual-location">
          <p className="muted">
            Enter your coordinates manually, or start from the city default:
          </p>
          <div className="manual-location-row">
            <input
              type="number"
              step="any"
              placeholder="Latitude (e.g. 12.9716)"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
            />
            <input
              type="number"
              step="any"
              placeholder="Longitude (e.g. 77.5946)"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleManualSubmit}
            >
              Use this location
            </button>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => applyManualLocation(DEFAULT_CENTER[0], DEFAULT_CENTER[1])}
          >
            Use Bengaluru city center
          </button>
          {manualError && <div className="banner banner-error">{manualError}</div>}
        </div>
      )}

      <ShopMap
        center={position || DEFAULT_CENTER}
        shops={allShops}
        onSelectShop={handleSelectShop}
      />

      {!position && !locating && !showManualLocation && (
        <p className="muted">
          Tap &quot;Use my location&quot; or &quot;Set location manually&quot; to discover
          kirana shops delivering around you.
        </p>
      )}
      {loading && <p className="muted">Finding shops…</p>}

      {position && !loading && (
        <>
          <ShopSection
            title="Within 5 km"
            shops={groups.in5}
            empty="No shops within 5 km yet."
          />
          <ShopSection
            title="Within 10 km"
            shops={groups.in10}
            empty="No more shops between 5–10 km."
          />
          <ShopSection
            title="Within 20 km"
            shops={groups.in20}
            empty="No more shops between 10–20 km."
          />
        </>
      )}
    </div>
  );
}
