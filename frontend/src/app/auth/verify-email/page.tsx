"use client"
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    api.get(`/api/v1/auth/verify-email/${token}`)
      .then(() => {
        setStatus('success')
        setTimeout(() => router.push('/auth/login'), 3000)
      })
      .catch(() => setStatus('error'))
  }, [token, router])

  return (
    <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-8">
      {status === 'loading' && (
        <>
          <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Verifying your email...</p>
        </>
      )}
      {status === 'success' && (
        <>
          <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Email Verified!</h2>
          <p className="text-gray-400 text-sm">Your account is now active. Redirecting to login...</p>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Verification Failed</h2>
          <p className="text-gray-400 text-sm mb-4">This link is invalid or has expired.</p>
          <Link href="/auth/register" className="text-blue-400 hover:text-blue-300 text-sm">Register again</Link>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center font-bold">B</div>
          <span className="text-2xl font-bold text-white">BotHub Pro</span>
        </Link>
        <Suspense fallback={
          <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-8">
            <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading...</p>
          </div>
        }>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  )
}
