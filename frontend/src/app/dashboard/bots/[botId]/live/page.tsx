"use client"
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { botRunnerApi, botsApi } from '@/lib/api'
import { toast } from 'sonner'
import { Play, Square, Loader2, Info, AlertTriangle, X } from 'lucide-react'
import BotScheduleCard from '@/components/bots/BotScheduleCard'
import BotTradeLog, { countTradeGroups } from '@/components/bots/BotTradeLog'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Position {
  symbol?: string; localSymbol?: string; local_symbol?: string
  position?: string | number; qty?: string | number; pos?: string | number
  avgCost?: string | number; avg_cost?: string | number; averageCost?: string | number
  mktValue?: string | number; mkt_value?: string | number; marketValue?: string | number
  unrealPnL?: string | number; unreal_pnl?: string | number; unrealizedPNL?: string | number; unrealized_pnl?: string | number
  [key: string]: unknown
}
interface TradeEntry {
  time?: string; timestamp?: string; action?: string; symbol?: string
  qty?: string | number; price?: string | number; pnl?: string | number
  credit?: string | number; filled_price?: string | number
  [key: string]: unknown
}

function fmtTime(raw?: string): string {
  if (!raw) return '—'
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw.length > 19 ? raw.slice(11, 19) : raw
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York', hour12: true })
  } catch { return raw }
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

const PARAM_DEFS: Record<string, { key: string; label: string; unit?: string; min?: number; max?: number; step?: number; type?: 'time'; tooltip: string }[]> = {
  credit_spread: [
    { key: 'contracts',          label: 'Contracts',       min: 1,    max: 50,    step: 1,    tooltip: 'Number of spread contracts per trade' },
    { key: 'spread_width',       label: 'Spread Width',    unit: 'pts', min: 1,  max: 50,    step: 1,    tooltip: 'Distance between long and short strike in index points' },
    { key: 'short_strike_delta', label: 'Short Δ',         min: 0.05, max: 0.50, step: 0.01, tooltip: 'Target delta for the short leg (0.20 = 20Δ, further OTM = lower Δ)' },
    { key: 'take_profit_pct',    label: 'Take Profit',     unit: '% of credit', min: 10, max: 100, step: 5, tooltip: 'Close when P&L reaches this % of opening credit received' },
    { key: 'max_loss_per_trade', label: 'Max Loss',        unit: '$', min: 100,  max: 10000, step: 50,   tooltip: 'Hard dollar stop — exit if unrealised loss reaches this' },
    { key: 'max_trades_per_day', label: 'Max Trades/Day',  min: 1,    max: 10,   step: 1,    tooltip: 'Maximum new entries allowed per trading day' },
    { key: 'entry_start',        label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',          label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
  iron_condor: [
    { key: 'contracts',        label: 'Contracts',     min: 1,    max: 50,   step: 1,    tooltip: 'Number of condor contracts per trade' },
    { key: 'wing_width',       label: 'Wing Width',    unit: 'pts', min: 5, max: 100,  step: 5,    tooltip: 'Width of each spread leg in index points' },
    { key: 'target_delta',     label: 'Short Δ',       min: 0.05, max: 0.30, step: 0.01, tooltip: 'Target delta for both short strikes (call and put sides)' },
    { key: 'profit_target_pct',label: 'Take Profit',   unit: '% of credit', min: 10, max: 75,  step: 5, tooltip: 'Close entire condor when P&L reaches this % of credit received' },
    { key: 'stop_loss_pct',    label: 'Stop Loss',     unit: '% of credit', min: 100, max: 300, step: 25, tooltip: 'Exit when loss = this % of credit received (200 = 2× credit)' },
    { key: 'entry_start',      label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',        label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
  iron_fly: [
    { key: 'contracts',        label: 'Contracts',   min: 1,    max: 50,   step: 1,    tooltip: 'Number of iron fly contracts per trade' },
    { key: 'wing_width',       label: 'Wing Width',  unit: 'pts', min: 10, max: 100, step: 5,    tooltip: 'Distance from ATM short strike to long wing' },
    { key: 'profit_target_pct',label: 'Take Profit', unit: '% of credit', min: 10, max: 50, step: 5, tooltip: 'Close when P&L reaches this % of opening credit' },
    { key: 'stop_loss_pct',    label: 'Stop Loss',   unit: '% of credit', min: 100, max: 300, step: 25, tooltip: 'Exit when loss = this % of opening credit received' },
    { key: 'entry_start',      label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',        label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
  butterfly: [
    { key: 'contracts',        label: 'Contracts',   min: 1,  max: 20,  step: 1,  tooltip: 'Number of butterfly contracts per trade' },
    { key: 'profit_target_pct',label: 'Take Profit', unit: '% of debit', min: 50, max: 200, step: 10, tooltip: 'Close when profit = this % of debit paid to enter' },
    { key: 'stop_loss_pct',    label: 'Stop Loss',   unit: '% of debit', min: 50, max: 100, step: 10, tooltip: 'Exit when loss = this % of debit paid' },
    { key: 'entry_start',      label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',        label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
}

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  credit_spread: { contracts: 2, spread_width: 5, short_strike_delta: 0.20, take_profit_pct: 50, max_loss_per_trade: 500, max_trades_per_day: 4 },
  iron_condor:   { contracts: 1, wing_width: 25, target_delta: 0.10, profit_target_pct: 50, stop_loss_pct: 200 },
  iron_fly:      { contracts: 1, wing_width: 50, profit_target_pct: 25, stop_loss_pct: 150 },
  butterfly:     { contracts: 1, profit_target_pct: 100, stop_loss_pct: 100 },
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function ConfirmStartModal({ bot, params, timeParams, paramDefs, forceEntry, onConfirm, onCancel, loading }: {
  bot: any; params: Record<string, number>; timeParams: Record<string, string>
  paramDefs: typeof PARAM_DEFS[string]; forceEntry: boolean
  onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  const [agreed, setAgreed] = useState(false)
  const isPaper = bot?.configuration?.paper_trading !== false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-[#1e2a3a]">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" /> Confirm Bot Start
          </h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Mode badge */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isPaper ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {isPaper ? '🟡 SIMULATED — Paper Trading (no real money)' : '🔴 LIVE TRADING — Real capital at risk'}
          </div>

          {/* Parameters summary */}
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">You are starting with these parameters:</p>
            <div className="bg-[#0a0e1a] rounded-lg p-3 grid grid-cols-2 gap-2">
              {paramDefs.map(d => (
                <div key={d.key} className="flex justify-between text-xs">
                  <span className="text-gray-400">{d.label}{d.unit ? ` (${d.unit})` : ''}</span>
                  <span className="text-white font-medium">
                    {d.type === 'time' ? (timeParams[d.key] ?? '—') : (params[d.key] ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Force Entry warning */}
          {forceEntry && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs border border-orange-500/40 bg-orange-500/10 text-orange-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span><strong>Force Entry (Test Mode) is ON.</strong> All bias, confidence, OR width, and readiness filters are bypassed. Disable before live trading.</span>
            </div>
          )}

          {/* Compliance checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 accent-blue-500"
            />
            <span className="text-xs text-gray-300 leading-relaxed">
              I confirm these parameters are correct and I accept full responsibility for all trades placed by this bot.
              {!isPaper && <strong className="text-red-400"> This will trade with real capital.</strong>}
            </span>
          </label>
        </div>

        <div className="flex gap-2 p-4 border-t border-[#1e2a3a]">
          <Button variant="outline" className="flex-1 border-[#1e2a3a]" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            className={`flex-1 ${isPaper ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} text-white`}
            onClick={onConfirm}
            disabled={!agreed || loading}
          >
            {loading ? <><Loader2 size={14} className="mr-1 animate-spin" /> Starting…</> : isPaper ? 'Start Simulation' : 'Start Live Trading'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function BotProcessLog({ lines, running, show, onToggle, onClear, onRefresh }: {
  lines: string[]; running: boolean; show: boolean; onToggle: () => void; onClear: () => void; onRefresh: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolledUp, setScrolledUp] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Auto-scroll to bottom only when user is already at bottom
  useEffect(() => {
    if (!show || scrolledUp) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, show, scrolledUp])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 40)
  }

  const jumpToBottom = () => {
    setScrolledUp(false)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  return (
    <Card className="bg-[#0f1623] border-[#1e2a3a]">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-sm text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              {running && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
              Process Log
            </span>
            {lines.length > 0 && (
              <span className="text-xs bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded-full">{lines.length} lines</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            {scrolledUp && (
              <button onClick={jumpToBottom} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                ↓ Latest
              </button>
            )}
            <button
              onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false) }}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Refresh log"
            >
              <Loader2 size={13} className={refreshing ? 'animate-spin text-blue-400' : ''} />
            </button>
            {lines.length > 0 && (
              <button onClick={onClear} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                Clear
              </button>
            )}
            <button onClick={onToggle} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      {show && (
        <CardContent className="px-0 pb-2">
          <div ref={scrollRef} onScroll={handleScroll} className="bg-[#060a12] mx-3 rounded-lg p-3 h-56 overflow-y-auto font-mono text-xs space-y-0.5">
            {lines.length === 0 ? (
              <p className="text-gray-600 text-center py-4">
                {running
                  ? 'Bot is running — log output appears here within seconds…'
                  : 'No log output. Start the bot to see live output.'}
              </p>
            ) : (
              <>
                {lines.map((line, i) => {
                  const isSep     = /^━+$/.test(line.trim())
                  const isHeader  = /^\s*(ORDER CONTEXT|ENTRY CONTEXT)/i.test(line)
                  const isSkip    = /⛔|SKIPPED/i.test(line)
                  const isError   = /error|exception|traceback|critical|failed to/i.test(line)
                  const isWarn    = /warn|warning/i.test(line)
                  const isEntry   = /entry time|short leg|long leg|filled credit|order id|entry type|limit price|max risk|expiration|quantity/i.test(line)
                  const isExit    = /exit time|realized p&l|hold time/i.test(line)
                  const isContext = /spx:|bias:|confidence:|recommendation:|vix:|readiness:|dte:|vix9d/i.test(line)
                  const isOk      = /connected|placed|filled|profit|success/i.test(line)

                  const cls = isSep     ? 'text-[#1e3a5a] select-none' :
                              isHeader  ? 'text-cyan-400 font-bold mt-1' :
                              isSkip    ? 'text-orange-400' :
                              isError   ? 'text-red-400' :
                              isWarn    ? 'text-yellow-300' :
                              isEntry   ? 'text-emerald-300' :
                              isExit    ? 'text-blue-300' :
                              isContext ? 'text-sky-300' :
                              isOk      ? 'text-green-400' :
                              'text-gray-400'
                  return <div key={i} className={cls}>{line || ' '}</div>
                })}
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default function LiveBotPage() {
  const params = useParams()
  const botId = params?.botId as string

  const [bot, setBot] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [pid, setPid] = useState<number | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [tradeLog, setTradeLog] = useState<TradeEntry[]>([])
  const [botLog, setBotLog] = useState<string[]>([])
  const logClearedRef = useRef(false)
  const [showLog, setShowLog] = useState(true)  // default open
  const [actionLoading, setActionLoading] = useState(false)
  const [tradeParams, setTradeParams] = useState<Record<string, number>>({})
  const [timeParams, setTimeParams] = useState<Record<string, string>>({ entry_start: '09:30', entry_end: '15:45' })
  const [botDefaults, setBotDefaults] = useState<Record<string, number>>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [diagReport, setDiagReport] = useState<any>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [ibkrPaper, setIbkrPaper] = useState<boolean>(true)  // reflects saved IBKR credentials
  const [isAdmin, setIsAdmin] = useState(false)
  const [diagnoseMode, setDiagnoseMode] = useState(false)
  const [forceEntry, setForceEntry] = useState(false)

  const runDiagnose = async () => {
    setDiagLoading(true)
    setDiagReport(null)
    try {
      const { api } = await import('@/lib/api')
      const r = await api.get(`/api/v1/bot-runner/${botId}/diagnose`)
      setDiagReport(r.data)
    } catch (e: any) {
      setDiagReport({ error: e?.response?.data?.detail || String(e) })
    } finally {
      setDiagLoading(false)
    }
  }

  // Persist params to localStorage so they survive navigation
  const storageKey = botId ? `bot_params_${botId}` : null

  // Fetch saved IBKR credentials to determine paper vs live mode, and user role
  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get('/api/v1/broker/ibkr').then(r => {
        setIbkrPaper(r.data?.paper_trading !== false)
      }).catch(() => {})
      api.get('/api/v1/users/me').then(r => {
        setIsAdmin(r.data?.role === 'admin')
      }).catch(() => {})
    })
    setDiagnoseMode(localStorage.getItem('diagnose_mode') === 'true')
  }, [])

  useEffect(() => {
    if (!botId) return
    botsApi.get(botId).then(r => {
      setBot(r.data)
      const category = r.data.category || 'credit_spread'
      const defaults = DEFAULT_PARAMS[category] || DEFAULT_PARAMS.credit_spread
      const saved = r.data.configuration || {}
      const botOriginal: Record<string, number> = { ...defaults }
      Object.keys(defaults).forEach(k => { if (saved[k] !== undefined) botOriginal[k] = +saved[k] })
      setBotDefaults(botOriginal)

      // Load user's last-saved params from localStorage; fall back to bot defaults
      const stored = storageKey ? localStorage.getItem(storageKey) : null
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          // Split time strings out of stored params
          const { entry_start, entry_end, ...numericParsed } = parsed
          setTradeParams(numericParsed)
          setTimeParams(tp => ({ ...tp, ...(entry_start ? { entry_start } : {}), ...(entry_end ? { entry_end } : {}) }))
          return
        } catch {}
      }
      setTradeParams(botOriginal)
    }).catch(() => {})
  }, [botId, storageKey])

  // Save to localStorage whenever params change
  const updateParams = (updater: (p: Record<string, number>) => Record<string, number>) => {
    setTradeParams(prev => {
      const next = updater(prev)
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ ...next, ...timeParams }))
      setHasUnsaved(true)
      return next
    })
  }

  const updateTimeParam = (key: string, value: string) => {
    setTimeParams(prev => {
      const next = { ...prev, [key]: value }
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ ...tradeParams, ...next }))
      setHasUnsaved(true)
      return next
    })
  }

  const handleReset = () => {
    setTradeParams(botDefaults)
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(botDefaults))
    setHasUnsaved(false)
    toast.success('Reset to bot default values')
  }

  const fetchStatus = useCallback(async () => {
    if (!botId) return
    try { const r = await botRunnerApi.status(botId); setRunning(r.data.running); setPid(r.data.pid) } catch {}
  }, [botId])

  const fetchPositions = useCallback(async () => {
    if (!botId) return
    try { const r = await botRunnerApi.positions(botId); setPositions(Array.isArray(r.data) ? r.data : []) } catch { setPositions([]) }
  }, [botId])

  const fetchBotLog = useCallback(async () => {
    if (!botId || logClearedRef.current) return
    try {
      const { api } = await import('@/lib/api')
      const r = await api.get(`/api/v1/bot-runner/${botId}/logs?lines=200`)
      setBotLog(r.data.lines || [])
    } catch { setBotLog([]) }
  }, [botId])

  const fetchTradeLog = useCallback(async () => {
    if (!botId) return
    try { const r = await botRunnerApi.tradeLog(botId); setTradeLog(Array.isArray(r.data) ? r.data : []) } catch { setTradeLog([]) }
  }, [botId])

  useEffect(() => {
    fetchStatus(); fetchPositions(); fetchTradeLog(); fetchBotLog()
    const s = setInterval(fetchStatus, 5000)
    const d = setInterval(() => { fetchPositions(); fetchTradeLog() }, 10000)
    const l = setInterval(fetchBotLog, 3000)  // log refreshes fast so nothing is missed
    return () => { clearInterval(s); clearInterval(d) }
    return () => { clearInterval(s); clearInterval(d); clearInterval(l) }
  }, [fetchStatus, fetchPositions, fetchTradeLog, fetchBotLog])

  const handleStart = async () => {
    setActionLoading(true)
    setShowConfirm(false)
    try {
      const res = await botRunnerApi.startWithParams(botId, { ...tradeParams, ...timeParams, ...(forceEntry ? { force_entry: true } : {}) })
      setRunning(true); setPid(res.data.pid)
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
      toast.success('Bot stopped')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to stop bot')
    } finally { setActionLoading(false) }
  }

  const category = bot?.category || 'credit_spread'
  const paramDefs = PARAM_DEFS[category] || PARAM_DEFS.credit_spread
  const isPaper = ibkrPaper  // driven by saved IBKR credentials, not bot config
  const showDebug = isAdmin || diagnoseMode  // admins always; subscribers only in diagnose mode

  return (
    <div className="flex flex-col h-full">
      <Header title="Live Bot Monitor" />
      {showConfirm && bot && (
        <ConfirmStartModal
          bot={bot} params={tradeParams} timeParams={timeParams} paramDefs={paramDefs}
          forceEntry={forceEntry}
          onConfirm={handleStart} onCancel={() => setShowConfirm(false)} loading={actionLoading}
        />
      )}

      <div className="flex-1 p-4 space-y-3 overflow-auto">

        {/* ── Compact bot info header ── */}
        {bot && (
          <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            {/* Left: name, description, badges */}
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-white font-semibold text-base leading-tight">{bot.name}</span>
              {bot.description && (
                <span className="text-xs text-gray-500 leading-snug line-clamp-1">{bot.description}</span>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
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
            </div>

            {/* Right: status + actions */}
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                running ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                {running ? `Running${pid ? ` · PID ${pid}` : ''}` : 'Stopped'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${isPaper ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                {isPaper ? 'Paper' : '⚠ Live'}
              </span>
              {running ? (
                <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10 h-7 text-xs"
                  onClick={handleStop} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} className="mr-1" />}
                  Stop
                </Button>
              ) : (
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                  onClick={() => setShowConfirm(true)} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} className="mr-1" />}
                  Start Bot
                </Button>
              )}
              {showDebug && (
                <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-7 text-xs"
                  onClick={runDiagnose} disabled={diagLoading}>
                  {diagLoading ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  Diagnose
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Diagnostic report ── */}
        {diagReport && (
          <div className="bg-[#060a12] border border-blue-500/20 rounded-xl p-4 mb-1 text-xs font-mono">
            <div className="flex items-center justify-between mb-3">
              <span className="text-blue-400 font-semibold text-sm">Diagnostic Report</span>
              <button onClick={() => setDiagReport(null)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {/* TWS connection */}
              <div className={`flex gap-2 ${diagReport.tws_reachable ? 'text-green-400' : 'text-red-400'}`}>
                <span>{diagReport.tws_reachable ? '✓' : '✗'}</span>
                <span>TWS {diagReport.tws_address}: {diagReport.tws_reachable ? 'reachable' : `UNREACHABLE — ${diagReport.tws_error}`}</span>
              </div>
              {/* GitHub token */}
              <div className={`flex gap-2 ${diagReport.github_token === 'SET' ? 'text-green-400' : 'text-red-400'}`}>
                <span>{diagReport.github_token === 'SET' ? '✓' : '✗'}</span>
                <span>GITHUB_TOKEN: {diagReport.github_token}</span>
              </div>
              {/* Runner file */}
              <div className={`flex gap-2 ${diagReport.runner_exists ? 'text-green-400' : 'text-yellow-400'}`}>
                <span>{diagReport.runner_exists ? '✓' : '⚠'}</span>
                <span>runner.py: {diagReport.runner_exists ? `found at ${diagReport.runner_path}` : `NOT FOUND at ${diagReport.runner_path}`}</span>
              </div>
              {/* Process alive */}
              <div className={`flex gap-2 ${diagReport.process_alive ? 'text-green-400' : 'text-red-400'}`}>
                <span>{diagReport.process_alive ? '✓' : '✗'}</span>
                <span>Process PID {diagReport.pid}: {diagReport.process_alive ? 'alive' : 'DEAD (crashed or not started)'}</span>
              </div>
              {/* Packages */}
              {diagReport.packages && Object.entries(diagReport.packages).map(([pkg, status]: any) => (
                <div key={pkg} className={`flex gap-2 ${status === 'OK' ? 'text-gray-500' : 'text-red-400'}`}>
                  <span>{status === 'OK' ? '✓' : '✗'}</span>
                  <span>{pkg}: {status}</span>
                </div>
              ))}
              {/* Bot log tail */}
              {diagReport.bot_log_last_30?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#1e2a3a]">
                  <div className="text-gray-400 mb-1">Last log lines:</div>
                  {diagReport.bot_log_last_30.map((line: string, i: number) => {
                    const isErr = /error|exception|traceback|failed/i.test(line)
                    return <div key={i} className={isErr ? 'text-red-400' : 'text-gray-400'}>{line || ' '}</div>
                  })}
                </div>
              )}
              {diagReport.bot_log_note && (
                <div className="text-yellow-400 mt-2">{diagReport.bot_log_note}</div>
              )}
            </div>
          </div>
        )}

        {/* ── Two-column layout: params | positions+log ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3 items-stretch">

          {/* Left: Trade Parameters */}
          <div className="flex flex-col gap-3">
            <Card className="bg-[#0f1623] border-[#1e2a3a] flex-1">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm text-white">Your Trade Parameters</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {running ? 'Locked while running — stop bot to edit.' : 'Set before starting. You will confirm before the bot executes.'}
                </p>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-2 space-y-0">
                {paramDefs.map(def => {
                  const isTime = def.type === 'time'
                  const current = isTime ? timeParams[def.key] : tradeParams[def.key]
                  const original = isTime ? undefined : botDefaults[def.key]
                  const changed = !isTime && original !== undefined && current !== original
                  return (
                    <div key={def.key} className="py-1.5 border-b border-[#1e2a3a]/50 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs text-gray-300 truncate">{def.label}</span>
                          {def.unit && <span className="text-xs text-gray-600 shrink-0">({def.unit})</span>}
                          <span title={def.tooltip} className="text-gray-600 hover:text-gray-400 cursor-help shrink-0 ml-0.5">
                            <Info size={10} />
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {changed && !running && (
                            <span className="text-xs text-gray-600" title={`Bot default: ${original}`}>
                              was {original}
                            </span>
                          )}
                          {isTime ? (
                            <input
                              type="time"
                              value={String(current ?? '')}
                              onChange={e => updateTimeParam(def.key, e.target.value)}
                              disabled={running}
                              className="w-24 bg-[#0a0e1a] border border-[#1e2a3a] rounded-md px-2 py-1 text-xs text-white disabled:opacity-40 focus:outline-none focus:border-blue-500/50"
                            />
                          ) : (
                            <input
                              type="number"
                              min={def.min}
                              max={def.max}
                              step={def.step}
                              value={current ?? ''}
                              onChange={e => updateParams(p => ({ ...p, [def.key]: parseFloat(e.target.value) || 0 }))}
                              disabled={running}
                              className={`w-20 bg-[#0a0e1a] border rounded-md px-2 py-1 text-xs text-white text-left disabled:opacity-40 focus:outline-none focus:border-blue-500/50 ${changed && !running ? 'border-blue-500/40' : 'border-[#1e2a3a]'}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Force Entry test mode toggle */}
                <div className={`mt-3 rounded-lg border px-3 py-2.5 ${forceEntry ? 'border-orange-500/40 bg-orange-500/10' : 'border-[#1e2a3a]'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={12} className={forceEntry ? 'text-orange-400' : 'text-gray-600'} />
                      <span className={`text-xs font-medium ${forceEntry ? 'text-orange-400' : 'text-gray-500'}`}>
                        Force Entry (Test Mode)
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={forceEntry}
                        disabled={running}
                        onChange={e => setForceEntry(e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-gray-600 peer-focus:ring-1 peer-focus:ring-orange-500 rounded-full peer peer-checked:bg-orange-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4 peer-disabled:opacity-40" />
                    </label>
                  </div>
                  {forceEntry && (
                    <p className="text-xs text-orange-400/70 mt-1.5">
                      Skips all bias, confidence, OR width and readiness filters. For testing only — disable before live trading.
                    </p>
                  )}
                </div>

                <div className="pt-3 flex items-center justify-between gap-2">
                  {hasUnsaved && !running ? (
                    <button onClick={handleReset}
                      className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors">
                      Reset to bot defaults
                    </button>
                  ) : <span />}
                  {!running && (
                    <p className="text-xs text-gray-600 text-right">
                      You'll confirm before anything runs.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bot Schedule */}
            {botId && (
              <BotScheduleCard botId={botId} />
            )}
          </div>

          {/* Right: Positions + Trade Log */}
          <div className="flex flex-col gap-3">
            {/* Open Positions */}
            <Card className="bg-[#0f1623] border-[#1e2a3a] flex flex-col flex-1">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  Open Positions
                  {positions.filter(p => Number(p.position ?? p.qty ?? p.pos ?? 0) !== 0).length > 0 && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                      {positions.filter(p => Number(p.position ?? p.qty ?? p.pos ?? 0) !== 0).length}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2 flex-1 flex flex-col">
                {positions.filter(p => Number(p.position ?? p.qty ?? p.pos ?? 0) !== 0).length === 0 ? (
                  <p className="text-gray-600 text-xs text-center py-5">No open positions</p>
                ) : (
                  <div className="overflow-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#0f1623]">
                        <tr className="text-gray-500 border-b border-[#1e2a3a]">
                          <th className="text-left px-4 py-1.5">Instrument</th>
                          <th className="text-right px-3 py-1.5">Qty</th>
                          <th className="text-right px-3 py-1.5">Trade Px</th>
                          <th className="text-right px-3 py-1.5">Last</th>
                          <th className="text-right px-3 py-1.5">Mkt Val</th>
                          <th className="text-right px-3 py-1.5">Open P&L</th>
                          <th className="text-right px-3 py-1.5">Day P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.filter(p => Number(p.position ?? p.qty ?? p.pos ?? 0) !== 0).map((pos, i) => {
                          const rawPnl = pos.unrealPnL ?? pos.unreal_pnl ?? pos.unrealizedPNL ?? pos.unrealized_pnl
                          const dayPnl = pos.dayPnL ?? pos.day_pnl ?? pos.realizedPNL ?? pos.realized_pnl
                          const pnl = Number(rawPnl ?? 0)
                          const sym = String(pos.localSymbol ?? pos.local_symbol ?? pos.symbol ?? '—')
                          const qty = Number(pos.position ?? pos.qty ?? pos.pos ?? 0)
                          const tradePx = pos.avgCost ?? pos.avg_cost ?? pos.averageCost
                          const lastPx = pos.lastPrice ?? pos.last_price ?? pos.marketPrice ?? pos.market_price
                          const mktVal = pos.mktValue ?? pos.mkt_value ?? pos.marketValue
                          return (
                            <tr key={i} className="border-b border-[#1e2a3a]/40 hover:bg-[#1e2a3a]/30">
                              <td className="px-4 py-1.5 font-mono text-gray-200 whitespace-nowrap">{sym}</td>
                              <td className={`px-3 py-1.5 text-right font-medium ${qty > 0 ? 'text-blue-400' : 'text-orange-400'}`}>{qty}</td>
                              <td className="px-3 py-1.5 text-right text-gray-300">{tradePx !== undefined ? Number(tradePx).toFixed(2) : '—'}</td>
                              <td className="px-3 py-1.5 text-right text-gray-300">{lastPx !== undefined ? Number(lastPx).toFixed(2) : '—'}</td>
                              <td className="px-3 py-1.5 text-right text-gray-300">{mktVal !== undefined ? `$${Number(mktVal).toFixed(0)}` : '—'}</td>
                              <td className={`px-3 py-1.5 text-right font-medium ${rawPnl !== undefined ? (pnl >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`}>
                                {rawPnl !== undefined ? `$${pnl.toFixed(2)}` : '—'}
                              </td>
                              <td className={`px-3 py-1.5 text-right font-medium ${dayPnl !== undefined ? (Number(dayPnl) >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`}>
                                {dayPnl !== undefined ? `$${Number(dayPnl).toFixed(2)}` : '—'}
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
            <Card className="bg-[#0f1623] border-[#1e2a3a] flex flex-col flex-[2]">
              <CardHeader className="pb-1 pt-3 px-4 shrink-0">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  Trade Log
                  {countTradeGroups(tradeLog) > 0 && (
                    <span className="text-xs bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded-full">{countTradeGroups(tradeLog)}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2 flex-1 min-h-0">
                <BotTradeLog trades={tradeLog} />
              </CardContent>
            </Card>
            {/* Process Log — visible to admins and users with diagnose mode enabled */}
            {showDebug && (
              <div className="flex-1">
                <BotProcessLog lines={botLog} running={running} show={showLog} onToggle={() => setShowLog(v => !v)} onClear={() => { logClearedRef.current = true; setBotLog([]) }} onRefresh={fetchBotLog} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
