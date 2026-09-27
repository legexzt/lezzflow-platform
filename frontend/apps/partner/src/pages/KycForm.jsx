import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '../components/Alert';
import Header from '../components/Header';
import { useAuth } from '../AuthContext';
import { submitKyc } from '../api';

const initialFields = {
  fullName: '',
  phone: '',
  aadhaar: '',
  pan: '',
  licence: '',
};

export default function KycForm() {
  const navigate = useNavigate();
  const { firebaseUser, markKycPending } = useAuth();
  const [fields, setFields] = useState(initialFields);
  const [files, setFiles] = useState({ aadhaarDoc: null, panDoc: null, licenceDoc: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (firebaseUser?.displayName) {
      setFields((f) => (f.fullName ? f : { ...f, fullName: firebaseUser.displayName }));
    }
  }, [firebaseUser]);

  function update(field) {
    return (e) => {
      let v = e.target.value;
      if (field === 'pan') v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (field === 'aadhaar' || field === 'phone') v = v.replace(/\D/g, '');
      setFields((f) => ({ ...f, [field]: v }));
    };
  }

  function onFile(key) {
    return (e) => {
      const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
      setFiles((f) => ({ ...f, [key]: file }));
    };
  }

  function validate() {
    if (fields.fullName.trim().length < 3) return 'Please enter your full name.';
    if (!/^\d{10}$/.test(fields.phone)) return 'Enter a valid 10-digit mobile number.';
    if (!/^\d{12}$/.test(fields.aadhaar)) return 'Aadhaar number must be exactly 12 digits.';
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(fields.pan)) return 'Enter a valid PAN (format: ABCDE1234F).';
    if (fields.licence.trim().length < 6) return 'Enter a valid driving licence number.';
    if (!files.aadhaarDoc) return 'Please add a photo of your Aadhaar card.';
    if (!files.panDoc) return 'Please add a photo of your PAN card.';
    if (!files.licenceDoc) return 'Please add a photo of your driving licence.';
    return '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('full_name', fields.fullName.trim());
      fd.append('phone', fields.phone);
      fd.append('aadhaar_number', fields.aadhaar);
      fd.append('pan_number', fields.pan);
      fd.append('driving_licence_number', fields.licence.trim());
      fd.append('aadhaar_doc', files.aadhaarDoc);
      fd.append('pan_doc', files.panDoc);
      fd.append('licence_doc', files.licenceDoc);
      // Privacy: never log form contents — they contain sensitive identity data.
      await submitKyc(fd);
      markKycPending();
      navigate('/kyc/status', { replace: true });
    } catch (err) {
      setError(err.friendlyMessage || 'Could not submit your KYC. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1 className="page-title">Partner KYC</h1>
        <p className="muted">
          Verify your identity to start delivering. Your details are uploaded securely and are never
          displayed publicly.
        </p>

        {error ? (
          <Alert type="error" onClose={() => setError('')}>
            {error}
          </Alert>
        ) : null}

        <form className="card form-card" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              value={fields.fullName}
              onChange={update('fullName')}
              placeholder="As on your Aadhaar card"
              autoComplete="name"
              required
            />
          </label>

          <label className="field">
            <span>Phone number</span>
            <input
              type="tel"
              inputMode="numeric"
              value={fields.phone}
              onChange={update('phone')}
              placeholder="10-digit mobile number"
              maxLength={10}
              autoComplete="tel"
              required
            />
          </label>

          <label className="field">
            <span>Aadhaar number</span>
            <input
              type="password"
              inputMode="numeric"
              value={fields.aadhaar}
              onChange={update('aadhaar')}
              placeholder="12-digit Aadhaar number"
              maxLength={12}
              autoComplete="off"
              required
            />
          </label>

          <label className="field">
            <span>PAN number</span>
            <input
              type="text"
              value={fields.pan}
              onChange={update('pan')}
              placeholder="ABCDE1234F"
              maxLength={10}
              autoComplete="off"
              required
            />
          </label>

          <label className="field">
            <span>Driving licence number</span>
            <input
              type="text"
              value={fields.licence}
              onChange={update('licence')}
              placeholder="Driving licence number"
              autoComplete="off"
              required
            />
          </label>

          <div className="field">
            <span>Aadhaar card photo</span>
            <input type="file" accept="image/*" capture="environment" onChange={onFile('aadhaarDoc')} />
            {files.aadhaarDoc ? <span className="file-name">{files.aadhaarDoc.name}</span> : null}
          </div>

          <div className="field">
            <span>PAN card photo</span>
            <input type="file" accept="image/*" capture="environment" onChange={onFile('panDoc')} />
            {files.panDoc ? <span className="file-name">{files.panDoc.name}</span> : null}
          </div>

          <div className="field">
            <span>Driving licence photo</span>
            <input type="file" accept="image/*" capture="environment" onChange={onFile('licenceDoc')} />
            {files.licenceDoc ? <span className="file-name">{files.licenceDoc.name}</span> : null}
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit KYC'}
          </button>
          <p className="tiny muted">
            Documents are stored securely and reviewed only by the LezzFlow admin team.
          </p>
        </form>
      </main>
    </div>
  );
}
