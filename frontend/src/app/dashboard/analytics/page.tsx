"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { analyticsApi } from '@/lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'

export default function AnalyticsPage() {
  const [equityCurve, setEquityCurve] = useState<any[]>([])
  const [perf, setPerf] = useState<any>(null)

  useEffect(() => {
    analyticsApi.getEquityCurve(90).then(r => setEquityCurve(r.data.equity_curve)).catch(() => {})
    analyticsApi.getPerformance().then(r => setPerf(r.data)).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col h-full">
      <Header title="Analytics" />
      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Win Rate', value: `${perf?.win_rate ?? 0}%` },
            { label: 'Profit Factor', value: (perf?.profit_factor ?? 0).toFixed(2) },
            { label: 'Total P&L', value: formatCurrency(perf?.total_pnl ?? 0) },
            { label: 'Total Trades', value: perf?.total_trades ?? 0 },
          ].map(m => (
            <Card key={m.label} className="bg-[#0f1623] border-[#1e2a3a]">
              <CardContent className="p-5">
                <div className="text-gray-400 text-xs mb-2">{m.label}</div>
                <div className="text-2xl font-bold text-white">{m.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white">Cumulative P&L (90 Days)</CardTitle></CardHeader>
          <CardContent>
            {equityCurve.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                No trade data available yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} interval={10} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e2a3a', borderRadius: '8px' }}
                    formatter={(v: any) => [formatCurrency(v), 'Cumulative P&L']} />
                  <Line type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
