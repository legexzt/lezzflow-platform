import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { user, loading, error, login } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState('');

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

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/lezzflow-icon.png" alt="LezzFlow" className="login-icon" />
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
      </div>
    </div>
  );
}
