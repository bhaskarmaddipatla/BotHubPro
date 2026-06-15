"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Bot, Activity, BarChart3, FlaskConical,
  LineChart, CreditCard, Settings, ShieldCheck, Store
} from 'lucide-react'
import { userApi } from '@/lib/api'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/bots', label: 'Bots', icon: Bot },
  { href: '/dashboard/executions', label: 'Executions', icon: Activity },
  { href: '/dashboard/performance', label: 'Performance', icon: LineChart },
  { href: '/dashboard/backtests', label: 'Backtests', icon: FlaskConical },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/marketplace', label: 'Marketplace', icon: Store },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<{ first_name: string; last_name: string; role: string } | null>(null)

  useEffect(() => {
    userApi.getMe().then(r => setUser(r.data)).catch(() => {})
  }, [])

  const displayName = user ? `${user.first_name} ${user.last_name}` : 'Loading...'
  const initials = user ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : '?'
  const role = user?.role ?? ''
  const isAdmin = role === 'admin'

  const visibleNav = isAdmin
    ? [...navItems, { href: '/dashboard/admin', label: 'Admin', icon: ShieldCheck }]
    : navItems

  return (
    <aside className="w-60 min-h-screen bg-[#0a0e1a] border-r border-[#1e2a3a] flex flex-col">
      <div className="p-6 border-b border-[#1e2a3a]">
        <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">B</div>
          <span className="text-lg font-bold text-white">BotHub Pro</span>
        </Link>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin">
        {visibleNav.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "text-gray-400 hover:text-white hover:bg-[#1e2a3a]"
              )}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-[#1e2a3a]">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-xs font-bold">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{displayName}</div>
            <div className="text-xs text-gray-400 truncate capitalize">{role}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
