import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// LezzFlow Firebase web config (public values, safe for frontend).
// Full config lives at:
//   /home/hatch/workspace/goals/lezzflow-working-platform-beta/hidden_files/firebase.json
// Every value can be overridden with VITE_FIREBASE_* env vars (see .env.example).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'lezzflow-63a5a.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'lezzflow-63a5a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'lezzflow-63a5a.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
