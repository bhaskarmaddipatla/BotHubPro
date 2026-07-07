"use client"
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { executionsApi, api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Fragment } from 'react'
import {
  ChevronDown, ChevronRight, RefreshCw, Loader2,
  XCircle, ExternalLink, AlertTriangle, Clock
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type ExStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled'
interface Execution { id: string; bot_id: string; status: ExStatus; trigger: string; profit_loss: number | null; started_at: string | null; completed_at: string | null; created_at: string; error_message?: string; result_data?: any; celery_task_id?: string }
interface LogLine { id: string; level: string; message: string; timestamp: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_META: Record<ExStatus, { label: string; cls: string }> = {
  pending:   { label: 'Pending',   cls: 'bg-yellow-500/15 text-yellow-400' },
  running:   { label: 'Running',   cls: 'bg-blue-500/15 text-blue-400' },
  completed: { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-400' },
  failed:    { label: 'Failed',    cls: 'bg-red-500/15 text-red-400' },
  canceled:  { label: 'Stopped',   cls: 'bg-gray-500/15 text-gray-400' },
}
const FILTER_TABS: { key: string; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed',    label: 'Failed' },
  { key: 'canceled',  label: 'Stopped' },
]

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)   return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function duration(ex: Execution): string {
  const start = ex.started_at
  const end   = ex.completed_at ?? (ex.status === 'running' ? new Date().toISOString() : null)
  if (!start || !end) return '—'
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs/60)}m ${secs%60}s`
  return `${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m`
}

function pnlCell(v: number | null) {
  if (v == null) return <span className="text-gray-600">—</span>
  return <span className={v >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
    {v >= 0 ? '+' : ''}{formatCurrency(v)}
  </span>
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function Detail({ ex, botNames, onStopped }: { ex: Execution; botNames: Record<string, string>; onStopped: () => void }) {
  const [logs, setLogs]   = useState<LogLine[]>([])
  const [busy, setBusy]   = useState(false)

  const fetchLogs = useCallback(async () => {
    try { const r = await api.get(`/api/v1/executions/${ex.id}/logs`); setLogs(r.data) }
    catch { setLogs([]) }
  }, [ex.id])

  useEffect(() => {
    fetchLogs()
    if (ex.status === 'running' || ex.status === 'pending') {
      const iv = setInterval(fetchLogs, 6000)
      return () => clearInterval(iv)
    }
  }, [fetchLogs, ex.status])

  const handleStop = async () => {
    setBusy(true)
    try {
      await api.post(`/api/v1/bot-runner/${ex.bot_id}/stop`)
      onStopped()
    } catch { setBusy(false) }
  }

  const trades = ex.result_data?.trade_count ?? null
  const exits  = ex.result_data?.exit_count ?? null

  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {/* Meta row */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 font-mono">
        <span>ID: <span className="text-gray-400">{ex.id}</span></span>
        {ex.celery_task_id && <span>Task: <span className="text-gray-400">{ex.celery_task_id.slice(0,12)}…</span></span>}
        {ex.started_at && <span>Started: <span className="text-gray-400">{new Date(ex.started_at).toLocaleString()}</span></span>}
        {ex.completed_at && <span>Ended: <span className="text-gray-400">{new Date(ex.completed_at).toLocaleString()}</span></span>}
        {trades != null && <span>Entries: <span className="text-gray-400">{trades}</span></span>}
        {exits  != null && <span>Exits w/ P&L: <span className="text-gray-400">{exits}</span></span>}
      </div>

      {/* Error */}
      {ex.error_message && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300 font-mono whitespace-pre-wrap">
          {ex.error_message}
        </div>
      )}

      {/* Running — stop button */}
      {ex.status === 'running' && (
        <button
          onClick={handleStop} disabled={busy}
          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
          Stop this bot
        </button>
      )}

      {/* Pending — info + cancel */}
      {ex.status === 'pending' && (
        <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-3 py-2 text-xs text-yellow-300 space-y-2">
          <p>Waiting for a Celery worker to pick this up. If it stays pending, use the <strong>Monitor →</strong> button on the Bots page to start the bot directly instead.</p>
          <button onClick={handleStop} disabled={busy}
            className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
            Cancel
          </button>
        </div>
      )}

      {/* System logs */}
      {logs.length > 0 && (
        <div className="bg-[#080d14] border border-[#1e2a3a] rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">System Log</p>
            <button onClick={fetchLogs} className="text-gray-600 hover:text-gray-400 transition-colors">
              <RefreshCw size={11} />
            </button>
          </div>
          <div className="space-y-0.5 max-h-44 overflow-y-auto font-mono text-[11px]">
            {logs.map(l => (
              <div key={l.id} className="flex gap-2">
                <span className="text-gray-700 shrink-0">{new Date(l.timestamp).toLocaleTimeString()}</span>
                <span className={l.level === 'ERROR' ? 'text-red-400' : l.level === 'WARNING' ? 'text-yellow-400' : 'text-blue-400/70'}>[{l.level}]</span>
                <span className="text-gray-400">{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExecutionsPage() {
  const router = useRouter()
  const [all, setAll]           = useState<Execution[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [botNames, setBotNames] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const r = await executionsApi.list()
      setAll(r.data)
      const pending = r.data.filter((e: Execution) => e.status === 'pending').map((e: Execution) => e.id)
      if (pending.length) setExpanded(new Set(pending))
    } catch { setAll([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    api.get('/api/v1/bots/').then(r => {
      const m: Record<string, string> = {}
      r.data.forEach((b: any) => { m[b.id] = b.name })
      setBotNames(m)
    }).catch(() => {})
  }, [load])

  // Poll while live sessions exist
  useEffect(() => {
    if (!all.some(e => e.status === 'running' || e.status === 'pending')) return
    const iv = setInterval(load, 8000)
    return () => clearInterval(iv)
  }, [all, load])

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const executions = filter === 'all'    ? all
    : filter === 'active'  ? all.filter(e => e.status === 'pending' || e.status === 'running')
    : all.filter(e => e.status === filter)

  // Tab counts
  const counts: Record<string, number> = {
    all: all.length,
    active: all.filter(e => e.status === 'pending' || e.status === 'running').length,
    completed: all.filter(e => e.status === 'completed').length,
    failed: all.filter(e => e.status === 'failed').length,
    canceled: all.filter(e => e.status === 'canceled').length,
  }

  return (
    <div className="flex flex-col h-full bg-[#080d14]">
      <Header title="Executions" />
      <div className="flex-1 p-6 space-y-5 max-w-6xl">

        {/* Header row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-white">Bot Sessions</h2>
            <p className="text-gray-500 text-sm mt-0.5">{all.length} total · each row is one start→stop session</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors border border-[#1e2a3a] rounded-lg px-3 py-1.5">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-[#1e2a3a]">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-4 py-2 text-xs font-semibold transition-colors rounded-t-md border-b-2 -mb-px ${
                filter === tab.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  filter === tab.key ? 'bg-blue-500/20 text-blue-400' : 'bg-[#1e2a3a] text-gray-600'
                }`}>{counts[tab.key]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e2a3a] bg-[#0a0e1a]">
                  <th className="w-8 py-3 px-3" />
                  <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase tracking-wide">Bot</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase tracking-wide">Started</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase tracking-wide">Duration</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium text-xs uppercase tracking-wide">P&L</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium text-xs uppercase tracking-wide">Trades</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase tracking-wide">Trigger</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="py-16 text-center text-gray-600 text-sm">
                    <Loader2 size={18} className="animate-spin mx-auto mb-2 text-gray-700" />Loading…
                  </td></tr>
                ) : executions.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center">
                    <div className="text-gray-600 text-sm">No {filter !== 'all' ? filter : ''} sessions yet</div>
                    {filter !== 'all' && (
                      <button onClick={() => setFilter('all')} className="text-xs text-blue-500 hover:text-blue-400 mt-1">View all</button>
                    )}
                  </td></tr>
                ) : executions.map(ex => {
                  const isOpen = expanded.has(ex.id)
                  const isLive = ex.status === 'running' || ex.status === 'pending'
                  const meta   = STATUS_META[ex.status]
                  const botName = botNames[ex.bot_id] || ex.bot_id.slice(0, 8) + '…'
                  const tradeCount = ex.result_data?.trade_count ?? null
                  const dur = ex.status === 'running'
                    ? duration({ ...ex, completed_at: new Date().toISOString() })
                    : duration(ex)

                  return <Fragment key={ex.id}>
                    <tr
                      onClick={() => toggle(ex.id)}
                      className={`border-b border-[#1e2a3a]/40 cursor-pointer select-none transition-colors
                        ${ex.status === 'canceled' ? 'opacity-60' : ''}
                        ${isOpen ? 'bg-[#0a0e1a]' : 'hover:bg-[#1e2a3a]/20'}`}
                    >
                      <td className="py-3 px-3 text-gray-600">
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-white font-medium text-xs">{botName}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
                          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs">
                        {ex.started_at
                          ? <span title={new Date(ex.started_at).toLocaleString()}>{relTime(ex.started_at)}</span>
                          : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs font-mono">
                        {isLive
                          ? <span className="flex items-center gap-1 text-blue-400"><Clock size={11} className="animate-pulse" />{dur}</span>
                          : dur}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-variant-numeric">
                        {pnlCell(ex.profit_loss)}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-400 text-xs">
                        {tradeCount != null ? tradeCount : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs capitalize">{ex.trigger}</td>
                      <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => router.push(`/dashboard/bots/${ex.bot_id}/live`)}
                          className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-blue-400 transition-colors whitespace-nowrap"
                          title="Open bot monitor">
                          Monitor <ExternalLink size={10} />
                        </button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr key={ex.id + '-d'} className="border-b border-[#1e2a3a]/40 bg-[#080d14]">
                        <td colSpan={9} className="pt-3">
                          <Detail ex={ex} botNames={botNames} onStopped={() => {
                            setExpanded(p => { const n = new Set(p); n.delete(ex.id); return n })
                            load()
                          }} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                })}
              </tbody>
            </table>
          </div>
        </div>

        {filter === 'canceled' && executions.length > 0 && (
          <p className="text-xs text-gray-600 flex items-center gap-1.5">
            <AlertTriangle size={11} />
            Stopped sessions are kept for audit. P&L and trade count are populated from the session end onwards — older sessions show "—".
          </p>
        )}
      </div>
    </div>
  )
}
