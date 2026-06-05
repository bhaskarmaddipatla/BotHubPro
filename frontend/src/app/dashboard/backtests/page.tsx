"use client"
import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { backtestsApi } from '@/lib/api'
import { toast } from 'sonner'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { FlaskConical } from 'lucide-react'

export default function BacktestsPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [form, setForm] = useState({
    strategy: 'SPX Credit Spread',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    initial_capital: 10000,
  })

  const handleRun = async () => {
    setLoading(true)
    try {
      const res = await backtestsApi.run(form)
      setResult(res.data)
      toast.success('Backtest completed')
    } catch (e: any) {
      toast.error('Backtest failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Backtests" />
      <div className="flex-1 p-6 space-y-6">
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader><CardTitle className="text-base text-white">Configure Backtest</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label>Strategy</Label>
                <Input value={form.strategy} onChange={e => setForm({...form, strategy: e.target.value})}
                  className="bg-[#0a0e1a] border-[#1e2a3a]" />
              </div>
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})}
                  className="bg-[#0a0e1a] border-[#1e2a3a]" />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})}
                  className="bg-[#0a0e1a] border-[#1e2a3a]" />
              </div>
              <div className="space-y-1">
                <Label>Initial Capital ($)</Label>
                <Input type="number" value={form.initial_capital} onChange={e => setForm({...form, initial_capital: +e.target.value})}
                  className="bg-[#0a0e1a] border-[#1e2a3a]" />
              </div>
            </div>
            <Button onClick={handleRun} disabled={loading} className="mt-4 gap-2">
              <FlaskConical size={16} /> {loading ? 'Running...' : 'Run Backtest'}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'Total Return', value: `${result.total_return}%`, color: result.total_return >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Final Capital', value: formatCurrency(result.final_capital), color: 'text-white' },
                { label: 'Win Rate', value: `${result.win_rate}%`, color: 'text-blue-400' },
                { label: 'Profit Factor', value: result.profit_factor, color: 'text-purple-400' },
                { label: 'Max Drawdown', value: `${result.max_drawdown}%`, color: 'text-red-400' },
                { label: 'Sharpe Ratio', value: result.sharpe_ratio, color: 'text-yellow-400' },
                { label: 'Total Trades', value: result.total_trades, color: 'text-white' },
              ].map((m) => (
                <Card key={m.label} className="bg-[#0f1623] border-[#1e2a3a]">
                  <CardContent className="p-4">
                    <div className="text-gray-400 text-xs mb-1">{m.label}</div>
                    <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-[#0f1623] border-[#1e2a3a]">
              <CardHeader><CardTitle className="text-base text-white">Equity Curve</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={result.equity_curve}>
                    <defs>
                      <linearGradient id="btGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval={30} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ background: '#0f1623', border: '1px solid #1e2a3a', borderRadius: '8px' }}
                      formatter={(v: any) => [formatCurrency(v), 'Portfolio']} />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#btGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
