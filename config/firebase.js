const admin = require('firebase-admin');
require('dotenv').config({ quiet: true });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  // Replace escaped newlines if passed through environment variables
  privateKey = privateKey.replace(/\\n/g, '\n');
}

// Initialize Firebase Admin only if credentials are provided and not already initialized
if (admin.apps && !admin.apps.length) {
  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (err) {
      console.warn('Failed to initialize Firebase Admin SDK with provided credentials:', err.message);
    }
  } else if (process.env.NODE_ENV !== 'test') {
    // Credentials not yet available: keep uninitialized
    // Never hardcode secrets. Credentials will be supplied via environment variables.
    console.warn('Firebase credentials not set in environment (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).');
  }
}

// Provide a safe fallback for admin.auth() when uninitialized
const defaultAuthStub = {
  verifyIdToken: async () => {
    throw new Error('Firebase credentials not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in environment variables.');
  },
};

const authProtoGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(admin), 'auth')?.get;

const safeAuth = (app) => {
  if (admin.apps && admin.apps.length > 0 && authProtoGetter) {
    return authProtoGetter.call(admin)(app);
  }
  return defaultAuthStub;
};

Object.defineProperty(admin, 'auth', {
  value: safeAuth,
  writable: true,
  configurable: true,
});

module.exports = admin;
