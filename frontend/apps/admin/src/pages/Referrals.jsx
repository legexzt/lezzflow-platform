import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { errMsg, formatDate, formatMoney, statusBadge } from '../utils.js';

function buildReferrerCounts(referrals) {
  const counts = {};
  for (const r of referrals) {
    const key = r.referrer_name || r.referrer_partner_id || 'Unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function buildReferrerGroups(referrals) {
  const groups = {};
  for (const r of referrals) {
    const key = r.referrer_name || r.referrer_partner_id || 'Unknown';
    if (!groups[key]) groups[key] = { name: key, referrals: [] };
    groups[key].referrals.push(r.referred_name || r.referred_partner_id || 'Unknown');
  }
  return Object.values(groups);
}

function fraudFlags(referral, referrerCounts) {
  const flags = [];
  const referrerKey = referral.referrer_name || referral.referrer_partner_id || 'Unknown';
  if ((referrerCounts[referrerKey] || 0) >= 5) {
    flags.push('High volume — review');
  }
  if (referral.referred_user_created_at && referral.created_at) {
    const diffMs = Math.abs(
      new Date(referral.created_at).getTime() -
        new Date(referral.referred_user_created_at).getTime()
    );
    if (diffMs < 24 * 3600 * 1000) {
      flags.push('Fast signup — review');
    }
  }
  return flags;
}

function referredNameList(names) {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

export default function Referrals() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/referrals');
      const data = res.data;
      setReferrals(Array.isArray(data) ? data : data?.referrals ?? data?.data ?? []);
    } catch (err) {
      setError(errMsg(err, 'Could not load referrals.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Loading message="Loading referrals…" />;
  if (error) return (
    <div className="page">
      <header className="page-header"><h1>Referrals</h1></header>
      <ErrorState message={error} onRetry={load} />
    </div>
  );

  if (referrals.length === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Referrals</h1>
          <p>Partner referral programme — read-only</p>
        </header>
        <EmptyState message="No referrals found." />
      </div>
    );
  }

  const referrerCounts = buildReferrerCounts(referrals);
  const referrerGroups = buildReferrerGroups(referrals);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Referrals</h1>
        <p>Partner referral programme — read-only</p>
      </header>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>All referrals</h2>
      <div className="table-wrap" style={{ marginBottom: 40 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Referrer</th>
              <th>Referred</th>
              <th>Bonus</th>
              <th>Status</th>
              <th>Date</th>
              <th>Fraud flags</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => {
              const flags = fraudFlags(r, referrerCounts);
              return (
                <tr key={r.id}>
                  <td>{r.referrer_name || '—'}</td>
                  <td>{r.referred_name || '—'}</td>
                  <td>{formatMoney(r.bonus_amount)}</td>
                  <td>
                    <span className={statusBadge(r.status)}>{r.status || '—'}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                  <td>
                    {flags.length === 0
                      ? '—'
                      : flags.map((f) => (
                          <span key={f} className="badge badge-amber" style={{ marginRight: 4 }}>
                            {f}
                          </span>
                        ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Per-referrer summary</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Referrer</th>
              <th>Count</th>
              <th>Referred partners</th>
            </tr>
          </thead>
          <tbody>
            {referrerGroups.map((group) => {
              const isHighVolume = group.referrals.length >= 5;
              return (
                <tr key={group.name}>
                  <td>
                    {group.name}
                    {isHighVolume && (
                      <span className="badge badge-amber" style={{ marginLeft: 8 }}>
                        High volume
                      </span>
                    )}
                  </td>
                  <td>{group.referrals.length}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                    {referredNameList(group.referrals)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
