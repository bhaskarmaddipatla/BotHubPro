'use client'
import { useEffect } from 'react'
import Cookies from 'js-cookie'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
// Refresh 5 minutes before the 600-minute window closes — fire every 55 minutes
const REFRESH_INTERVAL_MS = 55 * 60 * 1000

export default function TokenKeepAlive() {
  useEffect(() => {
    const refresh = async () => {
      const refreshToken = Cookies.get('refresh_token')
      if (!refreshToken) return
      try {
        const res = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refresh_token: refreshToken })
        Cookies.set('access_token', res.data.access_token, { expires: 1 })
        if (res.data.refresh_token) {
          Cookies.set('refresh_token', res.data.refresh_token, { expires: 7 })
        }
      } catch {
        // silently ignore — the 401 interceptor in api.ts handles hard failures
      }
    }

    // Also refresh immediately on mount if access_token is missing but refresh_token exists
    if (!Cookies.get('access_token') && Cookies.get('refresh_token')) {
      refresh()
    }

    const id = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return null
}
