// Privacy helpers. Full Aadhaar / PAN / driving licence numbers and document
// URLs must NEVER be displayed or logged anywhere in this app — always pass
// them through one of these helpers first.

export function mask(value, visible = 4) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (!s) return '';
  if (s.length <= visible) return '•'.repeat(Math.max(s.length, 4));
  return `${'•'.repeat(s.length - visible)}${s.slice(-visible)}`;
}

export function maskAadhaar(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) return '•••• •••• ••••';
  return `•••• •••• ${digits.slice(-4)}`;
}

export function maskPan(value) {
  return mask(value, 4);
}

export function maskLicence(value) {
  return mask(value, 4);
}

// Document URLs are never rendered as links/images — only this label.
export function docOnFileLabel(url) {
  return url ? 'Document on file' : '';
}
