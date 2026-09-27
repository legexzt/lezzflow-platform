import { useAuth } from '../AuthContext.jsx';

export default function AccessDenied() {
  const { firebaseUser, role, verifyError, retryVerify, logout } = useAuth();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/lezzflow-icon.png" alt="LezzFlow" className="auth-icon" />
        {verifyError ? (
          <>
            <h1>Connection problem</h1>
            <p className="auth-sub">We couldn’t verify your admin session with the server.</p>
            <div className="alert alert-error">{verifyError}</div>
            <div className="auth-actions">
              <button className="btn btn-primary btn-block" onClick={retryVerify} type="button">
                Try again
              </button>
              <button className="btn btn-outline btn-block" onClick={logout} type="button">
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Access denied</h1>
            <p className="auth-sub">
              <strong>{firebaseUser?.email}</strong> is signed in
              {role ? (
                <>
                  {' '}
                  as <strong>{role}</strong>
                </>
              ) : (
                ''
              )}
              , but this console is restricted to LezzFlow administrators.
            </p>
            <div className="auth-actions">
              <button className="btn btn-primary btn-block" onClick={logout} type="button">
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
