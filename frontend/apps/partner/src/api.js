import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
});

// AuthContext registers an async getter that returns a fresh Firebase ID
// token, so requests always carry a valid Bearer token.
let tokenGetter = null;

export function setTokenGetter(getter) {
  tokenGetter = getter;
}

api.interceptors.request.use(async (config) => {
  if (tokenGetter) {
    try {
      const token = await tokenGetter();
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Proceed without a token; the server will reject if auth is required.
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    error.friendlyMessage =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Request failed';
    return Promise.reject(error);
  }
);

// ---- Auth ----

export async function verifyAuth(idToken) {
  const { data } = await api.post('/auth/verify', { idToken, role: 'partner' });
  return data;
}

// ---- KYC ----

export async function submitKyc(formData) {
  // Axios sets the multipart boundary automatically for FormData.
  const { data } = await api.post('/kyc', formData);
  return data;
}

export async function fetchKycStatus() {
  const { data } = await api.get('/kyc');
  return data;
}

// ---- Deliveries ----

export async function fetchDeliveryRequests() {
  const { data } = await api.get('/delivery/requests');
  return data;
}

export async function acceptDelivery(id) {
  const { data } = await api.patch(`/delivery/requests/${id}`, { status: 'accepted' });
  return data;
}

export async function updateDeliveryStatus(id, status, otp) {
  const payload = { status };
  if (otp !== undefined && otp !== null && otp !== '') {
    payload.otp = String(otp).trim();
  }
  const { data } = await api.patch(`/delivery/requests/${id}`, payload);
  return data;
}

// ---- Partner Profile ----

export async function fetchMyProfile() {
  const { data } = await api.get('/partner/me');
  return data;
}

export async function updateMyProfile(updates) {
  const { data } = await api.patch('/partner/me', updates);
  return data;
}

export default api;
