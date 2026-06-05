"use client"
import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { analyticsApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Bot, Activity, TrendingUp, DollarSign } from 'lucide-react'

const mockEquityCurve = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  cumulative: Math.round(1000 + Math.sin(i * 0.3) * 200 + i * 35 + Math.random() * 100),
}))

export default function DashboardPage() {
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analyticsApi.getSummary()
      .then(r => setSummary(r.data))
      .catch(() => setSummary({ active_bots: 0, executions_today: 0, win_rate: 0, total_pnl: 0 }))
      .finally(() => setLoading(false))
  }, [])

  const stats = [
    { label: 'Active Bots', value: summary?.active_bots ?? 0, icon: Bot, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Executions Today', value: summary?.executions_today ?? 0, icon: Activity, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Win Rate', value: `${(summary?.win_rate ?? 0).toFixed(1)}%`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Total P&L', value: formatCurrency(summary?.total_pnl ?? 0), icon: DollarSign, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Card key={stat.label} className="bg-[#0f1623] border-[#1e2a3a]">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-400 text-sm">{stat.label}</span>
                    <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                      <Icon size={16} className={stat.color} />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-white">{loading ? '—' : stat.value}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Equity Curve */}
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-white">Equity Curve (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={mockEquityCurve}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: '#0f1623', border: '1px solid #1e2a3a', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(value: any) => [`$${value}`, 'Portfolio Value']}
                />
                <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2} fill="url(#equityGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-[#0f1623] border-[#1e2a3a] hover:border-blue-500/30 transition-colors cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Bot size={20} className="text-blue-400" />
                </div>
                <div>
                  <div className="font-medium text-white text-sm">Create New Bot</div>
                  <div className="text-gray-400 text-xs">Configure and deploy</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f1623] border-[#1e2a3a] hover:border-green-500/30 transition-colors cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <Activity size={20} className="text-green-400" />
                </div>
                <div>
                  <div className="font-medium text-white text-sm">Run Backtest</div>
                  <div className="text-gray-400 text-xs">Test your strategy</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-[#0f1623] border-[#1e2a3a] hover:border-purple-500/30 transition-colors cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                  <TrendingUp size={20} className="text-purple-400" />
                </div>
                <div>
                  <div className="font-medium text-white text-sm">View Analytics</div>
                  <div className="text-gray-400 text-xs">Performance metrics</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
