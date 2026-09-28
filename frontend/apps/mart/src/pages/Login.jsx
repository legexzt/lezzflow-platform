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
        <h1>LezzFlow Mart</h1>
        <p className="muted">
          Order groceries from kirana shops near you — delivered or ready for pickup.
        </p>
        {(localError || error) && (
          <div className="banner banner-error">{localError || error}</div>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block btn-lg"
          onClick={handleLogin}
          disabled={signingIn || loading}
        >
          {signingIn ? 'Signing in…' : 'Sign in with Google'}
        </button>
        <div className="login-divider">
          <span>Sign in with email</span>
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
