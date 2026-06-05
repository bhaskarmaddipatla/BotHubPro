import axios from 'axios'
import Cookies from 'js-cookie'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = Cookies.get('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = Cookies.get('refresh_token')
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refresh_token: refreshToken })
          Cookies.set('access_token', res.data.access_token, { expires: 1 })
          error.config.headers.Authorization = `Bearer ${res.data.access_token}`
          return api.request(error.config)
        } catch {
          Cookies.remove('access_token')
          Cookies.remove('refresh_token')
          window.location.href = '/auth/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  register: (data: { email: string; first_name: string; last_name: string; password: string }) =>
    api.post('/api/v1/auth/register', data),
  login: (data: { email: string; password: string; mfa_code?: string }) =>
    api.post('/api/v1/auth/login', data),
  logout: () => api.post('/api/v1/auth/logout'),
  setupMFA: () => api.post('/api/v1/auth/mfa/setup'),
  verifyMFA: (code: string) => api.post('/api/v1/auth/mfa/verify', { code }),
}

export const userApi = {
  getMe: () => api.get('/api/v1/users/me'),
  updateMe: (data: { first_name?: string; last_name?: string }) => api.patch('/api/v1/users/me', data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/api/v1/users/me/change-password', data),
}

export const botsApi = {
  list: () => api.get('/api/v1/bots/'),
  create: (data: object) => api.post('/api/v1/bots/', data),
  get: (id: string) => api.get(`/api/v1/bots/${id}`),
  update: (id: string, data: object) => api.patch(`/api/v1/bots/${id}`, data),
  delete: (id: string) => api.delete(`/api/v1/bots/${id}`),
}

export const executionsApi = {
  list: (limit = 50, offset = 0) => api.get(`/api/v1/executions/?limit=${limit}&offset=${offset}`),
  create: (data: { bot_id: string; trigger?: string }) => api.post('/api/v1/executions/', data),
  get: (id: string) => api.get(`/api/v1/executions/${id}`),
  getLogs: (id: string) => api.get(`/api/v1/executions/${id}/logs`),
}

export const analyticsApi = {
  getSummary: () => api.get('/api/v1/analytics/summary'),
  getEquityCurve: (days = 30) => api.get(`/api/v1/analytics/equity-curve?days=${days}`),
  getPerformance: () => api.get('/api/v1/analytics/performance'),
}

export const subscriptionsApi = {
  getPlans: () => api.get('/api/v1/subscriptions/plans'),
  getCurrent: () => api.get('/api/v1/subscriptions/current'),
  startTrial: () => api.post('/api/v1/subscriptions/trial'),
}

export const notificationsApi = {
  list: (unreadOnly = false) => api.get(`/api/v1/notifications/?unread_only=${unreadOnly}`),
  markRead: (id: string) => api.post(`/api/v1/notifications/${id}/read`),
  markAllRead: () => api.post('/api/v1/notifications/read-all'),
}

export const marketplaceApi = {
  listBots: () => api.get('/api/v1/marketplace/bots'),
  getBot: (id: string) => api.get(`/api/v1/marketplace/bots/${id}`),
}

export const backtestsApi = {
  run: (data: object) => api.post('/api/v1/backtests/run', data),
}
