"use client"
import { Bell, Search, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { authApi } from '@/lib/api'

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  const router = useRouter()

  const logout = async () => {
    try { await authApi.logout() } catch {}
    Cookies.remove('access_token')
    Cookies.remove('refresh_token')
    router.push('/auth/login')
  }

  return (
    <header className="h-16 border-b border-[#1e2a3a] flex items-center justify-between px-6 bg-[#0a0e1a]">
      <h1 className="text-lg font-semibold text-white">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="relative hidden md:flex items-center">
          <Search size={14} className="absolute left-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-[#0f1623] border border-[#1e2a3a] rounded-lg pl-9 pr-4 py-1.5 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-48"
          />
        </div>
        <Button variant="ghost" size="icon" className="relative text-gray-400 hover:text-white">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          className="text-gray-400 hover:text-red-400"
          title="Logout"
        >
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  )
}
    <header className="h-16 border-b border-[#1e2a3a] flex items-center justify-between px-6 bg-[#0a0e1a]">
      <h1 className="text-lg font-semibold text-white">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="relative hidden md:flex items-center">
          <Search size={14} className="absolute left-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-[#0f1623] border border-[#1e2a3a] rounded-lg pl-9 pr-4 py-1.5 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-48"
          />
        </div>
        <Button variant="ghost" size="icon" className="relative text-gray-400 hover:text-white">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          className="text-gray-400 hover:text-red-400"
          title="Logout"
        >
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  )
}
