"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { analyticsApi } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatCurrency } from '@/lib/utils'

export default function PerformancePage() {
  const [perf, setPerf] = useState<any>(null)
  const [monthlyData, setMonthlyData] = useState<{ month: string; pnl: number }[]>([])

  useEffect(() => {
    analyticsApi.getPerformance()
      .then(r => {
        setPerf(r.data)
        if (r.data.monthly_pnl && r.data.monthly_pnl.length > 0) {
          setMonthlyData(r.data.monthly_pnl)
        }
      })
      .catch(() => setPerf({ win_rate: 0, profit_factor: 0, total_trades: 0, avg_winner: 0, avg_loser: 0, total_pnl: 0 }))
  }, [])

  const metrics = [
    { label: 'Win Rate', value: `${perf?.win_rate ?? 0}%` },
    { label: 'Profit Factor', value: (perf?.profit_factor ?? 0).toFixed(2) },
    { label: 'Total Trades', value: perf?.total_trades ?? 0 },
    { label: 'Avg Winner', value: formatCurrency(perf?.avg_winner ?? 0) },
    { label: 'Avg Loser', value: formatCurrency(perf?.avg_loser ?? 0) },
    { label: 'Total P&L', value: formatCurrency(perf?.total_pnl ?? 0) },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header title="Performance" />
      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {metrics.map((m) => (
            <Card key={m.label} className="bg-[#0f1623] border-[#1e2a3a]">
              <CardContent className="p-4">
                <div className="text-gray-400 text-xs mb-1">{m.label}</div>
                <div className="text-xl font-bold text-white">{m.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-white">Monthly P&L</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-gray-500 text-sm">
                No trade data yet. Run bots to see monthly P&L.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#0f1623', border: '1px solid #1e2a3a', borderRadius: '8px' }}
                    formatter={(v: any) => [formatCurrency(v), 'P&L']}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {monthlyData.map((entry, i) => (
                      <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
