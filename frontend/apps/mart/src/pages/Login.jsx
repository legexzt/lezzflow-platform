import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { useAuth } from '../AuthContext.jsx';

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
  return message || 'Sign-in failed. Please try again.';
}

function GoogleG() {
  return (
    <svg className="g-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.35.61 4.6 1.8l3.42-3.42A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="#16a34a" />
      <path d="M5 8.2 7.2 10.4 11 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Login() {
  const { user, loading, error, login } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const handleLogin = async () => {
    setSigningIn(true);
    setLocalError('');
    try {
      await login();
    } catch (e) {
      setLocalError(
        e.code === 'auth/popup-closed-by-user'
          ? 'Sign-in popup was closed before completing.'
          : e.message || 'Sign-in failed. Please try again.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailLogin = async (e) => {
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
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img
          src="/lezzflow-icon.png"
          alt="LezzFlow"
          className="login-icon"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <h1 className="login-title">
          LezzFlow <span>Mart</span>
        </h1>
        <p className="login-sub">
          Groceries from kirana shops near you — delivered fast, or ready for pickup.
        </p>
        <ul className="login-points">
          <li>
            <Check /> Live shelf stock — no out-of-stock surprises
          </li>
          <li>
            <Check /> Shops within minutes of your home
          </li>
        </ul>
        {(localError || error) && (
          <div className="banner banner-error">{localError || error}</div>
        )}
        <button
          type="button"
          className="btn btn-google btn-block btn-lg"
          onClick={handleLogin}
          disabled={signingIn || loading}
        >
          <GoogleG />
          {signingIn ? 'Signing in…' : 'Continue with Google'}
        </button>
        <div className="login-divider">
          <span>or sign in with email</span>
        </div>
        <form className="email-auth-form" onSubmit={handleEmailLogin} noValidate>
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
            className="btn btn-primary btn-block"
            disabled={emailBusy}
          >
            {emailBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
