import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase.js';
import api from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [backendUser, setBackendUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifyError, setVerifyError] = useState(null);
  const [loginError, setLoginError] = useState(null);

  const verify = useCallback(async (user) => {
    setVerifyError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await api.post('/auth/verify', { idToken, role: 'admin' });
      const data = res.data || {};
      const resolvedRole = data.role || (data.user && data.user.role) || null;
      setRole(resolvedRole);
      setBackendUser(data.user || null);
    } catch (err) {
      setRole(null);
      setBackendUser(null);
      setVerifyError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Failed to verify your session.'
      );
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setFirebaseUser(user);
      if (user) {
        await verify(user);
      } else {
        setRole(null);
        setBackendUser(null);
        setVerifyError(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [verify]);

  const login = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setLoginError(err?.message || 'Google sign-in failed. Please try again.');
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const retryVerify = () => {
    if (auth.currentUser) {
      verify(auth.currentUser);
    }
  };

  const value = {
    firebaseUser,
    backendUser,
    role,
    loading,
    verifyError,
    loginError,
    login,
    logout,
    retryVerify,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
