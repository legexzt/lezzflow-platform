// Normalizes the various shapes the backend may use for KYC status into
// one of: 'none' | 'pending' | 'approved' | 'rejected'.
export function getKycStatus(user) {
  if (!user || typeof user !== 'object') return 'none';
  const raw =
    user.kyc_status ??
    user.kycStatus ??
    user.partner_kyc_status ??
    user.partnerKycStatus ??
    user.partner_kyc?.status ??
    user.kyc?.status ??
    null;
  if (!raw) return 'none';
  const s = String(raw).toLowerCase();
  if (s === 'pending' || s === 'approved' || s === 'rejected') return s;
  if (s === 'submitted' || s === 'under_review' || s === 'in_review') return 'pending';
  if (s === 'verified' || s === 'accepted') return 'approved';
  if (s === 'declined' || s === 'failed') return 'rejected';
  return 'none';
}

// Extracts a status from a GET /api/kyc/status response. Returns '' when
// the response carries no recognizable status.
export function statusFromResponse(data) {
  if (!data || typeof data !== 'object') return '';
  const s = getKycStatus({ kyc_status: data.status ?? data.kyc_status ?? data.kycStatus });
  return s === 'none' ? '' : s;
}
