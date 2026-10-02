import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { signInWithGoogle } from '../firebase.js'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'
import Loading from '../components/Loading.jsx'

// TEMPORARY demo access for the owner — remove before public launch.
const DEMO_EMAIL = 'seller.demo@legezt.in'
const DEMO_PASSWORD = 'LezzTemp#2026'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

function emailAuthMessage(code, message) {
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password'
  ) {
    return 'Invalid email or password.'
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.'
  }
  return message || 'Sign-in failed. Please try again.'
}

export default function Login() {
  const { firebaseUser, loading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [logoOk, setLogoOk] = useState(true)
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)

  if (loading) return <Loading full />
  if (firebaseUser) return <Navigate to="/" replace />

  async function handleLogin() {
    setBusy(true)
    try {
      await signInWithGoogle()
      navigate('/', { replace: true })
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        toast(err?.message || 'Google sign-in failed', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleEmailLogin(e) {
    e.preventDefault()
    setEmailBusy(true)
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth')
      const { auth } = await import('../firebase.js')
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/', { replace: true })
    } catch (err) {
      toast(emailAuthMessage(err?.code, err?.message), 'error')
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleDemoLogin() {
    setEmailBusy(true)
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth')
      const { auth } = await import('../firebase.js')
      await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD)
      navigate('/', { replace: true })
    } catch (err) {
      toast(emailAuthMessage(err?.code, err?.message), 'error')
    } finally {
      setEmailBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        {logoOk ? (
          <img
            src="/logo-dark.png"
            alt="LezzFlow"
            className="login-logo"
            onError={() => setLogoOk(false)}
          />
        ) : (
          <div className="login-word">LezzFlow</div>
        )}
        <span className="brand-badge">Seller App</span>
        <p className="muted login-sub">
          Sell to customers near you. Manage your shop, products and orders — all in one place.
        </p>
        <button type="button" className="google-btn" onClick={handleLogin} disabled={busy}>
          <GoogleIcon />
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        <div className="login-divider">
          <span>Sign in with email</span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={handleDemoLogin}
          disabled={emailBusy}
        >
          {emailBusy ? 'Signing in…' : '⚡ Demo Login (temporary)'}
        </button>
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
          <button type="submit" className="btn btn-secondary btn-block" disabled={emailBusy}>
            {emailBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
