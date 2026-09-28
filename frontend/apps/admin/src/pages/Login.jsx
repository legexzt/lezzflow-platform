import { useState } from 'react';
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
  const { login, loginError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');

  async function handleEmailLogin(e) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setEmailError(emailAuthMessage(err?.code, err?.message));
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/lezzflow-icon.png" alt="LezzFlow" className="auth-icon" />
        <h1>LezzFlow Admin</h1>
        <p className="auth-sub">Sign in with your administrator Google account to continue.</p>
        {loginError && <div className="alert alert-error">{loginError}</div>}
        <div className="auth-actions">
          <button className="btn btn-primary btn-block" onClick={login} type="button">
            Sign in with Google
          </button>
        </div>
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
          {emailError && <div className="alert alert-error">{emailError}</div>}
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
