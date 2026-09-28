import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg } from '../utils.js';

const STEP_LABELS = {
  profile: 'Profile',
  products: 'Products',
  test_order: 'Test order',
  go_live: 'Go live',
};

export default function Funnel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/onboarding/funnel-dropoff');
      setData(res.data);
    } catch (err) {
      setError(errMsg(err, 'Could not load funnel data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Loading message="Loading onboarding funnel…" />;
  if (error) return (
    <div className="page">
      <header className="page-header">
        <h1>Onboarding Funnel</h1>
      </header>
      <ErrorState message={error} onRetry={load} />
    </div>
  );

  const dropoff = data?.dropoff ?? [];
  const totalUsers = data?.total_users_in_funnel ?? 0;

  if (totalUsers === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Onboarding Funnel</h1>
          <p>Seller signup drop-off by step</p>
        </header>
        <EmptyState message="No onboarding data yet. Users who start the seller funnel will appear here." />
      </div>
    );
  }

  const maxStuck = dropoff.length > 0 ? Math.max(...dropoff.map((s) => s.users_stuck)) : 0;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Onboarding Funnel</h1>
        <p>Seller signup drop-off by step</p>
      </header>

      <p style={{ marginBottom: 24, fontSize: 15 }}>
        <strong>{totalUsers}</strong> users entered the funnel
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {dropoff.map((step, i) => {
          const barPct = maxStuck > 0 ? (step.users_stuck / maxStuck) * 100 : 0;
          const prev = dropoff[i - 1];
          let dropoffLabel = null;
          if (prev) {
            if (prev.users_stuck > 0) {
              const pct = ((prev.users_stuck - step.users_stuck) / prev.users_stuck * 100).toFixed(1);
              dropoffLabel = `Drop-off: ${pct}%`;
            } else {
              dropoffLabel = 'Drop-off: —';
            }
          }

          return (
            <div key={step.step}>
              {dropoffLabel && (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 0 4px 140px' }}>
                  {dropoffLabel}
                </div>
              )}
              <div className="funnel-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="funnel-label" style={{ width: 128, flexShrink: 0, fontSize: 14, fontWeight: 500 }}>
                  {STEP_LABELS[step.step] ?? step.step}
                </span>
                <div className="funnel-bar-track" style={{ flex: 1, height: 28, backgroundColor: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    className="funnel-bar"
                    style={{
                      width: `${barPct}%`,
                      height: '100%',
                      backgroundColor: 'var(--primary)',
                      borderRadius: 4,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <span className="funnel-count" style={{ width: 120, flexShrink: 0, fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
                  {step.users_stuck} users stuck
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
