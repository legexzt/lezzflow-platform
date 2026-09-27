import { Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import { signOutUser } from '../firebase.js'
import Loading from './Loading.jsx'

export default function ProtectedRoute({ children }) {
  const { firebaseUser, role, loading, verifyError, retryVerify } = useAuth()

  if (loading) return <Loading full />

  if (!firebaseUser) return <Navigate to="/login" replace />

  if (verifyError) {
    return (
      <div className="center-page">
        <div className="card center-card">
          <h2>Connection problem</h2>
          <p className="muted">{verifyError}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={retryVerify}>
            Try again
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={() => signOutUser()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (role && role !== 'seller') {
    return (
      <div className="center-page">
        <div className="card center-card">
          <h2>Seller access only</h2>
          <p className="muted">
            This account is registered as “{role}”. Please sign in with a seller account.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => signOutUser()}>
            Switch account
          </button>
        </div>
      </div>
    )
  }

  return children
}
