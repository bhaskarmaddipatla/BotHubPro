"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { marketplaceApi } from '@/lib/api'
import { TrendingUp, TrendingDown, Zap, Star } from 'lucide-react'

const riskColors: Record<string, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/20 text-red-400',
}

export default function MarketplacePage() {
  const [bots, setBots] = useState<any[]>([])

  useEffect(() => {
    marketplaceApi.listBots().then(r => setBots(r.data.bots)).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <nav className="border-b border-[#1e2a3a] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm">B</div>
            <span className="text-xl font-bold">BotHub Pro</span>
          </Link>
          <div className="flex gap-3">
            <Link href="/auth/login" className="text-sm text-gray-400 hover:text-white">Sign In</Link>
            <Link href="/dashboard" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Dashboard</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3">Bot Marketplace</h1>
          <p className="text-gray-400 text-lg">Proven SPX trading strategies, ready to deploy</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {bots.map((bot) => (
            <div key={bot.id} className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl p-5 hover:border-blue-500/30 transition-all hover:shadow-lg hover:shadow-blue-500/5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-white mb-1">{bot.name}</h3>
                  <p className="text-gray-400 text-xs leading-relaxed">{bot.description}</p>
                </div>
              </div>

              <div className="flex gap-2 mb-4">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColors[bot.risk_level]}`}>
                  {bot.risk_level} risk
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 capitalize">
                  {bot.category.replace('_', ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-5">
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

              <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                <span>{bot.total_trades} total trades</span>
                <span className="bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">Live</span>
              </div>

              <Link href="/auth/register"
                className="block w-full text-center bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                Subscribe to Bot
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
