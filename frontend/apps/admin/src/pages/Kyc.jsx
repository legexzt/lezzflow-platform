import { useEffect, useState } from 'react';
import api from '../api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { asArray, errMsg, formatDate, statusBadge } from '../utils.js';

// Privacy rule: document URLs and full Aadhaar / PAN / licence numbers are
// NEVER rendered in this console. We only detect that a value exists and
// display a "Document on file" label.
const DOC_DEFS = [
  {
    label: 'Aadhaar',
    icon: 'idcard',
    keys: ['aadhaar', 'aadhar', 'aadhaar_url', 'aadhaarUrl', 'aadhaar_number', 'aadhaarNumber'],
  },
  {
    label: 'PAN',
    icon: 'card',
    keys: ['pan', 'pan_url', 'panUrl', 'pan_number', 'panNumber'],
  },
  {
    label: 'Driving licence',
    icon: 'car',
    keys: [
      'driving_licence',
      'drivingLicence',
      'driving_license',
      'drivingLicense',
      'licence',
      'license',
      'dl_url',
      'dlUrl',
    ],
  },
];

const kycId = (k) => k.id || k._id || k.kyc_id || k.kycId;

const partnerName = (k) =>
  k.partner_name ||
  k.partnerName ||
  k.name ||
  k.full_name ||
  k.user?.name ||
  k.partner?.name ||
  'Delivery partner';

const partnerEmail = (k) =>
  k.partner_email || k.partnerEmail || k.email || k.user?.email || k.partner?.email || null;

function docPresent(item, keys) {
  return keys.some(
    (key) => Boolean(item[key]) || Boolean(item.documents?.[key]) || Boolean(item.docs?.[key])
  );
}

export default function Kyc() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/kyc/pending');
      setItems(asArray(res.data, ['kyc', 'pending', 'requests']));
    } catch (err) {
      setError(errMsg(err, 'Could not load the KYC queue.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const review = async (item, action) => {
    const id = kycId(item);
    const name = partnerName(item);
    let body = {};

    if (action === 'approve') {
      const ok = window.confirm(
        `Approve KYC for ${name}? They will be able to accept delivery requests.`
      );
      if (!ok) return;
    } else {
      const reason = window.prompt(
        `Reject KYC for ${name}?\nOptionally add a reason for the partner:`
      );
      if (reason === null) return; // cancelled
      if (reason.trim()) body = { reason: reason.trim() };
    }

    setActionId(id);
    setNotice(null);
    try {
      await api.post(`/admin/kyc/${id}/${action}`, body);
      setItems((prev) => prev.filter((x) => kycId(x) !== id));
      setNotice({
        type: 'success',
        text: `KYC ${action === 'approve' ? 'approved' : 'rejected'} for ${name}.`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Action failed. Please try again.') });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>KYC Review</h1>
        <p>Approve or reject delivery partner documents</p>
      </header>

      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        For privacy, document files and ID numbers are never displayed in this console — only
        whether each document is on file.
      </div>

      {notice && (
        <div
          className={notice.type === 'success' ? 'alert alert-success' : 'alert alert-error'}
          style={{ marginBottom: 16 }}
        >
          {notice.text}
        </div>
      )}

      {loading ? (
        <Loading message="Loading pending KYC submissions…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState message="No pending KYC submissions. You're all caught up." />
      ) : (
        <div className="kyc-list">
          {items.map((item, i) => {
            const id = kycId(item) || i;
            const busy = actionId !== null && actionId === kycId(item);
            return (
              <div className="kyc-card" key={id}>
                <div className="kyc-head">
                  <h3>{partnerName(item)}</h3>
                  <p>
                    {partnerEmail(item) || 'No email on file'}
                    {' · '}Submitted{' '}
                    {formatDate(
                      item.submitted_at || item.submittedAt || item.created_at || item.createdAt
                    )}
                  </p>
                </div>

                <div className="kyc-docs">
                  {DOC_DEFS.map((d) => {
                    const present = docPresent(item, d.keys);
                    return (
                      <div className="kyc-doc" key={d.label}>
                        <span className="kyc-doc-label">
                          {d.icon} {d.label}
                        </span>
                        {present ? (
                          <span className="badge badge-green">Document on file</span>
                        ) : (
                          <span className="badge badge-grey">Not uploaded</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {item.status && (
                  <span className={statusBadge(item.status)} style={{ alignSelf: 'flex-start' }}>
                    {item.status}
                  </span>
                )}

                <div className="kyc-actions">
                  <button
                    className="btn btn-primary"
                    disabled={actionId !== null}
                    onClick={() => review(item, 'approve')}
                    type="button"
                  >
                    {busy ? 'Working…' : 'Approve'}
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={actionId !== null}
                    onClick={() => review(item, 'reject')}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
