import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import Alert from '../components/Alert';
import { useAuth } from '../AuthContext';

function emailAuthMessage(code, message) {
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password'
  ) {
    return 'Invalid email or password.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  return message || 'Could not sign you in. Please try again.';
}

export default function Login() {
  const { firebaseUser, loading, error, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [logoOk, setLogoOk] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

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

  async function handleEmailSignIn(e) {
    e.preventDefault();
    setEmailBusy(true);
    setLocalError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setLocalError(emailAuthMessage(err?.code, err?.message));
    } finally {
      setEmailBusy(false);
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
        <div className="login-divider">
          <span>Sign in with email</span>
        </div>
        <form className="email-auth-form" onSubmit={handleEmailSignIn} noValidate>
          <input
            type="email"
            className="input"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            className="input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="btn btn-secondary btn-block"
            disabled={emailBusy}
          >
            {emailBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
