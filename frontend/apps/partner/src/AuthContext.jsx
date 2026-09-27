import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onIdTokenChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { setTokenGetter, verifyAuth } from './api';
import { getKycStatus } from './utils/kyc';

const AuthContext = createContext(null);

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.user) return raw;
  if (raw.data && raw.data.user) return raw.data;
  return raw;
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Lets the UI reflect "pending" immediately after a KYC submit, even if the
  // verify response doesn't echo a KYC status field.
  const [kycOverride, setKycOverride] = useState(null);

  useEffect(() => {
    setTokenGetter(async () => {
      const current = auth.currentUser;
      if (!current) return null;
      try {
        return await current.getIdToken();
      } catch {
        return null;
      }
    });

    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setKycOverride(null);
        setLoading(false);
        return;
      }
      try {
        const idToken = await user.getIdToken();
        const data = await verifyAuth(idToken);
        setProfile(normalizeProfile(data));
        setError('');
      } catch (e) {
        setProfile(null);
        setError(e?.friendlyMessage || 'Could not verify your account with the server.');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const refreshProfile = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return null;
    const idToken = await current.getIdToken();
    const data = await verifyAuth(idToken);
    const normalized = normalizeProfile(data);
    setProfile(normalized);
    return normalized;
  }, []);

  const markKycPending = useCallback(() => setKycOverride('pending'), []);

  const user = profile?.user || null;
  const role = profile?.role || user?.role || null;
  const profileKycStatus = getKycStatus(user);
  const kycStatus = profileKycStatus !== 'none' ? profileKycStatus : kycOverride || 'none';

  const value = useMemo(
    () => ({
      firebaseUser,
      user,
      role,
      profile,
      loading,
      error,
      kycStatus,
      markKycPending,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [firebaseUser, user, role, profile, loading, error, kycStatus, markKycPending, signInWithGoogle, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
