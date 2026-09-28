import { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { asArray, errMsg, formatDate, statusBadge, REJECT_REASON_LABELS } from '../utils.js';

// Privacy rule: document URLs and full Aadhaar / PAN / licence numbers are
// NEVER rendered in this console. We only detect that a value exists and
// display a "Document on file" label.
const DOC_DEFS = [
  {
    label: 'Aadhaar',
    icon: 'idcard',
    urlKey: 'aadhaar_url',
    keys: ['aadhaar', 'aadhar', 'aadhaar_url', 'aadhaarUrl', 'aadhaar_number', 'aadhaarNumber'],
  },
  {
    label: 'PAN',
    icon: 'card',
    urlKey: 'pan_url',
    keys: ['pan', 'pan_url', 'panUrl', 'pan_number', 'panNumber'],
  },
  {
    label: 'Driving licence',
    icon: 'car',
    urlKey: 'license_url',
    keys: [
      'driving_licence',
      'drivingLicence',
      'driving_license',
      'drivingLicense',
      'licence',
      'license',
      'dl_url',
      'dlUrl',
      'license_url',
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

function getDocUrl(item, def) {
  if (item[def.urlKey]) return item[def.urlKey];
  for (const k of def.keys) {
    const v = item[k] || item.documents?.[k] || item.docs?.[k];
    if (
      typeof v === 'string' &&
      (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/'))
    ) {
      return v;
    }
  }
  return null;
}

export default function Kyc() {
  const { isOpsViewer } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [notice, setNotice] = useState(null);

  // Reason modal state (reject or reupload)
  const [modalItem, setModalItem] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'reject' | 'reupload'
  const [selectedReason, setSelectedReason] = useState('blurry_doc');
  const [note, setNote] = useState('');
  const [submittingModal, setSubmittingModal] = useState(false);

  // Zoomable document viewer state
  const [viewingDoc, setViewingDoc] = useState(null); // { url, label }
  const [zoom, setZoom] = useState(1);

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

  const openReasonModal = (item, mode) => {
    setModalItem(item);
    setModalMode(mode);
    setSelectedReason('blurry_doc');
    setNote('');
  };

  const closeReasonModal = () => {
    setModalItem(null);
    setModalMode(null);
    setNote('');
  };

  const submitReasonModal = async () => {
    if (!modalItem || !modalMode) return;
    const id = kycId(modalItem);
    const name = partnerName(modalItem);
    const endpoint =
      modalMode === 'reject'
        ? `/admin/kyc/${id}/reject`
        : `/admin/kyc/${id}/request-reupload`;

    setSubmittingModal(true);
    setNotice(null);
    try {
      await api.post(endpoint, {
        reason_code: selectedReason,
        note: note ? note.trim() : null,
      });
      setItems((prev) => prev.filter((x) => kycId(x) !== id));
      if (modalMode === 'reject') {
        setNotice({
          type: 'success',
          text: `KYC rejected for ${name}.`,
        });
      } else {
        setNotice({
          type: 'success',
          text: 'Re-upload requested — the partner has been notified to submit clearer documents.',
        });
      }
      closeReasonModal();
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Action failed. Please try again.') });
    } finally {
      setSubmittingModal(false);
    }
  };

  const approve = async (item) => {
    const id = kycId(item);
    const name = partnerName(item);

    const ok = window.confirm(
      `Approve KYC for ${name}? They will be able to accept delivery requests.`
    );
    if (!ok) return;

    setActionId(id);
    setNotice(null);
    try {
      await api.post(`/admin/kyc/${id}/approve`);
      setItems((prev) => prev.filter((x) => kycId(x) !== id));
      setNotice({
        type: 'success',
        text: `KYC approved for ${name}.`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err, 'Action failed. Please try again.') });
    } finally {
      setActionId(null);
    }
  };

  const openDocViewer = (url, label) => {
    setViewingDoc({ url, label });
    setZoom(1);
  };

  const closeDocViewer = () => {
    setViewingDoc(null);
    setZoom(1);
  };

  const zoomIn = () => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))));
  const resetZoom = () => setZoom(1);

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
                    const docUrl = present ? getDocUrl(item, d) : null;
                    return (
                      <div className="kyc-doc" key={d.label}>
                        <span className="kyc-doc-label">
                          <Icon name={d.icon} size={16} /> {d.label}
                        </span>
                        {present && docUrl ? (
                          <button
                            type="button"
                            className="badge badge-green btn-doc-view"
                            onClick={() => openDocViewer(docUrl, d.label)}
                          >
                            Document on file
                          </button>
                        ) : present ? (
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
                  {isOpsViewer ? (
                    <span className="badge badge-amber" style={{ padding: '6px 12px' }}>
                      Read-only access — review actions are disabled.
                    </span>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary"
                        disabled={busy || submittingModal}
                        onClick={() => approve(item)}
                        type="button"
                      >
                        {busy ? 'Working…' : 'Approve'}
                      </button>
                      <button
                        className="btn btn-outline"
                        disabled={busy || submittingModal}
                        onClick={() => openReasonModal(item, 'reupload')}
                        type="button"
                      >
                        Request re-upload
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={busy || submittingModal}
                        onClick={() => openReasonModal(item, 'reject')}
                        type="button"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject / Request Re-upload Modal */}
      {modalItem && modalMode && (
        <div className="modal-backdrop" onClick={closeReasonModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {modalMode === 'reject'
                  ? `Reject KYC — ${partnerName(modalItem)}`
                  : `Request Re-upload — ${partnerName(modalItem)}`}
              </h2>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--muted)' }}>
                Select a reason for the partner:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {Object.entries(REJECT_REASON_LABELS).map(([code, label]) => (
                  <label key={code} className="reason-option">
                    <input
                      type="radio"
                      name="reason_code"
                      value={code}
                      checked={selectedReason === code}
                      onChange={(e) => setSelectedReason(e.target.value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
                Optional note
              </label>
              <textarea
                className="filter-input"
                style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                placeholder="Additional instructions or notes for the partner…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={closeReasonModal}
                disabled={submittingModal}
              >
                Cancel
              </button>
              {modalMode === 'reject' ? (
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={submitReasonModal}
                  disabled={submittingModal}
                >
                  {submittingModal ? 'Rejecting…' : 'Confirm reject'}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={submitReasonModal}
                  disabled={submittingModal}
                >
                  {submittingModal ? 'Submitting…' : 'Confirm request re-upload'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Zoomable Document Viewer Modal */}
      {viewingDoc && (
        <div className="modal-backdrop" onClick={closeDocViewer}>
          <div
            className="modal"
            style={{ maxWidth: 720, width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <h2>{viewingDoc.label} Document</h2>
              <button className="btn btn-outline btn-sm" onClick={closeDocViewer} type="button">
                <Icon name="close" size={16} /> Close
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <button
                className="btn btn-outline btn-sm"
                onClick={zoomOut}
                disabled={zoom <= 0.5}
                type="button"
              >
                Zoom -
              </button>
              <button className="btn btn-outline btn-sm" onClick={resetZoom} type="button">
                <Icon name="scan" size={16} /> Reset ({Math.round(zoom * 100)}%)
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={zoomIn}
                disabled={zoom >= 4}
                type="button"
              >
                Zoom +
              </button>
            </div>
            <div
              className="doc-viewer"
              style={{
                overflow: 'auto',
                maxHeight: 520,
                textAlign: 'center',
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 16,
              }}
            >
              {viewingDoc.url.toLowerCase().endsWith('.pdf') ||
              viewingDoc.url.includes('.pdf?') ? (
                <iframe
                  src={viewingDoc.url}
                  title="Document Preview"
                  style={{ width: '100%', height: 480, border: 'none' }}
                />
              ) : (
                <img
                  src={viewingDoc.url}
                  alt="Document preview"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease',
                    maxWidth: '100%',
                    height: 'auto',
                    display: 'inline-block',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
