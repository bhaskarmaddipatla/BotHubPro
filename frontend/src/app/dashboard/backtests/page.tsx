"use client"
import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { backtestsApi, botsApi } from '@/lib/api'
import { toast } from 'sonner'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { FlaskConical, ChevronDown, ChevronUp } from 'lucide-react'

const PARAM_DEFS = [
  { key: 'contracts', label: 'Contracts', type: 'number', step: 1, min: 1, max: 50 },
  { key: 'spread_width', label: 'Spread Width ($)', type: 'number', step: 1, min: 1, max: 50 },
  { key: 'short_strike_delta', label: 'Short Strike Delta', type: 'number', step: 0.01, min: 0.05, max: 0.50 },
  { key: 'take_profit_pct', label: 'Take Profit (%)', type: 'number', step: 5, min: 10, max: 100 },
  { key: 'max_loss_per_trade', label: 'Max Loss / Trade ($)', type: 'number', step: 50, min: 100, max: 5000 },
]

const DEFAULT_PARAMS: Record<string, number> = {
  contracts: 1,
  spread_width: 5,
  short_strike_delta: 0.20,
  take_profit_pct: 50,
  max_loss_per_trade: 500,
}

export default function BacktestsPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [bots, setBots] = useState<any[]>([])
  const [showAllTrades, setShowAllTrades] = useState(false)
  const [form, setForm] = useState({
    bot_id: '',
    strategy: 'credit_spread',
    start_date: '2023-01-01',
    end_date: '2023-12-31',
    initial_capital: 10000,
  })
  const [tradeParams, setTradeParams] = useState<Record<string, number>>({ ...DEFAULT_PARAMS })

  useEffect(() => {
    botsApi.list().then(r => setBots(r.data || [])).catch(() => {})
  }, [])

  const handleBotChange = (botId: string) => {
    const bot = bots.find((b: any) => b.id === botId)
    const cfg = bot?.configuration || {}
    const merged: Record<string, number> = { ...DEFAULT_PARAMS }
    for (const p of PARAM_DEFS) {
      if (cfg[p.key] !== undefined) merged[p.key] = Number(cfg[p.key])
    }
    setTradeParams(merged)
    const strat = cfg.category === 'iron_condor' ? 'iron_condor' : 'credit_spread'
    setForm(f => ({ ...f, bot_id: botId, strategy: strat }))
  }

  const handleRun = async () => {
    setLoading(true)
    setShowAllTrades(false)
    try {
      const res = await backtestsApi.run({
        ...form,
        trade_params: tradeParams,
      })
      setResult(res.data)
      toast.success('Backtest completed')
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Backtest failed'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const trades: any[] = result?.trades || []
  const visibleTrades = showAllTrades ? trades : trades.slice(-20)

  return (
    <div className="flex flex-col h-full">
      <Header title="Backtests" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">

        {/* Config card */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white">Configure Backtest</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Bot (optional)</Label>
                <select
                  value={form.bot_id}
                  onChange={e => handleBotChange(e.target.value)}
                  className="w-full bg-[#0a0e1a] border border-[#1e2a3a] rounded-md px-3 py-2 text-sm text-white"
                >
                  <option value="">— No bot selected —</option>
                  {bots.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Strategy</Label>
                <select
                  value={form.strategy}
                  onChange={e => setForm(f => ({ ...f, strategy: e.target.value }))}
                  className="w-full bg-[#0a0e1a] border border-[#1e2a3a] rounded-md px-3 py-2 text-sm text-white"
                >
                  <option value="credit_spread">SPX Credit Spread (0DTE)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Start Date</Label>
                <Input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="bg-[#0a0e1a] border-[#1e2a3a] text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">End Date</Label>
                <Input type="date" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="bg-[#0a0e1a] border-[#1e2a3a] text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Initial Capital ($)</Label>
                <Input type="number" value={form.initial_capital}
                  onChange={e => setForm(f => ({ ...f, initial_capital: +e.target.value }))}
                  className="bg-[#0a0e1a] border-[#1e2a3a] text-white" />
              </div>
            </div>

            {/* Trade params */}
            <div className="border-t border-[#1e2a3a] pt-4">
              <p className="text-xs text-gray-400 mb-3">Trade Parameters</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {PARAM_DEFS.map(p => (
                  <div key={p.key} className="space-y-1">
                    <Label className="text-gray-400 text-xs">{p.label}</Label>
                    <Input
                      type="number"
                      step={p.step}
                      min={p.min}
                      max={p.max}
                      value={tradeParams[p.key]}
                      onChange={e => setTradeParams(prev => ({ ...prev, [p.key]: +e.target.value }))}
                      className="bg-[#0a0e1a] border-[#1e2a3a] text-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleRun} disabled={loading} className="gap-2">
              <FlaskConical size={16} /> {loading ? 'Fetching data & running…' : 'Run Backtest'}
            </Button>
            {loading && (
              <p className="text-xs text-gray-500">Downloading SPX + VIX history from Yahoo Finance. This takes ~10s…</p>
            )}
          </CardContent>
        </Card>

        {result && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'Total Return', value: `${result.total_return}%`, color: result.total_return >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Final Capital', value: formatCurrency(result.final_capital), color: 'text-white' },
                { label: 'Win Rate', value: `${result.win_rate}%`, color: 'text-blue-400' },
                { label: 'Profit Factor', value: result.profit_factor, color: 'text-purple-400' },
                { label: 'Max Drawdown', value: `-${result.max_drawdown}%`, color: 'text-red-400' },
                { label: 'Sharpe Ratio', value: result.sharpe_ratio, color: 'text-yellow-400' },
                { label: 'Total Trades', value: result.total_trades, color: 'text-white' },
              ].map(m => (
                <Card key={m.label} className="bg-[#0f1623] border-[#1e2a3a]">
                  <CardContent className="p-4">
                    <div className="text-gray-400 text-xs mb-1">{m.label}</div>
                    <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Equity curve */}
            <Card className="bg-[#0f1623] border-[#1e2a3a]">
              <CardHeader><CardTitle className="text-base text-white">Equity Curve</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={result.equity_curve}>
                    <defs>
                      <linearGradient id="btGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(result.equity_curve.length / 8)} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(1)}k`} />
                    <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e2a3a', borderRadius: '8px' }}
                      formatter={(v: any) => [formatCurrency(v), 'Portfolio']} />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#btGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly returns */}
            {result.monthly_returns?.length > 0 && (
              <Card className="bg-[#0f1623] border-[#1e2a3a]">
                <CardHeader><CardTitle className="text-base text-white">Monthly Returns</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#1e2a3a] text-gray-400 text-xs">
                          <th className="text-left p-3">Month</th>
                          <th className="text-right p-3">P&L</th>
                          <th className="text-right p-3">Return</th>
                          <th className="text-right p-3">Trades</th>
                          <th className="text-right p-3">Win Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.monthly_returns.map((m: any) => (
                          <tr key={m.month} className="border-b border-[#1e2a3a]/50 hover:bg-[#1e2a3a]/30">
                            <td className="p-3 text-gray-300">{m.month}</td>
                            <td className={`p-3 text-right font-medium ${m.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {m.pnl >= 0 ? '+' : ''}{formatCurrency(m.pnl)}
                            </td>
                            <td className={`p-3 text-right ${m.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {m.return_pct >= 0 ? '+' : ''}{m.return_pct}%
                            </td>
                            <td className="p-3 text-right text-gray-400">{m.trades}</td>
                            <td className="p-3 text-right text-blue-400">{m.win_rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Trade log */}
            <Card className="bg-[#0f1623] border-[#1e2a3a]">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base text-white">
                  Trade Log <span className="text-gray-500 text-sm font-normal">({trades.length} trades)</span>
                </CardTitle>
                {trades.length > 20 && (
                  <button onClick={() => setShowAllTrades(v => !v)}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    {showAllTrades ? <><ChevronUp size={14} /> Show last 20</> : <><ChevronDown size={14} /> Show all {trades.length}</>}
                  </button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1e2a3a] text-gray-400">
                        <th className="text-left p-3">Date</th>
                        <th className="text-right p-3">SPX Open</th>
                        <th className="text-right p-3">Short K</th>
                        <th className="text-right p-3">Long K</th>
                        <th className="text-right p-3">Credit</th>
                        <th className="text-right p-3">P&L</th>
                        <th className="text-right p-3">Cumulative</th>
                        <th className="text-left p-3">Exit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTrades.map((t: any, i: number) => (
                        <tr key={i} className="border-b border-[#1e2a3a]/40 hover:bg-[#1e2a3a]/30">
                          <td className="p-3 text-gray-300">{t.date}</td>
                          <td className="p-3 text-right text-gray-300">{t.spx_open?.toLocaleString()}</td>
                          <td className="p-3 text-right text-gray-400">{t.short_strike}</td>
                          <td className="p-3 text-right text-gray-400">{t.long_strike}</td>
                          <td className="p-3 text-right text-green-400">${t.credit?.toFixed(2)}</td>
                          <td className={`p-3 text-right font-medium ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {t.pnl >= 0 ? '+' : ''}{formatCurrency(t.pnl)}
                          </td>
                          <td className={`p-3 text-right ${t.cumulative >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {t.cumulative >= 0 ? '+' : ''}{formatCurrency(t.cumulative)}
                          </td>
                          <td className="p-3">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              t.exit_reason === 'expire_worthless' ? 'bg-green-500/10 text-green-400' :
                              t.exit_reason === 'max_loss' ? 'bg-red-500/10 text-red-400' :
                              'bg-yellow-500/10 text-yellow-400'
                            }`}>
                              {t.exit_reason?.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
