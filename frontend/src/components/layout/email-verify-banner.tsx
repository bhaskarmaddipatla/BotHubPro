"use client"
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export function EmailVerifyBanner() {
  const [show, setShow] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    api.get('/api/v1/users/me').then(r => {
      if (r.data && r.data.is_email_verified === false) {
        setShow(true)
        setEmail(r.data.email || '')
      }
    }).catch(() => {})
  }, [])

  const resend = async () => {
    setSending(true)
    try {
      await api.post('/api/v1/auth/resend-verification', { email })
      toast.success('Verification email sent — check your inbox and spam folder')
    } catch {
      toast.error('Failed to resend — please try again')
    } finally {
      setSending(false)
    }
  }

  if (!show) return null

  return (
    <div className="bg-blue-900/40 border-b border-blue-500/30 px-4 py-2 text-xs text-blue-300 flex items-center justify-between shrink-0">
      <span>
        📧 <strong>Email not verified.</strong> Some features are restricted until you verify your email address.
      </span>
      <button
        onClick={resend}
        disabled={sending}
        className="ml-4 shrink-0 underline hover:text-blue-200 disabled:opacity-50">
        {sending ? 'Sending…' : 'Resend verification email'}
      </button>
    </div>
  )
}
