"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { marketplaceApi, userApi } from '@/lib/api'
import { TrendingUp, TrendingDown, Zap, Star } from 'lucide-react'

const riskColors: Record<string, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/20 text-red-400',
}

export default function DashboardMarketplacePage() {
  const [bots, setBots] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    marketplaceApi.listBots().then(r => setBots(r.data.bots)).catch(() => {})
    userApi.getMe().then(r => {
      setIsAdmin(r.data.is_admin === true || r.data.role === 'admin')
    }).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col h-full">
      <Header title="Marketplace" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">

        <div className="mb-2">
          <p className="text-gray-400 text-sm">Proven SPX trading strategies, ready to deploy</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {bots.map((bot) => (
            <div key={bot.id} className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-5 hover:border-blue-500/30 transition-all hover:shadow-lg hover:shadow-blue-500/5">
              <div className="mb-4">
                <h3 className="font-semibold text-white mb-1">{bot.name}</h3>
                <p className="text-gray-400 text-xs leading-relaxed">{bot.description}</p>
              </div>

              <div className="flex gap-2 mb-4">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColors[bot.risk_level]}`}>
                  {bot.risk_level} risk
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 capitalize">
                  {bot.category?.replace('_', ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-[#0a0e1a] rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1 flex items-center gap-1"><TrendingUp size={10} /> Win Rate</div>
                  <div className="text-green-400 font-bold">{bot.win_rate}%</div>
                </div>
                <div className="bg-[#0a0e1a] rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1 flex items-center gap-1"><Star size={10} /> Profit Factor</div>
                  <div className="text-blue-400 font-bold">{bot.profit_factor}</div>
                </div>
                <div className="bg-[#0a0e1a] rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1 flex items-center gap-1"><TrendingDown size={10} /> Max Drawdown</div>
                  <div className="text-red-400 font-bold">{bot.max_drawdown}%</div>
                </div>
                <div className="bg-[#0a0e1a] rounded-lg p-3">
                  <div className="text-gray-400 text-xs mb-1 flex items-center gap-1"><Zap size={10} /> Monthly Return</div>
                  <div className="text-green-400 font-bold">+{bot.monthly_return}%</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{bot.total_trades} total trades</span>
                <span className="bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">Live</span>
              </div>
            </div>
          ))}
        </div>

        {!isAdmin && (
          <div className="mt-6 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-2 text-white">Access All Bots with One Subscription</h2>
            <p className="text-gray-400 mb-6 max-w-xl mx-auto">
              Subscribe to BotHub Pro and deploy any strategy in minutes. All bots are included — no per-bot fees.
            </p>
            <Link href="/dashboard/billing"
              className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg font-medium transition-colors text-lg">
              View Subscription Plans
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
