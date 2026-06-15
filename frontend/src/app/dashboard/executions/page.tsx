"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { executionsApi, api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { AlertTriangle, Info } from 'lucide-react'

const statusColors: Record<string, string> = {
  pending: 'text-yellow-400 bg-yellow-500/10',
  running: 'text-blue-400 bg-blue-500/10',
  completed: 'text-green-400 bg-green-500/10',
  failed: 'text-red-400 bg-red-500/10',
  canceled: 'text-gray-400 bg-gray-500/10',
}

const statusTooltips: Record<string, string> = {
  pending: 'Task queued — waiting for the Celery worker to pick it up',
  running: 'Bot process is active and connected to the broker',
  completed: 'Bot finished its session successfully',
  failed: 'Bot encountered an error — check logs for details',
  canceled: 'Bot was manually stopped',
}

export default function ExecutionsPage() {
  const router = useRouter()
  const [executions, setExecutions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [brokerStatus, setBrokerStatus] = useState<{ ibkr: any; moomoo: any } | null>(null)

  useEffect(() => {
    executionsApi.list()
      .then(r => setExecutions(r.data))
      .catch(() => setExecutions([]))
      .finally(() => setLoading(false))

    api.get('/api/v1/broker/status')
      .then(r => setBrokerStatus(r.data))
      .catch(() => {})
  }, [])

  const noBroker = brokerStatus && !brokerStatus.ibkr && !brokerStatus.moomoo
  const hasPending = executions.some(e => e.status === 'pending')

  return (
    <div className="flex flex-col h-full">
      <Header title="Executions" />
      <div className="flex-1 p-6 space-y-4">

        {/* No broker warning */}
        {noBroker && (
          <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3">
            <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="text-yellow-300 font-medium">No broker connected</p>
              <p className="text-yellow-400/80 mt-0.5">
                Your bots won't run until you add broker credentials.{' '}
                <button onClick={() => router.push('/dashboard/settings')} className="underline hover:text-yellow-200">
                  Go to Settings
                </button>{' '}
                to configure Interactive Brokers or Moomoo.
              </p>
            </div>
          </div>
        )}

        {/* Pending explanation */}
        {hasPending && (
          <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
            <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-300">
              <span className="font-medium">Pending executions</span> are queued and waiting for the Celery worker to pick them up.
              If a task stays pending for more than a minute, check that your broker credentials are saved in{' '}
              <button onClick={() => router.push('/dashboard/settings')} className="underline hover:text-blue-100">
                Settings
              </button>{' '}
              and that IB Gateway / Moomoo OpenAPI is reachable.
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Execution History</h2>
            <p className="text-gray-400 text-sm mt-1">{executions.length} total executions</p>
          </div>
        </div>

        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e2a3a]">
                    {['Execution ID', 'Bot', 'Trigger', 'Status', 'P&L', 'Started', 'Duration'].map(h => (
                      <th key={h} className="text-left py-3 px-4 text-gray-400 font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="py-12 text-center text-gray-400">Loading...</td></tr>
                  ) : executions.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-gray-400">No executions yet</td></tr>
                  ) : executions.map((ex) => {
                    const duration = ex.completed_at && ex.started_at
                      ? Math.round((new Date(ex.completed_at).getTime() - new Date(ex.started_at).getTime()) / 1000) + 's'
                      : '—'
                    return (
                      <tr key={ex.id} className="border-b border-[#1e2a3a]/50 hover:bg-[#1e2a3a]/30 transition-colors">
                        <td className="py-3 px-4 text-gray-300 font-mono text-xs">{ex.id.slice(0, 8)}...</td>
                        <td className="py-3 px-4 text-white">{ex.bot_id.slice(0, 8)}...</td>
                        <td className="py-3 px-4 text-gray-300 capitalize">{ex.trigger}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${statusColors[ex.status]}`}
                            title={statusTooltips[ex.status] || ex.status}
                          >
                            {ex.status}
                          </span>
                        </td>
                        <td className={`py-3 px-4 font-medium ${ex.profit_loss > 0 ? 'text-green-400' : ex.profit_loss < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {ex.profit_loss != null ? formatCurrency(ex.profit_loss) : '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs">
                          {ex.started_at ? new Date(ex.started_at).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-400">{duration}</td>
                      </tr>
                    )
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
