"use client"
import { useEffect, useState, useCallback, useRef } from 'react'
import { Header } from '@/components/layout/header'
import { api, botsApi } from '@/lib/api'
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock,
  Activity, Zap, Shield, Brain, ChevronDown, ChevronUp, RefreshCw,
  Target, StopCircle, Info, Check, X
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecommendedAction {
  action: string
  reason: string
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

interface Position {
  id?: string
  symbol?: string
  spread_type?: string
  type?: string
  dte?: number
  expiry?: string
  short_strike?: number
  long_strike?: number
  entry_credit?: number
  current_value?: number
  contracts?: number
  qty?: number
  pnl: number
  pnl_pct: number
  target_pnl: number
  stop_pnl: number
  stop_loss_value?: number
  distance_to_short_strike?: number | null
  distance_to_short_strike_pct?: number | null
  monitoring_mode: 'normal' | 'fast' | 'critical'
  poll_interval_seconds: number
  recommended_action: RecommendedAction
  delta?: number
}

interface AiCallout {
  timestamp: string
  trigger: string
  recommendation: string
  confidence?: number
  notes?: string
}

interface ExitLogEntry {
  timestamp: string
  position_id?: string
  symbol?: string
  decision: string
  reason: string
  auto?: boolean
}

interface Summary {
  total_positions: number
  total_pnl: number
  total_target_pnl: number
  overall_monitoring_mode: string
  bot_running: boolean
}

interface Dashboard {
  bot_id: string
  bot_name: string
  generated_at: string
  spx_price: number
  summary: Summary
  positions: Position[]
  exit_log: ExitLogEntry[]
  ai_callouts: AiCallout[]
}

interface BotOption {
  id: string
  name: string
  strategy?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function modeColor(mode: string) {
  if (mode === 'critical') return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' }
  if (mode === 'fast')     return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-400' }
  return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400' }
}

function urgencyColor(urgency: string) {
  if (urgency === 'critical') return 'text-red-400'
  if (urgency === 'high')     return 'text-amber-400'
  if (urgency === 'medium')   return 'text-yellow-400'
  if (urgency === 'low')      return 'text-blue-400'
  return 'text-gray-400'
}

function actionIcon(action: string) {
  if (action === 'take_profit' || action === 'consider_close') return <CheckCircle size={13} className="text-emerald-400" />
  if (action === 'stop_loss' || action === 'exit_now')         return <StopCircle size={13} className="text-red-400" />
  if (action === 'eod_close')                                  return <Clock size={13} className="text-amber-400" />
  if (action === 'review')                                     return <Brain size={13} className="text-purple-400" />
  return <Shield size={13} className="text-gray-400" />
}

function fmtSecs(s: number): string {
  if (s < 60)   return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

function pnlCls(v: number) { return v >= 0 ? 'text-emerald-400' : 'text-red-400' }
function fmtPnl(v: number) { return `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(0)}` }

// ─── Position Card ────────────────────────────────────────────────────────────

function PositionCard({ pos, botId, onApprove, onCancel, approving }: {
  pos: Position
  botId: string
  onApprove: (id: string) => void
  onCancel: (id: string) => void
  approving: string | null
}) {
  const [expanded, setExpanded] = useState(true)
  const posId = pos.id || `${pos.short_strike}-${pos.expiry}`
  const mc = modeColor(pos.monitoring_mode)
  const action = pos.recommended_action
  const needsApproval = ['take_profit', 'stop_loss', 'exit_now', 'eod_close', 'consider_close'].includes(action.action)
  const isUrgent = action.urgency === 'critical' || action.urgency === 'high'
  const spreadLabel = pos.spread_type || pos.type || 'Spread'
  const symbol = pos.symbol || 'SPX'
  const contracts = pos.contracts || pos.qty || 1

  return (
    <div className={`rounded-xl border ${mc.border} bg-[#0f1623] overflow-hidden`}>
      {/* Card header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Mode badge */}
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${mc.bg} ${mc.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${mc.dot} animate-pulse`} />
            {pos.monitoring_mode}
          </span>
          <span className="text-white font-semibold text-sm">
            {symbol} {pos.short_strike}/{pos.long_strike} {spreadLabel}
          </span>
          <span className="text-gray-500 text-xs font-mono hidden sm:block">
            {pos.dte}DTE · {contracts} contract{contracts !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className={`font-mono font-bold text-sm ${pnlCls(pos.pnl)}`}>{fmtPnl(pos.pnl)}</span>
          {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#1e2a3a] px-4 py-4 space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Current P&L', value: fmtPnl(pos.pnl), cls: pnlCls(pos.pnl) },
              { label: 'P&L %', value: `${pos.pnl_pct >= 0 ? '+' : ''}${pos.pnl_pct.toFixed(1)}%`, cls: pnlCls(pos.pnl_pct) },
              { label: 'Target P&L', value: fmtPnl(pos.target_pnl), cls: 'text-emerald-400' },
              { label: 'Stop P&L', value: fmtPnl(pos.stop_pnl), cls: 'text-red-400' },
              {
                label: 'Δ to Strike',
                value: pos.distance_to_short_strike != null
                  ? `${pos.distance_to_short_strike.toFixed(0)} pts`
                  : '—',
                cls: pos.distance_to_short_strike_pct != null && pos.distance_to_short_strike_pct < 2
                  ? 'text-red-400'
                  : pos.distance_to_short_strike_pct != null && pos.distance_to_short_strike_pct < 4
                    ? 'text-amber-400'
                    : 'text-gray-300'
              },
              { label: 'Next Check', value: fmtSecs(pos.poll_interval_seconds), cls: 'text-blue-400' },
            ].map(stat => (
              <div key={stat.label} className="bg-[#111827] rounded-lg px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">{stat.label}</div>
                <div className={`font-mono font-semibold text-sm ${stat.cls}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Progress bars */}
          <div className="space-y-2">
            {/* P&L progress toward target */}
            <div>
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span>Profit progress</span>
                <span>{pos.pnl_pct.toFixed(1)}% / 50% target</span>
              </div>
              <div className="h-1.5 bg-[#1e2a3a] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pos.pnl_pct >= 50 ? 'bg-emerald-400' : pos.pnl_pct >= 30 ? 'bg-blue-400' : 'bg-gray-600'}`}
                  style={{ width: `${Math.min(100, Math.max(0, pos.pnl_pct / 50 * 100))}%` }}
                />
              </div>
            </div>

            {/* Distance to short strike */}
            {pos.distance_to_short_strike_pct != null && (
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                  <span>Distance to short strike</span>
                  <span>{pos.distance_to_short_strike_pct.toFixed(2)}% away</span>
                </div>
                <div className="h-1.5 bg-[#1e2a3a] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pos.distance_to_short_strike_pct < 1 ? 'bg-red-400' : pos.distance_to_short_strike_pct < 3 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, pos.distance_to_short_strike_pct / 5 * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Recommended action */}
          <div className={`rounded-lg px-4 py-3 flex items-start justify-between gap-3 ${isUrgent ? 'bg-amber-500/8 border border-amber-500/20' : 'bg-[#111827]'}`}>
            <div className="flex items-start gap-2 min-w-0">
              {actionIcon(action.action)}
              <div>
                <div className={`text-xs font-semibold ${urgencyColor(action.urgency)}`}>
                  {action.action.replace(/_/g, ' ').toUpperCase()}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{action.reason}</div>
              </div>
            </div>
            {needsApproval && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onApprove(posId)}
                  disabled={approving === posId}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-colors disabled:opacity-50"
                >
                  <Check size={11} /> Approve
                </button>
                <button
                  onClick={() => onCancel(posId)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 border border-gray-600/30 transition-colors"
                >
                  <X size={11} /> Hold
                </button>
              </div>
            )}
          </div>

          {/* Monitoring details */}
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="px-2 py-1 bg-[#111827] rounded text-gray-400">
              <span className="text-gray-600">Mode:</span> <span className={mc.text}>{pos.monitoring_mode}</span>
            </span>
            <span className="px-2 py-1 bg-[#111827] rounded text-gray-400">
              <span className="text-gray-600">Poll every:</span> <span className="text-blue-400">{fmtSecs(pos.poll_interval_seconds)}</span>
            </span>
            {pos.delta != null && (
              <span className="px-2 py-1 bg-[#111827] rounded text-gray-400">
                <span className="text-gray-600">Delta:</span> <span className="text-gray-300">{pos.delta.toFixed(2)}</span>
              </span>
            )}
            {pos.expiry && (
              <span className="px-2 py-1 bg-[#111827] rounded text-gray-400">
                <span className="text-gray-600">Expires:</span> <span className="text-gray-300">{pos.expiry}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AI Callout Panel ─────────────────────────────────────────────────────────

function AiCalloutPanel({ callouts }: { callouts: AiCallout[] }) {
  if (!callouts.length) return null
  const latest = callouts[callouts.length - 1]
  return (
    <div className="bg-purple-500/8 border border-purple-500/20 rounded-xl px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={14} className="text-purple-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-purple-400">AI Advisor</span>
        <span className="text-[10px] text-gray-600 font-mono ml-auto">
          {new Date(latest.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Trigger: {latest.trigger}</div>
      <div className="text-sm text-gray-200 leading-relaxed mb-2">{latest.recommendation}</div>
      {latest.notes && <div className="text-xs text-gray-500 italic">{latest.notes}</div>}
      {latest.confidence != null && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>AI Confidence</span><span>{(latest.confidence * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1 bg-[#1e2a3a] rounded-full overflow-hidden">
            <div className="h-full bg-purple-400 rounded-full" style={{ width: `${latest.confidence * 100}%` }} />
          </div>
        </div>
      )}
      {callouts.length > 1 && (
        <div className="mt-3 pt-3 border-t border-purple-500/15 space-y-1.5">
          {callouts.slice(-4, -1).reverse().map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="text-gray-600 font-mono shrink-0">
                {new Date(c.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-gray-500">{c.trigger}:</span>
              <span className="text-gray-400 truncate">{c.recommendation}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Exit Log ─────────────────────────────────────────────────────────────────

function ExitLog({ entries }: { entries: ExitLogEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? entries.slice().reverse() : entries.slice(-5).reverse()

  if (!entries.length) return (
    <div className="text-center py-8 text-gray-600 text-sm">No exit decisions logged yet.</div>
  )

  return (
    <div>
      <div className="space-y-1.5">
        {visible.map((e, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[#0f1623] border border-[#1e2a3a]">
            <span className="font-mono text-[10px] text-gray-600 shrink-0 pt-0.5">
              {new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold ${
                  e.decision.includes('stop') || e.decision.includes('exit') ? 'text-red-400' :
                  e.decision.includes('profit') || e.decision.includes('take') ? 'text-emerald-400' :
                  'text-blue-400'
                }`}>{e.decision.replace(/_/g, ' ').toUpperCase()}</span>
                {e.symbol && <span className="text-[10px] text-gray-500">{e.symbol}</span>}
                {e.auto && <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/15 text-blue-400 rounded font-bold">AUTO</span>}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">{e.reason}</div>
            </div>
          </div>
        ))}
      </div>
      {entries.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1.5 transition-colors"
        >
          {expanded ? 'Show less' : `Show all ${entries.length} entries`}
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SwingMonitorPage() {
  const [bots, setBots] = useState<BotOption[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load bots list
  useEffect(() => {
    botsApi.list().then(r => {
      const list: BotOption[] = (r.data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        strategy: b.config?.strategy || '',
      }))
      setBots(list)
      if (list.length) setSelectedBotId(list[0].id)
    }).catch(() => {})
  }, [])

  const fetchDashboard = useCallback(async (botId: string) => {
    if (!botId) return
    try {
      const r = await api.get(`/api/v1/swing-monitor/${botId}/dashboard`)
      setDashboard(r.data)
      setLastRefresh(new Date())
    } catch {
      // If bot has no swing data yet, keep showing previous state
    }
  }, [])

  // Poll on bot selection change
  useEffect(() => {
    if (!selectedBotId) return
    setLoading(true)
    fetchDashboard(selectedBotId).finally(() => setLoading(false))

    // Poll every 15 seconds (dashboard computes per-position intervals internally)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchDashboard(selectedBotId), 15_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [selectedBotId, fetchDashboard])

  const handleApprove = async (posId: string) => {
    if (!selectedBotId) return
    setApproving(posId)
    try {
      await api.post(`/api/v1/swing-monitor/${selectedBotId}/approve-exit/${encodeURIComponent(posId)}`)
      await fetchDashboard(selectedBotId)
    } catch {}
    setApproving(null)
  }

  const handleCancel = async (posId: string) => {
    if (!selectedBotId) return
    try {
      await api.delete(`/api/v1/swing-monitor/${selectedBotId}/approve-exit/${encodeURIComponent(posId)}`)
      await fetchDashboard(selectedBotId)
    } catch {}
  }

  const s = dashboard?.summary
  const overallMc = modeColor(s?.overall_monitoring_mode || 'normal')

  return (
    <>
      <style>{`
        .sm-page { background: #0a0e1a; min-height: 100vh; }
        .sm-inner { width: 100%; max-width: 1100px; margin: 0 auto; padding: clamp(16px,3vw,32px) clamp(12px,3vw,24px) 80px; box-sizing: border-box; }
        .section-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#60a5fa; margin-bottom:12px; display:flex; align-items:center; gap:10px; }
        .section-head::after { content:''; flex:1; height:1px; background:#1e2d42; }
      `}</style>

      <div className="sm-page">
        <Header title="Swing Monitor" />
        <div className="sm-inner">

          {/* Page header */}
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6 pb-5 border-b border-[#1e2a3a]">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1">BotHub Pro</div>
              <h1 className="text-xl font-bold text-white tracking-tight">Swing Trade Monitor</h1>
              {lastRefresh && (
                <div className="text-[11px] text-gray-600 font-mono mt-1 flex items-center gap-1.5">
                  <Clock size={10} /> Last refresh: {lastRefresh.toLocaleTimeString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Bot selector */}
              {bots.length > 1 && (
                <select
                  value={selectedBotId}
                  onChange={e => setSelectedBotId(e.target.value)}
                  className="bg-[#111827] border border-[#1e2a3a] text-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  {bots.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => selectedBotId && fetchDashboard(selectedBotId)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#111827] border border-[#1e2a3a] text-gray-400 hover:text-white hover:border-blue-500/40 transition-colors"
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
          </div>

          {loading && !dashboard && (
            <div className="flex items-center justify-center py-20 text-gray-500 text-sm gap-2">
              <RefreshCw size={14} className="animate-spin" /> Loading monitor data…
            </div>
          )}

          {!loading && !selectedBotId && (
            <div className="text-center py-20 text-gray-500 text-sm">No bots found. Add a swing trade bot first.</div>
          )}

          {dashboard && s && (
            <>
              {/* Summary strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  {
                    label: 'Overall Mode',
                    value: s.overall_monitoring_mode.toUpperCase(),
                    cls: overallMc.text,
                    icon: <Activity size={14} className={overallMc.text} />,
                    pulse: true,
                  },
                  {
                    label: 'Open Positions',
                    value: String(s.total_positions),
                    cls: 'text-white',
                    icon: <TrendingUp size={14} className="text-blue-400" />,
                  },
                  {
                    label: 'Total P&L',
                    value: fmtPnl(s.total_pnl),
                    cls: pnlCls(s.total_pnl),
                    icon: s.total_pnl >= 0 ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />,
                  },
                  {
                    label: 'Target P&L',
                    value: fmtPnl(s.total_target_pnl),
                    cls: 'text-emerald-400',
                    icon: <Target size={14} className="text-emerald-400" />,
                  },
                ].map(stat => (
                  <div key={stat.label} className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      {stat.icon}
                      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">{stat.label}</span>
                      {stat.pulse && <span className={`w-1.5 h-1.5 rounded-full ml-auto ${overallMc.dot} animate-pulse`} />}
                    </div>
                    <div className={`font-mono font-bold text-lg ${stat.cls}`}>{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* Bot status bar */}
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg mb-6 text-xs ${s.bot_running ? 'bg-emerald-500/8 border border-emerald-500/20 text-emerald-400' : 'bg-gray-500/8 border border-gray-500/20 text-gray-400'}`}>
                <span className={`w-2 h-2 rounded-full ${s.bot_running ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                <span className="font-semibold">{dashboard.bot_name}</span>
                <span className="text-gray-600">·</span>
                <span>{s.bot_running ? 'Bot running — monitoring active' : 'Bot stopped'}</span>
                {dashboard.spx_price > 0 && (
                  <>
                    <span className="text-gray-600 ml-auto">SPX</span>
                    <span className="font-mono text-gray-300">{dashboard.spx_price.toFixed(2)}</span>
                  </>
                )}
              </div>

              {/* Positions */}
              <div className="mb-8">
                <div className="section-head">
                  <Activity size={12} />
                  Open Positions ({s.total_positions})
                </div>
                {dashboard.positions.length === 0 ? (
                  <div className="text-center py-12 text-gray-600 text-sm bg-[#0f1623] rounded-xl border border-[#1e2a3a]">
                    No open positions to monitor.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dashboard.positions.map((pos, i) => (
                      <PositionCard
                        key={pos.id || i}
                        pos={pos}
                        botId={selectedBotId}
                        onApprove={handleApprove}
                        onCancel={handleCancel}
                        approving={approving}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* AI callouts */}
              {dashboard.ai_callouts.length > 0 && (
                <div className="mb-8">
                  <div className="section-head">
                    <Brain size={12} />
                    AI Advisor
                  </div>
                  <AiCalloutPanel callouts={dashboard.ai_callouts} />
                </div>
              )}

              {/* Exit log */}
              <div className="mb-8">
                <div className="section-head">
                  <Zap size={12} />
                  Exit Decision Log
                </div>
                <ExitLog entries={dashboard.exit_log} />
              </div>

              {/* Legend */}
              <div className="border-t border-[#1e2a3a] pt-4 flex flex-wrap gap-4 text-[10px] text-gray-600">
                {[
                  { dot: 'bg-emerald-400', label: 'Normal — scheduled polling' },
                  { dot: 'bg-amber-400',   label: 'Fast — within 10% of key level' },
                  { dot: 'bg-red-400',     label: 'Critical — immediate attention' },
                ].map(l => (
                  <span key={l.label} className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${l.dot}`} />
                    {l.label}
                  </span>
                ))}
                <span className="ml-auto font-mono">Auto-refresh every 15s</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
