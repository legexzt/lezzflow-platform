import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const { login, loginError } = useAuth();

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
      </div>
    </div>
  );
}
