"use client"
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { executionsApi, api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Fragment } from 'react'
import { AlertTriangle, Info, ChevronDown, ChevronRight, RefreshCw, Loader2, XCircle } from 'lucide-react'

const statusColors: Record<string, string> = {
  pending:   'text-yellow-400 bg-yellow-500/10',
  running:   'text-blue-400 bg-blue-500/10',
  completed: 'text-green-400 bg-green-500/10',
  failed:    'text-red-400 bg-red-500/10',
  canceled:  'text-gray-400 bg-gray-500/10',
}

// Step-by-step checklist shown while pending/running
const pendingSteps = [
  { key: 'queued',      label: 'Task queued in Celery' },
  { key: 'creds',       label: 'Loading broker credentials' },
  { key: 'connect',     label: 'Connecting to TWS / IB Gateway' },
  { key: 'spawn',       label: 'Spawning bot process' },
  { key: 'monitor',     label: 'Monitoring positions & orders' },
]

function stepIndexForStatus(status: string) {
  if (status === 'pending')   return 0   // stuck at queue
  if (status === 'running')   return 3   // spawned, monitoring
  if (status === 'completed') return 5   // all done
  return -1
}

interface LogLine { id: string; level: string; message: string; timestamp: string; data?: any }

function ExecutionDetail({ ex, botNames, onCanceled }: { ex: any; botNames: Record<string, string>; onCanceled: () => void }) {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [tradeLog, setTradeLog] = useState<any[]>([])
  const router = useRouter()

  const handleCancel = async () => {
    setCanceling(true)
    try {
      await api.post(`/api/v1/executions/${ex.id}/cancel`)
      onCanceled()
    } catch { setCanceling(false) }
  }

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const res = await api.get(`/api/v1/executions/${ex.id}/logs`)
      setLogs(res.data)
    } catch { setLogs([]) }
    finally { setLoadingLogs(false) }
  }, [ex.id])

  const fetchTradeLog = useCallback(async () => {
    try {
      const res = await api.get(`/api/v1/bot-runner/${ex.bot_id}/trade-log`)
      setTradeLog(Array.isArray(res.data) ? res.data : [])
    } catch { setTradeLog([]) }
  }, [ex.bot_id])

  useEffect(() => {
    fetchLogs()
    if (ex.status === 'running' || ex.status === 'pending') {
      fetchTradeLog()
      const interval = setInterval(() => { fetchLogs(); fetchTradeLog() }, 5000)
      return () => clearInterval(interval)
    }
  }, [fetchLogs, fetchTradeLog, ex.status])

  const activeStep = stepIndexForStatus(ex.status)

  return (
    <div className="px-4 pb-4 space-y-4">

      {/* What is happening right now */}
      {(ex.status === 'pending' || ex.status === 'running') && (
        <div className="bg-[#0a0e1a] border border-[#1e2a3a] rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">What's happening</p>
          <ol className="space-y-2">
            {pendingSteps.map((step, i) => {
              const done    = i < activeStep
              const current = i === activeStep
              const waiting = i > activeStep
              return (
                <li key={step.key} className="flex items-center gap-3 text-sm">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    done    ? 'bg-green-500/30 text-green-400' :
                    current ? 'bg-blue-500/30 text-blue-300 animate-pulse' :
                              'bg-[#1e2a3a] text-gray-600'
                  }`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={done ? 'text-green-400' : current ? 'text-blue-300' : 'text-gray-600'}>
                    {step.label}
                    {current && ex.status === 'pending' && i === 0 && (
                      <span className="ml-2 text-yellow-400 text-xs">— waiting for worker (this may take a few seconds)</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>

          {ex.status === 'pending' && (
            <div className="mt-2 space-y-2">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-xs text-yellow-300">
                If this stays pending, the Celery worker may not be running. Use the <strong>Run Now</strong> button on the Bots page instead — it starts the bot directly without Celery. Or{' '}
                <button onClick={() => router.push('/dashboard/settings')} className="underline hover:text-yellow-100">check Settings</button>{' '}
                to verify your broker credentials.
              </div>
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                {canceling ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Cancel this execution
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {ex.status === 'failed' && ex.error_message && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
          <p className="font-medium mb-1">Error</p>
          <p className="font-mono text-xs whitespace-pre-wrap">{ex.error_message}</p>
        </div>
      )}

      {/* Result data */}
      {ex.result_data && Object.keys(ex.result_data).length > 0 && (
        <div className="bg-[#0a0e1a] border border-[#1e2a3a] rounded-lg p-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Result</p>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap">{JSON.stringify(ex.result_data, null, 2)}</pre>
        </div>
      )}

      {/* Trade log (running bots) */}
      {tradeLog.length > 0 && (
        <div className="bg-[#0a0e1a] border border-[#1e2a3a] rounded-lg p-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Trade Log ({tradeLog.length})</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {tradeLog.map((t, i) => (
              <div key={i} className="flex gap-3 text-xs text-gray-300 font-mono">
                <span className="text-gray-500 shrink-0">{String(t.time ?? t.timestamp ?? '—')}</span>
                <span className={String(t.action).toUpperCase() === 'BUY' ? 'text-green-400' : 'text-red-400'}>{t.action}</span>
                <span>{t.symbol}</span>
                {t.pnl !== undefined && <span className={Number(t.pnl) >= 0 ? 'text-green-400' : 'text-red-400'}>P&L {t.pnl}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Celery / system logs */}
      <div className="bg-[#0a0e1a] border border-[#1e2a3a] rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">System Log</p>
          <button onClick={fetchLogs} disabled={loadingLogs} className="text-gray-500 hover:text-gray-300 transition-colors">
            {loadingLogs ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-gray-600 italic">
            {ex.status === 'pending'
              ? 'No log entries yet — the worker hasn\'t started this task.'
              : 'No log entries recorded.'}
          </p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
            {logs.map(l => (
              <div key={l.id} className="flex gap-2">
                <span className="text-gray-600 shrink-0">{new Date(l.timestamp).toLocaleTimeString()}</span>
                <span className={
                  l.level === 'ERROR'   ? 'text-red-400' :
                  l.level === 'WARNING' ? 'text-yellow-400' :
                  l.level === 'INFO'    ? 'text-blue-300' : 'text-gray-400'
                }>[{l.level}]</span>
                <span className="text-gray-300">{l.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ExecutionsPage() {
  const router = useRouter()
  const [executions, setExecutions] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [brokerStatus, setBrokerStatus] = useState<{ ibkr: any; moomoo: any } | null>(null)
  const [botNames, setBotNames]     = useState<Record<string, string>>({})

  useEffect(() => {
    executionsApi.list()
      .then(r => {
        setExecutions(r.data)
        // auto-expand pending rows
        const pendingIds = r.data.filter((e: any) => e.status === 'pending').map((e: any) => e.id)
        if (pendingIds.length > 0) setExpanded(new Set(pendingIds))
      })
      .catch(() => setExecutions([]))
      .finally(() => setLoading(false))

    api.get('/api/v1/broker/status').then(r => setBrokerStatus(r.data)).catch(() => {})

    // fetch bot names for display
    api.get('/api/v1/bots/').then(r => {
      const map: Record<string, string> = {}
      r.data.forEach((b: any) => { map[b.id] = b.name })
      setBotNames(map)
    }).catch(() => {})
  }, [])

  // Poll for status changes on pending/running executions
  useEffect(() => {
    const haslive = executions.some(e => e.status === 'pending' || e.status === 'running')
    if (!haslive) return
    const interval = setInterval(() => {
      executionsApi.list().then(r => setExecutions(r.data)).catch(() => {})
    }, 8000)
    return () => clearInterval(interval)
  }, [executions])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const noBroker  = brokerStatus && !brokerStatus.ibkr && !brokerStatus.moomoo
  const hasPending = executions.some(e => e.status === 'pending')

  return (
    <div className="flex flex-col h-full">
      <Header title="Executions" />
      <div className="flex-1 p-6 space-y-4">

        {noBroker && (
          <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
            <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="text-yellow-300 font-medium">No broker connected</p>
              <p className="text-yellow-400/80 mt-0.5">
                Your bots won't run until you add broker credentials.{' '}
                <button onClick={() => router.push('/dashboard/settings')} className="underline hover:text-yellow-200">Go to Settings</button>{' '}
                to configure Interactive Brokers or Moomoo.
              </p>
            </div>
          </div>
        )}

        {hasPending && (
          <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
            <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-300">
              <span className="font-medium">Pending</span> rows are auto-expanded below — click any row to see what the bot is doing.
            </p>
          </div>
        )}

        <div>
          <h2 className="text-xl font-bold text-white">Execution History</h2>
          <p className="text-gray-400 text-sm mt-1">{executions.length} total executions</p>
        </div>

        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e2a3a]">
                    <th className="w-6 py-3 px-3" />
                    {['Execution ID', 'Bot', 'Trigger', 'Status', 'P&L', 'Started', 'Duration'].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-gray-400 font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="py-12 text-center text-gray-400">Loading...</td></tr>
                  ) : executions.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-gray-400">No executions yet</td></tr>
                  ) : executions.map((ex) => {
                    const isOpen = expanded.has(ex.id)
                    const duration = ex.completed_at && ex.started_at
                      ? Math.round((new Date(ex.completed_at).getTime() - new Date(ex.started_at).getTime()) / 1000) + 's'
                      : '—'
                    return <Fragment key={ex.id}>{[
                      <tr
                        key={ex.id}
                        onClick={() => toggle(ex.id)}
                        className="border-b border-[#1e2a3a]/50 hover:bg-[#1e2a3a]/30 transition-colors cursor-pointer select-none"
                      >
                        <td className="py-3 px-3 text-gray-500">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="py-3 px-4 text-gray-300 font-mono text-xs">{ex.id.slice(0, 8)}...</td>
                        <td className="py-3 px-4 text-white text-xs">
                          {botNames[ex.bot_id] || ex.bot_id.slice(0, 8) + '...'}
                        </td>
                        <td className="py-3 px-4 text-gray-300 capitalize">{ex.trigger}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[ex.status]}`}>
                            {ex.status}
                            {(ex.status === 'pending' || ex.status === 'running') && (
                              <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                            )}
                          </span>
                        </td>
                        <td className={`py-3 px-4 font-medium ${ex.profit_loss > 0 ? 'text-green-400' : ex.profit_loss < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {ex.profit_loss != null ? formatCurrency(ex.profit_loss) : '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {ex.started_at ? new Date(ex.started_at).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-400">{duration}</td>
                      </tr>,
                      isOpen && (
                        <tr key={ex.id + '-detail'} className="border-b border-[#1e2a3a]/50 bg-[#0a0e1a]/60">
                          <td colSpan={8} className="pt-3">
                            <ExecutionDetail ex={ex} botNames={botNames} onCanceled={() => {
                              executionsApi.list().then(r => setExecutions(r.data)).catch(() => {})
                            }} />
                          </td>
                        </tr>
                      )
                    ]}</Fragment>
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
