"use client"
import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { analyticsApi, botRunnerApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Bot, Activity, TrendingUp, DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import Link from 'next/link'

const mockEquityCurve = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  cumulative: Math.round(1000 + Math.sin(i * 0.3) * 200 + i * 35 + Math.random() * 100),
}))

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [todayData, setTodayData] = useState<any>(null)
  const [todayLoading, setTodayLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchToday = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const r = await botRunnerApi.todayTrades()
      setTodayData(r.data)
    } catch {
      setTodayData({ trades: [], total_trades: 0, total_pnl: 0, winners: 0, losers: 0 })
    } finally {
      setTodayLoading(false)
      if (showSpinner) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    analyticsApi.getSummary()
      .then(r => setSummary(r.data))
      .catch(() => setSummary({ active_bots: 0, executions_today: 0, win_rate: 0, total_pnl: 0 }))
      .finally(() => setLoading(false))
    fetchToday()
    // Auto-refresh every 30s
    const iv = setInterval(() => fetchToday(), 30000)
    return () => clearInterval(iv)
  }, [fetchToday])

  const stats = [
    { label: 'Active Bots', value: summary?.active_bots ?? 0, icon: Bot, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Executions Today', value: summary?.executions_today ?? 0, icon: Activity, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Win Rate', value: `${(summary?.win_rate ?? 0).toFixed(1)}%`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Total P&L', value: formatCurrency(summary?.total_pnl ?? 0), icon: DollarSign, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  ]

  const trades: any[] = todayData?.trades || []
  const todayPnl: number = todayData?.total_pnl ?? 0

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label} className="bg-[#0f1623] border-[#1e2a3a]">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-400 text-sm">{stat.label}</span>
                    <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                      <Icon size={16} className={stat.color} />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-white">{loading ? '—' : stat.value}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Today's Trades */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base font-medium text-white">
                  Today's Trades
                </CardTitle>
                <span className="text-xs text-gray-500">
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                {!todayLoading && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400">{todayData?.total_trades ?? 0} trades</span>
                    {todayData?.total_trades > 0 && (
                      <>
                        <span className="text-green-400">{todayData.winners}W</span>
                        <span className="text-red-400">{todayData.losers}L</span>
                        <span className={`font-semibold ${todayPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          Net: {todayPnl >= 0 ? '+' : ''}{formatCurrency(todayPnl)}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => fetchToday(true)}
                disabled={refreshing}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {todayLoading ? (
              <div className="text-center text-gray-500 text-sm py-8">Loading today's trades…</div>
            ) : trades.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-10">
                <Activity size={28} className="mx-auto mb-2 opacity-30" />
                No trades placed today yet.
                <div className="mt-1 text-xs text-gray-600">Trades appear here as your bots execute.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e2a3a] text-gray-400 text-xs">
                      <th className="text-left px-4 py-2">Bot</th>
                      <th className="text-left px-4 py-2">Action</th>
                      <th className="text-right px-4 py-2">Strike</th>
                      <th className="text-right px-4 py-2">Credit</th>
                      <th className="text-right px-4 py-2">Contracts</th>
                      <th className="text-right px-4 py-2">P&L</th>
                      <th className="text-right px-4 py-2">Mode</th>
                      <th className="text-right px-4 py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t: any, i: number) => {
                      const pnl = parseFloat(String(t.pnl || '0').replace(/[$,]/g, '')) || 0
                      const isSim = t.is_simulation !== false && (t.mode === 'sim' || t.paper === true || t.paper === 'true')
                      const timeStr = t.time || t.timestamp || t.date || ''
                      const displayTime = timeStr.length > 10
                        ? new Date(timeStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : timeStr
                      return (
                        <tr key={i} className="border-b border-[#1e2a3a]/40 hover:bg-[#1e2a3a]/30">
                          <td className="px-4 py-3">
                            <Link href={`/dashboard/bots/${t.bot_id}/live`}
                              className="text-blue-400 hover:text-blue-300 text-xs font-medium">
                              {t.bot_name || t.bot_id}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-300 text-xs">{t.action || '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-400 text-xs">{t.strike || t.short_strike || '—'}</td>
                          <td className="px-4 py-3 text-right text-green-400 text-xs">
                            {t.credit ? `$${t.credit}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 text-xs">{t.contracts || '—'}</td>
                          <td className={`px-4 py-3 text-right text-xs font-medium ${pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            <span className="flex items-center justify-end gap-0.5">
                              {pnl > 0 ? <ArrowUpRight size={11} /> : pnl < 0 ? <ArrowDownRight size={11} /> : null}
                              {t.pnl ? `$${Math.abs(pnl).toFixed(2)}` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${isSim ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'}`}>
                              {isSim ? 'SIM' : 'LIVE'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500 text-xs">{displayTime}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Equity Curve */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-white">Equity Curve (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={mockEquityCurve}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: '#0f1623', border: '1px solid #1e2a3a', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(value: any) => [`$${value}`, 'Portfolio Value']}
                />
                <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2} fill="url(#equityGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/dashboard/bots">
            <Card className="bg-[#0f1623] border-[#1e2a3a] hover:border-blue-500/30 transition-colors cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <Bot size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">Manage Bots</div>
                    <div className="text-gray-400 text-xs">Configure and deploy</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/backtests">
            <Card className="bg-[#0f1623] border-[#1e2a3a] hover:border-green-500/30 transition-colors cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <Activity size={20} className="text-green-400" />
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">Run Backtest</div>
                    <div className="text-gray-400 text-xs">Test your strategy</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/analytics">
            <Card className="bg-[#0f1623] border-[#1e2a3a] hover:border-purple-500/30 transition-colors cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                    <TrendingUp size={20} className="text-purple-400" />
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">View Analytics</div>
                    <div className="text-gray-400 text-xs">Performance metrics</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
