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
import { FlaskConical, ChevronDown, ChevronUp, Download } from 'lucide-react'

const STRATEGY_OPTIONS = [
  { value: 'credit_spread', label: 'SPX Credit Spread (0DTE)' },
  { value: 'iron_condor',   label: 'SPX Iron Condor (0DTE)' },
  { value: 'iron_fly',      label: 'SPX Iron Fly (0DTE)' },
  { value: 'butterfly',     label: 'SPX Butterfly (0DTE)' },
]

type ParamDef = { key: string; label: string; type: string; step?: number; min?: number; max?: number }
type VixEntryRule = { vix_below: number; entry_time: string }

// Strategy → which param fields to show
const STRATEGY_PARAMS: Record<string, ParamDef[]> = {
  credit_spread: [
    { key: 'contracts',          label: 'Contracts',         type: 'number', step: 1,    min: 1,    max: 50   },
    { key: 'spread_width',       label: 'Spread Width (pts)',type: 'number', step: 1,    min: 1,    max: 100  },
    { key: 'short_strike_delta', label: 'Short Strike Delta',type: 'number', step: 0.01, min: 0.05, max: 0.50 },
    { key: 'take_profit_pct',    label: 'Take Profit (%)',   type: 'number', step: 5,    min: 10,   max: 100  },
    { key: 'max_loss_per_trade', label: 'Max Loss / Trade ($)',type:'number', step: 50,   min: 100,  max: 5000 },
  ],
  iron_condor: [
    { key: 'contracts',        label: 'Contracts',       type: 'number', step: 1,    min: 1,    max: 50   },
    { key: 'wing_width',       label: 'Wing Width (pts)',type: 'number', step: 5,    min: 5,    max: 100  },
    { key: 'target_delta',     label: 'Short Delta',     type: 'number', step: 0.01, min: 0.05, max: 0.30 },
    { key: 'profit_target_pct',label: 'Take Profit (%)', type: 'number', step: 5,    min: 10,   max: 75   },
    { key: 'stop_loss_pct',    label: 'Stop Loss (%)',   type: 'number', step: 25,   min: 100,  max: 300  },
  ],
  iron_fly: [
    { key: 'contracts',        label: 'Contracts',       type: 'number', step: 1,    min: 1,    max: 50   },
    { key: 'wing_width',       label: 'Wing Width (pts)',type: 'number', step: 5,    min: 10,   max: 100  },
    { key: 'profit_target_pct',label: 'Take Profit (% of credit)', type: 'number', step: 1, min: 2, max: 100 },
    { key: 'stop_loss_pct',    label: 'Stop Loss (% of credit)',   type: 'number', step: 5, min: 5, max: 300 },
    { key: 'entry_time',       label: 'Entry Time (ET)', type: 'time' },
    { key: 'max_hold_minutes', label: 'Max Hold (min)',  type: 'number', step: 15,   min: 15,   max: 390  },
  ],
  butterfly: [
    { key: 'contracts',        label: 'Contracts',       type: 'number', step: 1,    min: 1,    max: 20   },
    { key: 'profit_target_pct',label: 'Take Profit (%)', type: 'number', step: 10,   min: 50,   max: 200  },
    { key: 'stop_loss_pct',    label: 'Stop Loss (%)',   type: 'number', step: 10,   min: 50,   max: 100  },
  ],
}

// Derive strategy from bot category
const categoryToStrategy: Record<string, string> = {
  credit_spread: 'credit_spread',
  iron_condor:   'iron_condor',
  iron_fly:      'iron_fly',
  butterfly:     'butterfly',
}

const DEFAULT_PARAMS_BY_STRATEGY: Record<string, Record<string, number | string>> = {
  credit_spread: { contracts: 1, spread_width: 5, short_strike_delta: 0.20, take_profit_pct: 50, max_loss_per_trade: 500 },
  iron_condor:   { contracts: 1, wing_width: 25, target_delta: 0.10, profit_target_pct: 50, stop_loss_pct: 200 },
  iron_fly:      { contracts: 1, wing_width: 50, profit_target_pct: 6, stop_loss_pct: 15, entry_time: '10:45', max_hold_minutes: 60 },
  butterfly:     { contracts: 1, profit_target_pct: 100, stop_loss_pct: 100 },
}

export default function BacktestsPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [bots, setBots] = useState<any[]>([])
  const [selectedBot, setSelectedBot] = useState<any>(null)
  const [showAllTrades, setShowAllTrades] = useState(false)
  const [form, setForm] = useState({
    bot_id: '',
    strategy: 'credit_spread',
    start_date: '2023-01-01',
    end_date: '2023-12-31',
    initial_capital: 10000,
  })
  const [tradeParams, setTradeParams] = useState<Record<string, number | string>>(
    { ...DEFAULT_PARAMS_BY_STRATEGY.credit_spread }
  )
  // Iron Fly only: optional VIX-regime entry timing (e.g. "VIX < 15 -> enter
  // 09:45", "VIX < 20 -> enter 10:30", otherwise use tradeParams.entry_time).
  const [useVixRules, setUseVixRules] = useState(false)
  const [vixRules, setVixRules] = useState<VixEntryRule[]>([])

  useEffect(() => {
    botsApi.list().then(r => setBots(r.data || [])).catch(() => {})
  }, [])

  const handleBotChange = (botId: string) => {
    if (!botId) {
      setSelectedBot(null)
      setForm(f => ({ ...f, bot_id: '', strategy: 'credit_spread' }))
      setTradeParams({ ...DEFAULT_PARAMS_BY_STRATEGY.credit_spread })
      setUseVixRules(false)
      setVixRules([])
      return
    }
    const bot = bots.find((b: any) => b.id === botId)
    setSelectedBot(bot)
    const strat = categoryToStrategy[bot?.category] || 'credit_spread'
    const cfg = bot?.configuration || {}
    const defaults = DEFAULT_PARAMS_BY_STRATEGY[strat] || DEFAULT_PARAMS_BY_STRATEGY.credit_spread
    const merged: Record<string, number | string> = { ...defaults }
    // Overlay bot's own saved config values
    for (const key of Object.keys(defaults)) {
      if (cfg[key] !== undefined) {
        merged[key] = typeof defaults[key] === 'number' ? Number(cfg[key]) : String(cfg[key])
      }
    }
    setTradeParams(merged)
    setForm(f => ({ ...f, bot_id: botId, strategy: strat }))
    if (strat === 'iron_fly' && Array.isArray(cfg.vix_entry_rules) && cfg.vix_entry_rules.length > 0) {
      setVixRules(cfg.vix_entry_rules)
      setUseVixRules(true)
    } else {
      setVixRules([])
      setUseVixRules(false)
    }
  }

  const handleStrategyChange = (strat: string) => {
    setSelectedBot(null)
    setForm(f => ({ ...f, bot_id: '', strategy: strat }))
    setTradeParams({ ...(DEFAULT_PARAMS_BY_STRATEGY[strat] || DEFAULT_PARAMS_BY_STRATEGY.credit_spread) })
    setUseVixRules(false)
    setVixRules([])
  }

  const addVixRule = () => setVixRules(prev => [...prev, { vix_below: 20, entry_time: '10:45' }])
  const removeVixRule = (i: number) => setVixRules(prev => prev.filter((_, idx) => idx !== i))
  const updateVixRule = (i: number, patch: Partial<VixEntryRule>) =>
    setVixRules(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))

  const handleRun = async () => {
    setLoading(true)
    setShowAllTrades(false)
    try {
      const trade_params = { ...tradeParams }
      if (form.strategy === 'iron_fly' && useVixRules && vixRules.length > 0) {
        trade_params.vix_entry_rules = vixRules as any
      }
      const res = await backtestsApi.run({
        ...form,
        trade_params,
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

  // Export every trade (with VIX and day close) as CSV for external analysis.
  // Metadata rows are prefixed with '#' so pandas can skip them (comment='#').
  const downloadCsv = () => {
    if (!result) return
    const esc = (v: any) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const meta = [
      `# strategy: ${result.strategy}`,
      `# period: ${result.start_date} to ${result.end_date}`,
      `# initial_capital: ${result.initial_capital}`,
      `# params: ${JSON.stringify(result.trade_params_used)}`,
      `# data: daily:${result.daily_source ?? (result.is_synthetic ? 'synthetic' : 'yahoo')}${result.intraday_source ? ` + intraday:${result.intraday_source}` : ''}`,
      `# summary: trades=${result.total_trades} win_rate=${result.win_rate}% profit_factor=${result.profit_factor} max_drawdown=${result.max_drawdown}% sharpe=${result.sharpe_ratio} total_return=${result.total_return}%`,
    ]
    const cols = trades[0]?.entry_time !== undefined
      ? ['date', 'entry_time', 'spx_open', 'spx_close', 'vix', 'short_strike', 'long_strike', 'credit', 'pnl', 'cumulative', 'exit_reason', 'contracts']
      : ['date', 'spx_open', 'spx_close', 'vix', 'short_strike', 'long_strike', 'credit', 'pnl', 'cumulative', 'exit_reason', 'contracts']
    const lines = [...meta, cols.join(','), ...trades.map(t => cols.map(c => esc(t[c])).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backtest_${result.strategy}_${result.start_date}_${result.end_date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
                <Label className="text-gray-400 text-xs">Bot — auto-fills strategy & parameters</Label>
                <select
                  value={form.bot_id}
                  onChange={e => handleBotChange(e.target.value)}
                  className="w-full bg-[#0a0e1a] border border-[#1e2a3a] rounded-md px-3 py-2 text-sm text-white"
                >
                  <option value="">— Run without a bot —</option>
                  {bots.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Strategy{selectedBot ? ' (set by bot)' : ''}</Label>
                <select
                  value={form.strategy}
                  onChange={e => handleStrategyChange(e.target.value)}
                  disabled={!!selectedBot}
                  className={`w-full bg-[#0a0e1a] border border-[#1e2a3a] rounded-md px-3 py-2 text-sm text-white ${selectedBot ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {STRATEGY_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
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
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">Trade Parameters</p>
                {selectedBot && (
                  <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    Loaded from <strong>{selectedBot.name}</strong> — edit below to override for this backtest
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(STRATEGY_PARAMS[form.strategy] || STRATEGY_PARAMS.credit_spread).map(p => (
                  <div key={p.key} className="space-y-1">
                    <Label className="text-gray-400 text-xs">
                      {p.key === 'entry_time' && useVixRules ? 'Entry Time (fallback, VIX ≥ all below)' : p.label}
                    </Label>
                    <Input
                      type={p.type === 'time' ? 'time' : 'number'}
                      step={p.step}
                      min={p.min}
                      max={p.max}
                      value={tradeParams[p.key] ?? ''}
                      onChange={e => setTradeParams(prev => ({
                        ...prev,
                        [p.key]: p.type === 'time' ? e.target.value : +e.target.value,
                      }))}
                      className="bg-[#0a0e1a] border-[#1e2a3a] text-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Iron Fly only: VIX-regime entry timing */}
            {form.strategy === 'iron_fly' && (
              <div className="border-t border-[#1e2a3a] pt-4">
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={useVixRules}
                    onChange={e => {
                      const on = e.target.checked
                      setUseVixRules(on)
                      if (on && vixRules.length === 0) setVixRules([{ vix_below: 15, entry_time: '09:45' }])
                    }}
                    className="accent-blue-500"
                  />
                  Vary entry time by VIX regime
                </label>
                {useVixRules && (
                  <div className="mt-3 space-y-2">
                    {/* Rules fire lowest threshold first — the first one a
                        day's VIX qualifies under wins, so they form bands
                        rather than independent conditions. Display them in
                        that evaluation order and show each row's implied
                        lower bound (the previous row's threshold) so the
                        band each row actually covers is visible, not just
                        its upper edge. Editing still targets the rule's
                        original index so typing doesn't reorder mid-edit. */}
                    {vixRules
                      .map((rule, originalIndex) => ({ rule, originalIndex }))
                      .sort((a, b) => a.rule.vix_below - b.rule.vix_below)
                      .map(({ rule, originalIndex }, pos, sorted) => {
                        const lowerBound = pos === 0 ? null : sorted[pos - 1].rule.vix_below
                        return (
                          <div key={originalIndex} className="flex items-center gap-2 text-sm">
                            <span className="text-gray-400 whitespace-nowrap">
                              {lowerBound !== null ? `If ${lowerBound} ≤ VIX <` : 'If VIX <'}
                            </span>
                            <Input
                              type="number" step={0.5} min={1} max={100}
                              value={rule.vix_below}
                              onChange={e => updateVixRule(originalIndex, { vix_below: +e.target.value })}
                              className="w-20 bg-[#0a0e1a] border-[#1e2a3a] text-white"
                            />
                            <span className="text-gray-400 whitespace-nowrap">enter at</span>
                            <Input
                              type="time"
                              value={rule.entry_time}
                              onChange={e => updateVixRule(originalIndex, { entry_time: e.target.value })}
                              className="w-32 bg-[#0a0e1a] border-[#1e2a3a] text-white"
                            />
                            <button
                              onClick={() => removeVixRule(originalIndex)}
                              className="text-gray-500 hover:text-red-400 text-xs px-1"
                              title="Remove rule"
                            >✕</button>
                          </div>
                        )
                      })}
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={addVixRule} className="text-xs text-blue-400 hover:text-blue-300">
                        + Add VIX threshold
                      </button>
                      <span className="text-xs text-gray-500">
                        {vixRules.length > 0
                          ? `Otherwise (VIX ≥ ${Math.max(...vixRules.map(r => r.vix_below))}) enters at the Entry Time field above (${String(tradeParams.entry_time ?? '10:45')}).`
                          : `Otherwise enters at the Entry Time field above (${String(tradeParams.entry_time ?? '10:45')}).`}
                        {' '}Each row covers VIX from the row above's threshold up to its own.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleRun} disabled={loading} className="gap-2">
              <FlaskConical size={16} /> {loading ? 'Fetching data & running…' : 'Run Backtest'}
            </Button>
            {loading && (
              <p className="text-xs text-gray-500">Fetching SPX + VIX data and running simulation…</p>
            )}
          </CardContent>
        </Card>

        {result?.is_synthetic && (
          <div className="bg-red-900/30 border border-red-600/40 rounded-lg px-4 py-3 text-red-300 text-sm">
            ⛔ <strong>SYNTHETIC DATA — results are NOT based on real market prices.</strong> Every
            data provider failed{result.data_errors?.length ? `: ${result.data_errors.join('; ')}` : ''}.
            These numbers come from a random-walk model and must not inform trading decisions.
          </div>
        )}
        {result && !result.is_synthetic && result.intraday_source === 'synthetic_bridge' && (
          <div className="bg-orange-900/30 border border-orange-600/40 rounded-lg px-4 py-3 text-orange-300 text-sm">
            ⚠️ <strong>APPROXIMATED INTRADAY PATH — stop-loss/take-profit timing is not reliable.</strong>{' '}
            No 1-minute data provider was available for this range, so each day's intraday walk between
            open and close is a randomized reconstruction: it's guaranteed to touch that day's real high
            and low <em>somewhere</em>, but not necessarily at the time your entry was actually open. A
            trade that looks like it exited calmly here (e.g. max-hold) may have really hit a stop-loss
            during your entry window in the real market, or vice versa — daily P&amp;L direction is still
            anchored to real SPX/VIX prices, but intraday stop/target timing is not. Don't size risk off
            these numbers until a real intraday provider is configured.
            {result.data_errors?.length > 0 && <div className="mt-1 text-orange-400/80">Provider errors: {result.data_errors.join('; ')}</div>}
          </div>
        )}
        {result && !result.is_synthetic && (
          <div className="text-xs text-gray-500">
            Data sources: daily via <span className="text-gray-300">{result.daily_source}</span>
            {result.intraday_source && (
              <> · intraday via <span className={result.intraday_source === 'synthetic_bridge' ? 'text-orange-400' : 'text-gray-300'}>
                {result.intraday_source === 'synthetic_bridge' ? 'synthetic bridge (see warning above)' : result.intraday_source}
              </span></>
            )}
            {result.data_errors?.length > 0 && result.intraday_source !== 'synthetic_bridge' && <> · failed: {result.data_errors.join('; ')}</>}
          </div>
        )}

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
                <div className="flex items-center gap-3">
                  <button onClick={downloadCsv}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-[#1e2a3a] text-gray-300 hover:text-white hover:border-gray-600">
                    <Download size={13} /> Download CSV
                  </button>
                  {trades.length > 20 && (
                    <button onClick={() => setShowAllTrades(v => !v)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                      {showAllTrades ? <><ChevronUp size={14} /> Show last 20</> : <><ChevronDown size={14} /> Show all {trades.length}</>}
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1e2a3a] text-gray-400">
                        <th className="text-left p-3">Date</th>
                        {trades[0]?.entry_time !== undefined && <th className="text-left p-3">Entry</th>}
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
                          {t.entry_time !== undefined && <td className="p-3 text-gray-400">{t.entry_time}</td>}
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
