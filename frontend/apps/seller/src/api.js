import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
})

// AuthContext registers an async getter that returns a fresh Firebase ID token.
let getIdToken = null

export function setTokenGetter(fn) {
  getIdToken = fn
}

api.interceptors.request.use(async (config) => {
  if (getIdToken) {
    try {
      const token = await getIdToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch (_) {
      // proceed without token; backend will return 401
    }
  }
  return config
})

export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    (err?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Is the backend running?' : null) ||
    err?.message ||
    fallback
  )
}

export default api
