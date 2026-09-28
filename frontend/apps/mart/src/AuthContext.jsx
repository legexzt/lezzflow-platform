import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import api, { setAuthToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setError('');
      try {
        if (firebaseUser) {
          const idToken = await firebaseUser.getIdToken();
          setAuthToken(idToken);
          const res = await api.post('/api/auth/verify', { idToken, role: 'customer' });
          const data = res.data || {};
          setUser(data.user || { name: firebaseUser.displayName, email: firebaseUser.email });
          setRole(data.role || data.user?.role || null);
        } else {
          setAuthToken(null);
          setUser(null);
          setRole(null);
        }
      } catch (e) {
        // Backend verification failed — keep the error visible so the user sees
        // it instead of failing silently. Do NOT sign out here: signOut would
        // re-trigger onAuthStateChanged(null), which clears the error via
        // setError(''). The user stays on the login screen and can retry; the
        // normal logout() flow still signs out as before.
        setError(e.response?.data?.error || e.message || 'Authentication failed.');
        setAuthToken(null);
        setUser(null);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = () => signInWithPopup(auth, googleProvider);

  const logout = async () => {
    try {
      await signOut(auth);
    } finally {
      setAuthToken(null);
      setUser(null);
      setRole(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
