import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Alert from '../components/Alert';
import { useAuth } from '../AuthContext';

export default function Login() {
  const { firebaseUser, loading, error, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [logoOk, setLogoOk] = useState(true);

  if (!loading && firebaseUser) {
    return <Navigate to="/" replace />;
  }

  async function handleSignIn() {
    setBusy(true);
    setLocalError('');
    try {
      await signInWithGoogle();
    } catch (e) {
      if (e?.code === 'auth/popup-closed-by-user') {
        setLocalError('Sign-in was cancelled.');
      } else if (e?.code === 'auth/invalid-api-key' || e?.code === 'auth/api-key-not-valid') {
        setLocalError('Firebase is not configured yet. Add the web config to your .env file.');
      } else {
        setLocalError(e?.message || 'Could not sign you in. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="card auth-card">
        {logoOk ? (
          <img
            src="/lezzflow-horizontal-dark.png"
            alt="LezzFlow"
            className="auth-logo"
            onError={() => setLogoOk(false)}
          />
        ) : (
          <span className="brand-word brand-word-lg">LezzFlow</span>
        )}
        <h1 className="auth-title">Partner App</h1>
        <p className="muted">Deliver orders from local kirana stores and earn on every trip.</p>
        {localError || error ? <Alert type="error">{localError || error}</Alert> : null}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={handleSignIn}
          disabled={busy || loading}
        >
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        <p className="tiny muted">Sign in with the Google account you want to deliver with.</p>
      </div>
    </div>
  );
}
