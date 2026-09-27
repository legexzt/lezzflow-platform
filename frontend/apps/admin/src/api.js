import axios from 'axios';
import { auth } from './firebase.js';

const baseURL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

const api = axios.create({
  baseURL: `${baseURL}/api`,
  timeout: 20000,
});

// Attach a fresh Firebase ID token to every request. The Firebase SDK
// refreshes expired tokens automatically, so long-lived sessions keep working.
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch {
      // Proceed without a token; the backend will reject the request.
    }
  }
  return config;
});

export default api;
