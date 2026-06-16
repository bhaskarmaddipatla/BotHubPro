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

// Shared refresh lock — prevents multiple concurrent 401s each firing their own refresh
let refreshPromise: Promise<string> | null = null

function doRefresh(): Promise<string> {
  if (refreshPromise) return refreshPromise
  refreshPromise = axios
    .post(`${API_URL}/api/v1/auth/refresh`, { refresh_token: Cookies.get('refresh_token') })
    .then(res => {
      Cookies.set('access_token', res.data.access_token, { expires: 1 })
      return res.data.access_token as string
    })
    .catch(err => {
      Cookies.remove('access_token')
      Cookies.remove('refresh_token')
      window.location.href = '/auth/login'
      throw err
    })
    .finally(() => { refreshPromise = null })
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url: string = error.config?.url ?? ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')
    if (error.response?.status === 401 && !isAuthEndpoint && !error.config._retried) {
      const refreshToken = Cookies.get('refresh_token')
      if (refreshToken) {
        try {
          const newToken = await doRefresh()
          error.config._retried = true
          error.config.headers.Authorization = `Bearer ${newToken}`
          return api.request(error.config)
        } catch {
          return Promise.reject(error)
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

export const botRunnerApi = {
  start: (botId: string) => api.post(`/api/v1/bot-runner/${botId}/start`),
  startWithParams: (botId: string, tradeParams: Record<string, number>) =>
    api.post(`/api/v1/bot-runner/${botId}/start`, { trade_params: tradeParams }),
  stop: (botId: string) => api.post(`/api/v1/bot-runner/${botId}/stop`),
  status: (botId: string) => api.get(`/api/v1/bot-runner/${botId}/status`),
  positions: (botId: string) => api.get(`/api/v1/bot-runner/${botId}/positions`),
  tradeLog: (botId: string) => api.get(`/api/v1/bot-runner/${botId}/trade-log`),
  testConnection: (botId: string) => api.post(`/api/v1/bot-runner/${botId}/test-connection`),
}
