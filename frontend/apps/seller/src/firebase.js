import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

// Firebase web config is public client config (safe to ship in frontend).
// Defaults cover the known lezzflow-63a5a values; secrets-free.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBGZhz-CuwTiAdvi9ni8ev8VE67vjOKWBk',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'lezzflow-63a5a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lezzflow-63a5a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'lezzflow-63a5a.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1051441645746',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1051441645746:web:be49dede6a24c4fe4921ab',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

export function signOutUser() {
  return signOut(auth)
}
