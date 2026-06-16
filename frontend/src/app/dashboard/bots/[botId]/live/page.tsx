"use client"
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { botRunnerApi, botsApi } from '@/lib/api'
import { toast } from 'sonner'
import { Play, Square, Loader2, Info } from 'lucide-react'

interface Position {
  symbol?: string; position?: string | number; qty?: string | number
  avgCost?: string | number; avg_cost?: string | number
  mktValue?: string | number; mkt_value?: string | number
  unrealPnL?: string | number; unreal_pnl?: string | number
  [key: string]: unknown
}
interface TradeEntry {
  time?: string; timestamp?: string; action?: string; symbol?: string
  qty?: string | number; price?: string | number; pnl?: string | number
  [key: string]: unknown
}

const riskColors: Record<string, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/20 text-red-400',
}

const categoryLabels: Record<string, string> = {
  credit_spread: 'Credit Spread', iron_condor: 'Iron Condor',
  iron_fly: 'Iron Fly', butterfly: 'Butterfly',
  pmcc: 'PMCC', calendar: 'Calendar', custom: 'Custom',
}

// Per-category parameter definitions
const PARAM_DEFS: Record<string, { key: string; label: string; type: 'number' | 'select'; min?: number; max?: number; step?: number; options?: { value: string; label: string }[]; tooltip: string }[]> = {
  credit_spread: [
    { key: 'contracts', label: 'Contracts', type: 'number', min: 1, max: 50, step: 1, tooltip: 'Number of spread contracts per trade' },
    { key: 'spread_width', label: 'Spread Width (pts)', type: 'number', min: 1, max: 50, step: 1, tooltip: 'Distance between long and short strike in points' },
    { key: 'short_strike_delta', label: 'Short Strike Delta', type: 'number', min: 0.05, max: 0.50, step: 0.01, tooltip: 'Target delta for the short leg (e.g. 0.20 = 20 delta)' },
    { key: 'max_loss_per_trade', label: 'Max Loss Per Trade ($)', type: 'number', min: 100, max: 10000, step: 50, tooltip: 'Maximum dollar loss before the bot exits the trade' },
    { key: 'take_profit_pct', label: 'Take Profit (%)', type: 'number', min: 10, max: 100, step: 5, tooltip: 'Close trade when this % of max profit is reached' },
    { key: 'max_trades_per_day', label: 'Max Trades / Day', type: 'number', min: 1, max: 10, step: 1, tooltip: 'Maximum number of entries allowed per trading day' },
  ],
  iron_condor: [
    { key: 'contracts', label: 'Contracts', type: 'number', min: 1, max: 50, step: 1, tooltip: 'Number of condor contracts' },
    { key: 'wing_width', label: 'Wing Width (pts)', type: 'number', min: 5, max: 100, step: 5, tooltip: 'Width of each spread leg' },
    { key: 'target_delta', label: 'Target Delta', type: 'number', min: 0.05, max: 0.30, step: 0.01, tooltip: 'Delta for both short strikes' },
    { key: 'profit_target_pct', label: 'Take Profit (%)', type: 'number', min: 10, max: 75, step: 5, tooltip: 'Close at this % of max credit' },
    { key: 'stop_loss_pct', label: 'Stop Loss (%)', type: 'number', min: 100, max: 300, step: 25, tooltip: 'Exit when loss = this % of credit received' },
  ],
  iron_fly: [
    { key: 'contracts', label: 'Contracts', type: 'number', min: 1, max: 50, step: 1, tooltip: 'Number of iron fly contracts' },
    { key: 'wing_width', label: 'Wing Width (pts)', type: 'number', min: 10, max: 100, step: 5, tooltip: 'Distance from ATM to long strike' },
    { key: 'profit_target_pct', label: 'Take Profit (%)', type: 'number', min: 10, max: 50, step: 5, tooltip: 'Close at this % of max credit' },
    { key: 'stop_loss_pct', label: 'Stop Loss (%)', type: 'number', min: 100, max: 300, step: 25, tooltip: 'Exit at this % loss of credit received' },
  ],
  butterfly: [
    { key: 'contracts', label: 'Contracts', type: 'number', min: 1, max: 20, step: 1, tooltip: 'Number of butterfly contracts' },
    { key: 'profit_target_pct', label: 'Take Profit (%)', type: 'number', min: 50, max: 200, step: 10, tooltip: 'Close at this % return on debit paid' },
    { key: 'stop_loss_pct', label: 'Stop Loss (%)', type: 'number', min: 50, max: 100, step: 10, tooltip: 'Exit at this % loss of debit paid' },
  ],
}

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  credit_spread: { contracts: 2, spread_width: 5, short_strike_delta: 0.20, max_loss_per_trade: 500, take_profit_pct: 50, max_trades_per_day: 4 },
  iron_condor:   { contracts: 1, wing_width: 25, target_delta: 0.10, profit_target_pct: 50, stop_loss_pct: 200 },
  iron_fly:      { contracts: 1, wing_width: 50, profit_target_pct: 25, stop_loss_pct: 150 },
  butterfly:     { contracts: 1, profit_target_pct: 100, stop_loss_pct: 100 },
}

export default function LiveBotPage() {
  const params = useParams()
  const botId = params?.botId as string

  const [bot, setBot] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [pid, setPid] = useState<number | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [tradeLog, setTradeLog] = useState<TradeEntry[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [tradeParams, setTradeParams] = useState<Record<string, number>>({})
  const [showParams, setShowParams] = useState(true)

  useEffect(() => {
    if (!botId) return
    botsApi.get(botId)
      .then(r => {
        setBot(r.data)
        const category = r.data.category || 'credit_spread'
        const defaults = DEFAULT_PARAMS[category] || DEFAULT_PARAMS.credit_spread
        // Merge any saved config into defaults
        const saved = r.data.configuration || {}
        const merged: Record<string, number> = { ...defaults }
        Object.keys(defaults).forEach(k => { if (saved[k] !== undefined) merged[k] = saved[k] })
        setTradeParams(merged)
      })
      .catch(() => {})
  }, [botId])

  const fetchStatus = useCallback(async () => {
    if (!botId) return
    try {
      const res = await botRunnerApi.status(botId)
      setRunning(res.data.running)
      setPid(res.data.pid)
    } catch {}
  }, [botId])

  const fetchPositions = useCallback(async () => {
    if (!botId) return
    try { const res = await botRunnerApi.positions(botId); setPositions(Array.isArray(res.data) ? res.data : []) }
    catch { setPositions([]) }
  }, [botId])

  const fetchTradeLog = useCallback(async () => {
    if (!botId) return
    try { const res = await botRunnerApi.tradeLog(botId); setTradeLog(Array.isArray(res.data) ? res.data : []) }
    catch { setTradeLog([]) }
  }, [botId])

  useEffect(() => {
    fetchStatus(); fetchPositions(); fetchTradeLog()
    const s = setInterval(fetchStatus, 5000)
    const d = setInterval(() => { fetchPositions(); fetchTradeLog() }, 10000)
    return () => { clearInterval(s); clearInterval(d) }
  }, [fetchStatus, fetchPositions, fetchTradeLog])

  const handleStart = async () => {
    setActionLoading(true)
    try {
      const res = await botRunnerApi.startWithParams(botId, tradeParams)
      setRunning(true); setPid(res.data.pid)
      setShowParams(false)
      toast.success(`Bot started (PID ${res.data.pid})`)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to start bot')
    } finally { setActionLoading(false) }
  }

  const handleStop = async () => {
    setActionLoading(true)
    try {
      await botRunnerApi.stop(botId)
      setRunning(false); setPid(null)
      setShowParams(true)
      toast.success('Bot stopped')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to stop bot')
    } finally { setActionLoading(false) }
  }

  const category = bot?.category || 'credit_spread'
  const paramDefs = PARAM_DEFS[category] || PARAM_DEFS.credit_spread

  return (
    <div className="flex flex-col h-full">
      <Header title="Live Bot Monitor" />
      <div className="flex-1 p-6 space-y-4">

        {/* Bot Info Header */}
        {bot && (
          <Card className="bg-[#0f1623] border-[#1e2a3a]">
            <CardContent className="pt-5 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-white font-semibold text-lg">{bot.name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColors[bot.risk_level] || riskColors.medium}`}>
                      {bot.risk_level} risk
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                      {categoryLabels[bot.category] || bot.category}
                    </span>
                    {bot.configuration?.symbol && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-mono">
                        {bot.configuration.symbol}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm max-w-2xl">{bot.description}</p>
                  {bot.schedule_cron && (
                    <p className="text-xs text-gray-600 font-mono">Schedule: {bot.schedule_cron}</p>
                  )}
                </div>

                {/* Status + controls */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                    running ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                    {running ? 'Running' : 'Stopped'}
                  </span>
                  {pid && <span className="text-xs text-gray-500">PID {pid}</span>}
                  {running ? (
                    <Button variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                      onClick={handleStop} disabled={actionLoading}>
                      {actionLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Square size={14} className="mr-1" />}
                      Stop Bot
                    </Button>
                  ) : (
                    <Button className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleStart} disabled={actionLoading}>
                      {actionLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
                      Start Bot
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trade Parameters */}
        {(showParams || !running) && (
          <Card className="bg-[#0f1623] border-[#1e2a3a]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-white">Trade Parameters</CardTitle>
                {running && (
                  <button onClick={() => setShowParams(v => !v)} className="text-xs text-gray-500 hover:text-gray-300">
                    {showParams ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500">These values are passed to the bot on start. Stop and restart to apply changes.</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {paramDefs.map(def => (
                  <div key={def.key} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">{def.label}</Label>
                      <span title={def.tooltip} className="text-gray-600 hover:text-gray-400 cursor-help">
                        <Info size={11} />
                      </span>
                    </div>
                    <Input
                      type="number"
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      value={tradeParams[def.key] ?? ''}
                      onChange={e => setTradeParams(p => ({ ...p, [def.key]: parseFloat(e.target.value) || 0 }))}
                      disabled={running}
                      className="bg-[#0a0e1a] border-[#1e2a3a] text-sm disabled:opacity-50"
                    />
                    <p className="text-xs text-gray-600">{def.tooltip}</p>
                  </div>
                ))}
              </div>
              {running && (
                <p className="text-xs text-yellow-400/70 mt-4 bg-yellow-500/10 rounded px-3 py-2">
                  Parameters are locked while the bot is running. Stop the bot to edit.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Open Positions */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white">Open Positions</CardTitle></CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">No open positions</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-[#1e2a3a]">
                      <th className="text-left py-2 pr-4">Symbol</th>
                      <th className="text-right py-2 pr-4">Qty</th>
                      <th className="text-right py-2 pr-4">Avg Cost</th>
                      <th className="text-right py-2 pr-4">Mkt Value</th>
                      <th className="text-right py-2">Unreal PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos, i) => {
                      const unrealPnl = Number(pos.unrealPnL ?? pos.unreal_pnl ?? 0)
                      return (
                        <tr key={i} className="border-b border-[#1e2a3a]/50 text-gray-200">
                          <td className="py-2 pr-4 font-mono">{String(pos.symbol ?? '—')}</td>
                          <td className="py-2 pr-4 text-right">{String(pos.qty ?? '—')}</td>
                          <td className="py-2 pr-4 text-right">{String(pos.avgCost ?? pos.avg_cost ?? '—')}</td>
                          <td className="py-2 pr-4 text-right">{String(pos.mktValue ?? pos.mkt_value ?? '—')}</td>
                          <td className={`py-2 text-right ${unrealPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {String(pos.unrealPnL ?? pos.unreal_pnl ?? '—')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trade Log */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white">Trade Log</CardTitle></CardHeader>
          <CardContent>
            {tradeLog.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">No trades today</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-[#1e2a3a]">
                      <th className="text-left py-2 pr-4">Time</th>
                      <th className="text-left py-2 pr-4">Action</th>
                      <th className="text-left py-2 pr-4">Symbol</th>
                      <th className="text-right py-2 pr-4">Qty</th>
                      <th className="text-right py-2 pr-4">Price</th>
                      <th className="text-right py-2">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeLog.map((trade, i) => {
                      const pnl = Number(trade.pnl ?? 0)
                      return (
                        <tr key={i} className="border-b border-[#1e2a3a]/50 text-gray-200">
                          <td className="py-2 pr-4 text-gray-400 text-xs">{String(trade.time ?? trade.timestamp ?? '—')}</td>
                          <td className="py-2 pr-4">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              String(trade.action).toUpperCase() === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>{String(trade.action ?? '—')}</span>
                          </td>
                          <td className="py-2 pr-4 font-mono">{String(trade.symbol ?? '—')}</td>
                          <td className="py-2 pr-4 text-right">{String(trade.qty ?? '—')}</td>
                          <td className="py-2 pr-4 text-right">{String(trade.price ?? '—')}</td>
                          <td className={`py-2 text-right ${trade.pnl !== undefined ? (pnl >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`}>
                            {trade.pnl !== undefined ? String(trade.pnl) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
