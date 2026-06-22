"use client"
import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { analyticsApi, botRunnerApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Bot, Activity, TrendingUp, DollarSign, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'

function fmtTime(raw?: string): string {
  if (!raw) return '—'
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw.length > 19 ? raw.slice(11, 19) : raw
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York', hour12: false })
  } catch { return raw }
}

interface TradeRow {
  action?: string; time?: string; timestamp?: string; symbol?: string
  pnl?: string | number; credit?: string | number; filled_price?: string | number; price?: string | number
  qty?: string | number; contracts?: string | number
  status?: string; side?: string; instrument?: string; description?: string
  group_id?: string; trade_id?: string; spread_id?: string
  bot_id?: string; bot_name?: string
  [key: string]: unknown
}

interface SpreadGroup {
  id: string; botId: string; botName: string; instrument: string
  status: 'open' | 'closed' | 'failed'
  openTime?: string; closeTime?: string
  entryCredit?: number; netPnl?: number
  rows: TradeRow[]
}

function groupTrades(trades: TradeRow[]): SpreadGroup[] {
  const groups: SpreadGroup[] = []
  const byGroupId: Record<string, TradeRow[]> = {}
  const hasIds = trades.some(t => t.group_id || t.trade_id || t.spread_id)

  if (hasIds) {
    for (const t of trades) {
      const id = `${t.bot_id}__${t.group_id ?? t.trade_id ?? t.spread_id ?? 'x'}`
      if (!byGroupId[id]) byGroupId[id] = []
      byGroupId[id].push(t)
    }
    for (const [id, rows] of Object.entries(byGroupId)) {
      groups.push(buildGroup(id, rows))
    }
  } else {
    // fallback: group per-bot by ENTRY/EXIT sequence
    const byBot: Record<string, TradeRow[]> = {}
    for (const t of trades) {
      const k = String(t.bot_id ?? 'unknown')
      if (!byBot[k]) byBot[k] = []
      byBot[k].push(t)
    }
    let idx = 0
    for (const rows of Object.values(byBot)) {
      const sorted = [...rows].sort((a, b) =>
        (a.time ?? a.timestamp ?? '') < (b.time ?? b.timestamp ?? '') ? -1 : 1)
      let cur: TradeRow[] = []
      for (const t of sorted) {
        const a = String(t.action ?? '').toUpperCase()
        if (a.includes('ENTRY') || a === 'SELL TO OPEN') {
          if (cur.length) { groups.push(buildGroup(String(idx++), cur)); cur = [] }
          cur = [t]
        } else { cur.push(t) }
      }
      if (cur.length) groups.push(buildGroup(String(idx++), cur))
    }
  }

  // Sort groups by openTime desc
  return groups.sort((a, b) => (a.openTime ?? '') > (b.openTime ?? '') ? -1 : 1)
}

function buildGroup(id: string, rows: TradeRow[]): SpreadGroup {
  const entries = rows.filter(r => {
    const a = String(r.action ?? '').toUpperCase()
    return a.includes('ENTRY') || a === 'SELL TO OPEN'
  })
  const exits = rows.filter(r => {
    const a = String(r.action ?? '').toUpperCase()
    return a.includes('EXIT') || a === 'BUY TO CLOSE'
  })
  const times = rows.map(r => r.time ?? r.timestamp).filter(Boolean) as string[]
  const sorted = [...times].sort()
  const instrument = String(rows[0]?.instrument ?? rows[0]?.description ?? rows[0]?.symbol ?? 'SPX Spread')
  const creditVals = entries.map(r => Number(r.filled_price ?? r.price ?? r.credit ?? NaN)).filter(n => !isNaN(n))
  const pnlVals = exits.map(r => Number(r.pnl ?? NaN)).filter(n => !isNaN(n))
  const hasFailed = exits.some(r => String(r.status ?? '').toUpperCase() === 'FAILED')
  return {
    id,
    botId: String(rows[0]?.bot_id ?? ''),
    botName: String(rows[0]?.bot_name ?? 'Bot'),
    instrument,
    status: exits.length > 0 && !hasFailed ? 'closed' : hasFailed ? 'failed' : 'open',
    openTime: sorted[0],
    closeTime: exits.length > 0 ? sorted[sorted.length - 1] : undefined,
    entryCredit: creditVals.length ? creditVals.reduce((a, b) => a + b, 0) / creditVals.length : undefined,
    netPnl: pnlVals.length ? pnlVals.reduce((a, b) => a + b, 0) : undefined,
    rows,
  }
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [todayData, setTodayData] = useState<any>(null)
  const [todayLoading, setTodayLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [equityData, setEquityData] = useState<any[]>([])

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
    analyticsApi.getEquityCurve?.()
      .then((r: any) => setEquityData(r.data || []))
      .catch(() => setEquityData([]))
    fetchToday()
    const iv = setInterval(() => fetchToday(), 30000)
    return () => clearInterval(iv)
  }, [fetchToday])

  const trades: TradeRow[] = todayData?.trades || []
  const groups = groupTrades(trades)

  // Compute meaningful stats from today's trade groups
  const closedGroups = groups.filter(g => g.status === 'closed')
  const todayRealizedPnl = closedGroups.reduce((sum, g) => sum + (g.netPnl ?? 0), 0)
  const todayWinners = closedGroups.filter(g => (g.netPnl ?? 0) > 0).length
  const todayLosers = closedGroups.filter(g => (g.netPnl ?? 0) <= 0).length
  const todayWinRate = closedGroups.length > 0 ? (todayWinners / closedGroups.length * 100) : 0
  const openGroups = groups.filter(g => g.status === 'open')

  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const chartData = equityData.length > 0 ? equityData : []

  const stats = [
    {
      label: 'Active Bots', value: summary?.active_bots ?? 0,
      icon: Bot, color: 'text-blue-400', bg: 'bg-blue-500/10', sub: 'configured'
    },
    {
      label: 'Spreads Today', value: groups.length,
      icon: Activity, color: 'text-green-400', bg: 'bg-green-500/10',
      sub: `${openGroups.length} open · ${closedGroups.length} closed`
    },
    {
      label: 'Win Rate (Today)', value: closedGroups.length > 0 ? `${todayWinRate.toFixed(0)}%` : '—',
      icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10',
      sub: closedGroups.length > 0 ? `${todayWinners}W ${todayLosers}L` : 'no closed trades'
    },
    {
      label: 'Realized P&L (Today)', value: closedGroups.length > 0 ? formatCurrency(todayRealizedPnl) : '$0.00',
      icon: DollarSign,
      color: todayRealizedPnl > 0 ? 'text-green-400' : todayRealizedPnl < 0 ? 'text-red-400' : 'text-yellow-400',
      bg: todayRealizedPnl > 0 ? 'bg-green-500/10' : todayRealizedPnl < 0 ? 'bg-red-500/10' : 'bg-yellow-500/10',
      sub: 'from closed spreads only'
    },
  ]

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
                  <div className={`text-2xl font-bold ${stat.color}`}>
                    {loading && stat.label === 'Active Bots' ? '—' : todayLoading && stat.label !== 'Active Bots' ? '—' : stat.value}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{stat.sub}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Today's Trades — grouped */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-base font-medium text-white">Today's Trades</CardTitle>
                <span className="text-xs text-gray-500">
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                {!todayLoading && groups.length > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400">{groups.length} spread{groups.length !== 1 ? 's' : ''}</span>
                    <span className="text-green-400">{todayWinners}W</span>
                    <span className="text-red-400">{todayLosers}L</span>
                    {closedGroups.length > 0 && (
                      <span className={`font-semibold px-2 py-0.5 rounded ${todayRealizedPnl >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        Net: {todayRealizedPnl >= 0 ? '+' : ''}{formatCurrency(todayRealizedPnl)}
                      </span>
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
              <div className="text-center text-gray-500 text-sm py-8">Loading…</div>
            ) : groups.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-10">
                <Activity size={28} className="mx-auto mb-2 opacity-30" />
                No trades placed today yet.
                <div className="mt-1 text-xs text-gray-600">Trades appear here as your bots execute.</div>
              </div>
            ) : (
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#0f1623] z-10">
                    <tr className="border-b border-[#1e2a3a] text-gray-400">
                      <th className="text-left px-3 py-2 w-6"></th>
                      <th className="text-left px-3 py-2">Bot</th>
                      <th className="text-left px-3 py-2">Instrument</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Opened (ET)</th>
                      <th className="text-left px-3 py-2">Closed (ET)</th>
                      <th className="text-right px-3 py-2">Credit</th>
                      <th className="text-right px-3 py-2">Net P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const isOpen = expanded[g.id]
                      const statusColor = g.status === 'closed' ? 'text-green-400'
                        : g.status === 'failed' ? 'text-red-500' : 'text-yellow-400'
                      const statusLabel = g.status === 'closed' ? 'Closed'
                        : g.status === 'failed' ? 'Failed' : 'Open'
                      const pnlColor = g.netPnl === undefined ? 'text-gray-500'
                        : g.netPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      return (
                        <>
                          <tr
                            key={`g-${g.id}`}
                            className="border-b border-[#1e2a3a]/50 hover:bg-[#1e2a3a]/40 cursor-pointer"
                            onClick={() => toggle(g.id)}
                          >
                            <td className="px-3 py-2 text-gray-500">
                              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </td>
                            <td className="px-3 py-2">
                              <Link
                                href={`/dashboard/bots/${g.botId}/live`}
                                className="text-blue-400 hover:text-blue-300 font-medium"
                                onClick={e => e.stopPropagation()}
                              >
                                {g.botName}
                              </Link>
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-200 font-medium">{g.instrument}</td>
                            <td className={`px-3 py-2 font-medium ${statusColor}`}>{statusLabel}</td>
                            <td className="px-3 py-2 text-gray-400">{fmtTime(g.openTime)}</td>
                            <td className="px-3 py-2 text-gray-400">{g.closeTime ? fmtTime(g.closeTime) : '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-300">
                              {g.entryCredit !== undefined ? Math.abs(g.entryCredit).toFixed(2) : '—'}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold ${pnlColor}`}>
                              {g.netPnl !== undefined
                                ? `${g.netPnl >= 0 ? '+' : ''}$${g.netPnl.toFixed(2)}`
                                : g.status === 'open' ? <span className="text-yellow-400/60 font-normal">Open</span> : '—'}
                            </td>
                          </tr>
                          {isOpen && g.rows.map((t, i) => {
                            const action = String(t.action ?? '').toUpperCase()
                            const isEntry = action.includes('ENTRY') || action === 'SELL TO OPEN'
                            const rowStatus = String(t.status ?? '')
                            const rowStatusColor = rowStatus.toLowerCase() === 'filled' ? 'text-green-400'
                              : rowStatus.toLowerCase().includes('dry') ? 'text-gray-500'
                              : rowStatus.toLowerCase() === 'failed' ? 'text-red-500'
                              : rowStatus.toLowerCase().includes('submit') ? 'text-yellow-400'
                              : 'text-gray-400'
                            const price = t.filled_price ?? t.price ?? t.credit
                            const rowPnl = t.pnl !== undefined ? Number(t.pnl) : undefined
                            return (
                              <tr key={`g-${g.id}-r-${i}`} className="border-b border-[#1e2a3a]/20 bg-[#080e18]">
                                <td></td>
                                <td className="px-3 py-1.5 pl-6">
                                  <span className={`px-1.5 py-0.5 rounded font-medium ${isEntry ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    {String(t.side ?? (isEntry ? 'Sell to Open' : 'Buy to Close'))}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-gray-500">{fmtTime(String(t.time ?? t.timestamp ?? ''))}</td>
                                <td className={`px-3 py-1.5 ${rowStatusColor}`}>{rowStatus || '—'}</td>
                                <td className="px-3 py-1.5 text-gray-500">
                                  {t.qty ?? t.contracts ? `${t.qty ?? t.contracts} contract${Number(t.qty ?? t.contracts) !== 1 ? 's' : ''}` : '—'}
                                </td>
                                <td></td>
                                <td className="px-3 py-1.5 text-right text-gray-400">
                                  {price !== undefined ? Math.abs(Number(price)).toFixed(2) : '—'}
                                </td>
                                <td className={`px-3 py-1.5 text-right font-medium ${rowPnl !== undefined ? (rowPnl >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`}>
                                  {rowPnl !== undefined ? `${rowPnl >= 0 ? '+' : ''}$${rowPnl.toFixed(2)}` : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Equity Curve */}
        {chartData.length > 0 && (
          <Card className="bg-[#0f1623] border-[#1e2a3a]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-white">Equity Curve (30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData}>
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
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { href: '/dashboard/bots', label: 'Manage Bots', sub: 'Configure and deploy', Icon: Bot, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'hover:border-blue-500/30' },
            { href: '/dashboard/backtests', label: 'Run Backtest', sub: 'Test your strategy', Icon: Activity, color: 'text-green-400', bg: 'bg-green-500/10', border: 'hover:border-green-500/30' },
            { href: '/dashboard/analytics', label: 'View Analytics', sub: 'Performance metrics', Icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'hover:border-purple-500/30' },
          ].map(({ href, label, sub, Icon, color, bg, border }) => (
            <Link href={href} key={href}>
              <Card className={`bg-[#0f1623] border-[#1e2a3a] ${border} transition-colors cursor-pointer`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}>
                      <Icon size={20} className={color} />
                    </div>
                    <div>
                      <div className="font-medium text-white text-sm">{label}</div>
                      <div className="text-gray-400 text-xs">{sub}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
