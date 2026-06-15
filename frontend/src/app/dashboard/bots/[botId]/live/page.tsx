"use client"
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { botRunnerApi } from '@/lib/api'
import { toast } from 'sonner'
import { Play, Square, Loader2 } from 'lucide-react'

interface Position {
  symbol?: string
  position?: string | number
  qty?: string | number
  avgCost?: string | number
  avg_cost?: string | number
  mktValue?: string | number
  mkt_value?: string | number
  unrealPnL?: string | number
  unreal_pnl?: string | number
  [key: string]: unknown
}

interface TradeEntry {
  time?: string
  timestamp?: string
  action?: string
  symbol?: string
  qty?: string | number
  price?: string | number
  pnl?: string | number
  [key: string]: unknown
}

export default function LiveBotPage() {
  const params = useParams()
  const botId = params?.botId as string

  const [running, setRunning] = useState(false)
  const [pid, setPid] = useState<number | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [tradeLog, setTradeLog] = useState<TradeEntry[]>([])
  const [actionLoading, setActionLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!botId) return
    try {
      const res = await botRunnerApi.status(botId)
      setRunning(res.data.running)
      setPid(res.data.pid)
    } catch {
      // silently ignore
    }
  }, [botId])

  const fetchPositions = useCallback(async () => {
    if (!botId) return
    try {
      const res = await botRunnerApi.positions(botId)
      setPositions(Array.isArray(res.data) ? res.data : [])
    } catch {
      setPositions([])
    }
  }, [botId])

  const fetchTradeLog = useCallback(async () => {
    if (!botId) return
    try {
      const res = await botRunnerApi.tradeLog(botId)
      setTradeLog(Array.isArray(res.data) ? res.data : [])
    } catch {
      setTradeLog([])
    }
  }, [botId])

  useEffect(() => {
    fetchStatus()
    fetchPositions()
    fetchTradeLog()

    const statusInterval = setInterval(fetchStatus, 5000)
    const dataInterval = setInterval(() => {
      fetchPositions()
      fetchTradeLog()
    }, 10000)

    return () => {
      clearInterval(statusInterval)
      clearInterval(dataInterval)
    }
  }, [fetchStatus, fetchPositions, fetchTradeLog])

  const handleStart = async () => {
    setActionLoading(true)
    try {
      const res = await botRunnerApi.start(botId)
      setRunning(true)
      setPid(res.data.pid)
      toast.success(`Bot started (PID ${res.data.pid})`)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to start bot')
    } finally {
      setActionLoading(false)
    }
  }

  const handleStop = async () => {
    setActionLoading(true)
    try {
      await botRunnerApi.stop(botId)
      setRunning(false)
      setPid(null)
      toast.success('Bot stopped')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to stop bot')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Live Bot Monitor" />
      <div className="flex-1 p-6 space-y-6">

        {/* Status & Controls */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                  running
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                  {running ? 'Running' : 'Stopped'}
                </span>
                {pid && <span className="text-xs text-gray-500">PID: {pid}</span>}
              </div>
              <div className="ml-auto">
                {running ? (
                  <Button
                    variant="outline"
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                    onClick={handleStop}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Square size={14} className="mr-1" />}
                    Stop Bot
                  </Button>
                ) : (
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleStart}
                    disabled={actionLoading}
                  >
                    {actionLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
                    Start Bot
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Positions */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader>
            <CardTitle className="text-base text-white">Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            {positions.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">No open positions</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 border-b border-[#1e2a3a]">
                      <th className="text-left py-2 pr-4">Position</th>
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
                          <td className="py-2 pr-4">{String(pos.position ?? i + 1)}</td>
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
          <CardHeader>
            <CardTitle className="text-base text-white">Trade Log</CardTitle>
          </CardHeader>
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
                              String(trade.action).toUpperCase() === 'BUY'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {String(trade.action ?? '—')}
                            </span>
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
