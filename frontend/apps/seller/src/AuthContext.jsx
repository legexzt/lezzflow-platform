import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { onIdTokenChanged } from 'firebase/auth'
import { auth } from './firebase.js'
import api, { setTokenGetter, getErrorMessage } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [verifyError, setVerifyError] = useState(null)

  const verify = useCallback(async (fbUser) => {
    setVerifyError(null)
    try {
      const idToken = await fbUser.getIdToken()
      const res = await api.post('/auth/verify', { idToken, role: 'seller' })
      const data = res.data || {}
      setUser(data.user || null)
      setRole(data.role || data.user?.role || null)
    } catch (err) {
      setUser(null)
      setRole(null)
      setVerifyError(getErrorMessage(err, 'Could not verify your account'))
    }
  }, [])

  useEffect(() => {
    // Attach a fresh Firebase ID token to every API request.
    setTokenGetter(() => {
      const u = auth.currentUser
      return u ? u.getIdToken() : null
    })

    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser)
      if (fbUser) {
        await verify(fbUser)
      } else {
        setUser(null)
        setRole(null)
        setVerifyError(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [verify])

  const retryVerify = useCallback(() => {
    if (auth.currentUser) {
      return verify(auth.currentUser)
    }
  }, [verify])

  return (
    <AuthContext.Provider value={{ firebaseUser, user, role, loading, verifyError, retryVerify }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
