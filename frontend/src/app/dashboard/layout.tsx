import Link from 'next/link'
import { Sidebar } from '@/components/layout/sidebar'
import { EmailVerifyBanner } from '@/components/layout/email-verify-banner'
import TokenKeepAlive from '@/components/auth/TokenKeepAlive'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#0a0e1a]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <EmailVerifyBanner />
        {/* Persistent risk disclaimer */}
        <div className="bg-yellow-900/30 border-b border-yellow-500/20 px-4 py-1.5 text-xs text-yellow-400/80 flex items-center justify-between shrink-0">
          <span>
            ⚠️ <strong>Not financial advice.</strong> Options trading involves substantial risk of loss. Past performance does not guarantee future results. Trade only what you can afford to lose.
          </span>
          <div className="flex gap-3 ml-4 shrink-0">
            <Link href="/legal/risk-disclosure" target="_blank" className="underline hover:text-yellow-300">Risk Disclosure</Link>
            <Link href="/legal/terms" target="_blank" className="underline hover:text-yellow-300">Terms</Link>
          </div>
        </div>
        <TokenKeepAlive />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
