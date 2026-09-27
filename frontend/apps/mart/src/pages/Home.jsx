import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import ShopMap from '../components/ShopMap.jsx';
import { formatDistance } from '../shopUtils';

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
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [fetchDiscovery]);

  // Try to locate on first load.
  useEffect(() => {
    locate();
  }, [locate]);

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
        <button
          type="button"
          className="btn btn-primary"
          onClick={locate}
          disabled={locating}
        >
          {locating ? 'Locating…' : '📍 Use my location'}
        </button>
      </div>

      {locationError && <div className="banner banner-error">{locationError}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      <ShopMap
        center={position || DEFAULT_CENTER}
        shops={allShops}
        onSelectShop={handleSelectShop}
      />

      {!position && !locating && (
        <p className="muted">
          Tap &quot;Use my location&quot; to discover kirana shops delivering around you.
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
