import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { fetchKycStatus } from '../api';
import { useAuth } from '../AuthContext';
import { statusFromResponse } from '../utils/kyc';
import { docOnFileLabel, maskAadhaar, maskLicence, maskPan } from '../utils/mask';

const STATUS_COPY = {
  none: {
    title: 'No KYC submitted',
    body: 'You have not submitted your KYC documents yet. Complete KYC to start delivering.',
    badge: 'badge',
    label: 'Not submitted',
  },
  pending: {
    title: 'KYC under review',
    body: 'Your documents have been submitted and are being reviewed by our team. This usually takes 24–48 hours.',
    badge: 'badge badge-amber',
    label: 'Pending review',
  },
  approved: {
    title: "You're approved!",
    body: 'Your KYC has been approved. You can now accept delivery requests from nearby shops.',
    badge: 'badge badge-green',
    label: 'Approved',
  },
  rejected: {
    title: 'KYC rejected',
    body: 'Unfortunately your KYC was rejected. Please check your details and documents, then submit again.',
    badge: 'badge badge-red',
    label: 'Rejected',
  },
};

export default function KycStatus() {
  const { user, kycStatus, refreshProfile } = useAuth();
  const [serverStatus, setServerStatus] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchKycStatus();
      const s = statusFromResponse(data);
      if (s) setServerStatus(s);
    } catch {
      // Status endpoint unavailable — fall back to profile data.
    }
    try {
      await refreshProfile();
    } catch {
      // Keep the last known status.
    }
    setRefreshing(false);
  }, [refreshProfile]);

  useEffect(() => {
    load();
  }, [load]);

  const status = serverStatus || kycStatus;
  const copy = STATUS_COPY[status] || STATUS_COPY.pending;
  const rejectionReason =
    user?.kyc_rejection_reason || user?.partner_kyc?.rejection_reason || user?.rejection_reason || '';
  const hasDoc =
    user?.aadhaar_doc_url || user?.pan_doc_url || user?.licence_doc_url || user?.partner_kyc;

  return (
    <div className="page">
      <Header />
      <main className="container">
        <div className="card status-card">
          <span className={copy.badge}>{copy.label}</span>
          <h1 className="page-title">{copy.title}</h1>
          <p className="muted">{copy.body}</p>

          {status === 'rejected' && rejectionReason ? (
            <p className="rejection-reason">Reason: {rejectionReason}</p>
          ) : null}

          {user ? (
            <dl className="masked-details">
              {user.full_name || user.name ? (
                <div>
                  <dt>Name</dt>
                  <dd>{user.full_name || user.name}</dd>
                </div>
              ) : null}
              {user.phone ? (
                <div>
                  <dt>Phone</dt>
                  <dd>{maskPan(user.phone)}</dd>
                </div>
              ) : null}
              {user.aadhaar_number ? (
                <div>
                  <dt>Aadhaar</dt>
                  <dd>{maskAadhaar(user.aadhaar_number)}</dd>
                </div>
              ) : null}
              {user.pan_number ? (
                <div>
                  <dt>PAN</dt>
                  <dd>{maskPan(user.pan_number)}</dd>
                </div>
              ) : null}
              {user.driving_licence_number ? (
                <div>
                  <dt>Licence</dt>
                  <dd>{maskLicence(user.driving_licence_number)}</dd>
                </div>
              ) : null}
              {hasDoc ? (
                <div>
                  <dt>Documents</dt>
                  <dd>{docOnFileLabel(hasDoc)}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="stack">
            {status === 'approved' ? (
              <Link className="btn btn-primary" to="/">
                Go to dashboard
              </Link>
            ) : null}
            {status === 'rejected' || status === 'none' ? (
              <Link className="btn btn-primary" to="/kyc">
                {status === 'rejected' ? 'Resubmit KYC' : 'Complete KYC'}
              </Link>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={load} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh status'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
