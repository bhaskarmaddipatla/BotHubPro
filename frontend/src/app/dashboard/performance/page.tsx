"use client"
import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { api } from '@/lib/api'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:       '#0b0f1a',
  surface:  '#111827',
  surface2: '#0f1623',
  border:   '#1e2d42',
  text:     '#cbd5e1',
  muted:    '#475569',
  white:    '#f1f5f9',
  green:    '#34d399',
  red:      '#f87171',
  amber:    '#fbbf24',
  // Fixed categorical order for bots (never cycle)
  cats: ['#60a5fa', '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#facc15', '#94a3b8'],
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Overall {
  total_trades: number; wins: number; losses: number; win_rate: number
  total_pnl: number; avg_winner: number; avg_loser: number
  profit_factor: number; largest_win: number; largest_loss: number; expectancy: number
}
interface BotStat {
  bot: string; total_trades: number; wins: number; losses: number
  win_rate: number; total_pnl: number; avg_winner: number; avg_loser: number; profit_factor: number
}
interface DayPoint  { date: string; label: string; pnl: number }
interface MonthPoint{ month: string; label: string; pnl: number }
interface EqPoint   { ts: string; pnl: number; cumulative: number; bot: string }
interface Trade     { bot: string; instrument: string; pnl: any; reason: string; time: string; date: string; credit: any; debit: any }
interface PerfData  {
  period: string; overall: Overall; bots: BotStat[]
  daily_series: DayPoint[]; monthly_series: MonthPoint[]
  equity_curve: EqPoint[]; recent_trades: Trade[]
}

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: '7 Days' },
  { key: 'month', label: '30 Days' },
  { key: 'year',  label: 'Year' },
  { key: 'all',   label: 'All Time' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v: number, prefix = '$') =>
  v == null ? '—' : `${v >= 0 ? prefix : '-' + prefix}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const fmtSign = (v: number) =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const pnlCls = (v: number) => v > 0 ? T.green : v < 0 ? T.red : T.muted

// ── Custom tooltip ────────────────────────────────────────────────────────────
function PnlTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const v = payload[0]?.value ?? 0
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: T.muted, marginBottom: 3 }}>{label}</div>
      <div style={{ color: pnlCls(v), fontWeight: 700, fontFamily: 'ui-monospace,monospace' }}>
        {fmtSign(v)}
      </div>
    </div>
  )
}

function EqTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const cum = payload[0]?.value ?? 0
  const pnl = payload[0]?.payload?.pnl ?? 0
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: T.muted, marginBottom: 3 }}>{label}</div>
      <div style={{ color: pnlCls(cum), fontWeight: 700, fontFamily: 'ui-monospace,monospace' }}>
        {fmtSign(cum)} cumulative
      </div>
      <div style={{ color: pnlCls(pnl), fontFamily: 'ui-monospace,monospace', marginTop: 2 }}>
        {fmtSign(pnl)} this trade
      </div>
    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function Tile({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'ui-monospace,monospace', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1, color: color ?? T.white }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.muted, marginTop: 4, fontFamily: 'ui-monospace,monospace' }}>{sub}</div>}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHead({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#60a5fa' }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  )
}

// ── Axis styles ───────────────────────────────────────────────────────────────
const axisStyle = { fill: T.muted, fontSize: 11 }
const gridStyle = { stroke: T.border, strokeDasharray: '3 3' }

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const [data, setData]       = useState<PerfData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]   = useState('all')
  const [view, setView]       = useState<'daily' | 'monthly'>('daily')

  const load = useCallback(async (p: string) => {
    setLoading(true)
    try {
      const r = await api.get(`/api/v1/analytics/performance?period=${p}`)
      setData(r.data)
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  const o = data?.overall
  const noTrades = !o || o.total_trades === 0

  // Daily chart — only show last 30 points to avoid overcrowding
  const dailyChart = (data?.daily_series ?? []).slice(-30)
  const monthlyChart = data?.monthly_series ?? []
  const eqChart = data?.equity_curve ?? []

  // Bot colors mapped by fixed order
  const botColorMap: Record<string, string> = {}
  ;(data?.bots ?? []).forEach((b, i) => { botColorMap[b.bot] = T.cats[i % T.cats.length] })

  // Max P&L for horizontal bot bar scaling
  const maxBotPnl = Math.max(...(data?.bots ?? []).map(b => Math.abs(b.total_pnl)), 1)

  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <Header title="Performance" />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 80px' }}>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: T.white, letterSpacing: '-0.02em' }}>Performance</h2>
            <p style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>Based on all trade_log entries across every bot</p>
          </div>
          <div style={{ display: 'flex', gap: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 4 }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all .15s',
                  background: period === p.key ? '#2563eb' : 'transparent',
                  color: period === p.key ? '#fff' : T.muted,
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Overall stat strip ── */}
        {noTrades && !loading ? (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '60px 24px', textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.muted }}>No trade data for this period</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Run a bot and its exits will appear here.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 28 }}>
              <Tile label="Total P&L"      value={loading ? '…' : fmtSign(o?.total_pnl ?? 0)} color={loading ? T.muted : pnlCls(o?.total_pnl ?? 0)} />
              <Tile label="Win Rate"       value={loading ? '…' : `${o?.win_rate ?? 0}%`}      color={loading ? T.muted : (o?.win_rate ?? 0) >= 50 ? T.green : T.amber} sub={loading ? '' : `${o?.wins}W · ${o?.losses}L`} />
              <Tile label="Profit Factor"  value={loading ? '…' : (o?.profit_factor ?? 0).toFixed(2)} color={loading ? T.muted : (o?.profit_factor ?? 0) >= 1.5 ? T.green : (o?.profit_factor ?? 0) >= 1 ? T.amber : T.red} />
              <Tile label="Expectancy"     value={loading ? '…' : fmtSign(o?.expectancy ?? 0)} sub="per trade" color={loading ? T.muted : pnlCls(o?.expectancy ?? 0)} />
              <Tile label="Avg Winner"     value={loading ? '…' : fmt(o?.avg_winner ?? 0)}    color={T.green} />
              <Tile label="Avg Loser"      value={loading ? '…' : fmt(o?.avg_loser ?? 0)}     color={T.red} />
              <Tile label="Best Trade"     value={loading ? '…' : fmtSign(o?.largest_win ?? 0)}  color={T.green} />
              <Tile label="Worst Trade"    value={loading ? '…' : fmtSign(o?.largest_loss ?? 0)} color={T.red} />
            </div>

            {/* ── Two-column: equity curve + per-bot ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, marginBottom: 28, alignItems: 'start' }}>

              {/* Equity curve */}
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#60a5fa', marginBottom: 14 }}>Cumulative P&L</div>
                {eqChart.length === 0 ? (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 12 }}>No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={eqChart} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id="eqGreen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={T.green} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={T.green} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="eqRed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={T.red} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={T.red} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...gridStyle} vertical={false} />
                      <XAxis dataKey="ts" tick={axisStyle} axisLine={false} tickLine={false} hide={eqChart.length > 10} interval="preserveStartEnd" />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
                      <Tooltip content={<EqTooltip />} />
                      <ReferenceLine y={0} stroke={T.border} strokeWidth={1} />
                      <Area
                        type="monotone" dataKey="cumulative"
                        stroke={(eqChart[eqChart.length - 1]?.cumulative ?? 0) >= 0 ? T.green : T.red}
                        strokeWidth={2}
                        fill={(eqChart[eqChart.length - 1]?.cumulative ?? 0) >= 0 ? 'url(#eqGreen)' : 'url(#eqRed)'}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Per-bot breakdown */}
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#60a5fa', marginBottom: 14 }}>By Bot</div>
                {!data?.bots?.length ? (
                  <div style={{ color: T.muted, fontSize: 12, padding: '16px 0' }}>No bot data</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {data.bots.map((b, i) => {
                      const color = T.cats[i % T.cats.length]
                      const barW  = Math.abs(b.total_pnl) / maxBotPnl * 100
                      return (
                        <div key={b.bot}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{b.bot}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace,monospace', color: pnlCls(b.total_pnl) }}>
                              {fmtSign(b.total_pnl)}
                            </span>
                          </div>
                          {/* Horizontal bar */}
                          <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{ height: '100%', width: `${barW}%`, background: pnlCls(b.total_pnl), borderRadius: 3, transition: 'width .4s' }} />
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 10, color: T.muted }}>
                            <span>{b.total_trades} trades</span>
                            <span>{b.win_rate}% WR</span>
                            <span>PF {b.profit_factor.toFixed(1)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── P&L bar chart with daily/monthly toggle ── */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px 12px', marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#60a5fa' }}>P&L Over Time</div>
                <div style={{ display: 'flex', gap: 3, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: 3 }}>
                  {(['daily', 'monthly'] as const).map(v => (
                    <button key={v} onClick={() => setView(v)}
                      style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all .15s',
                        background: view === v ? '#1e2d42' : 'transparent', color: view === v ? T.white : T.muted }}>
                      {v === 'daily' ? 'Daily' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>
              {(view === 'daily' ? dailyChart : monthlyChart).length === 0 ? (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, fontSize: 12 }}>No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={view === 'daily' ? dailyChart : monthlyChart}
                    margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                    barCategoryGap="30%"
                  >
                    <CartesianGrid {...gridStyle} vertical={false} />
                    <XAxis
                      dataKey={view === 'daily' ? 'label' : 'label'}
                      tick={axisStyle} axisLine={false} tickLine={false}
                      interval={view === 'daily' ? Math.floor(dailyChart.length / 8) : 0}
                    />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={56} />
                    <Tooltip content={<PnlTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <ReferenceLine y={0} stroke={T.border} />
                    <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={40}>
                      {(view === 'daily' ? dailyChart : monthlyChart).map((d, i) => (
                        <Cell key={i} fill={d.pnl >= 0 ? T.green : T.red} fillOpacity={d.pnl === 0 ? 0.2 : 0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Recent trades ── */}
            {(data?.recent_trades?.length ?? 0) > 0 && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#60a5fa', borderBottom: `1px solid ${T.border}` }}>
                  Recent Exits
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        {['Date', 'Bot', 'Instrument', 'Credit', 'Exit Debit', 'P&L', 'Reason'].map(h => (
                          <th key={h} style={{ textAlign: h === 'P&L' || h === 'Credit' || h === 'Exit Debit' ? 'right' : 'left', padding: '8px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: T.muted, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data!.recent_trades.map((t, i) => {
                        const pnl = t.pnl != null ? Number(t.pnl) : null
                        const botColor = botColorMap[t.bot] ?? T.muted
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${T.border}30` }}>
                            <td style={{ padding: '8px 14px', color: T.muted, fontFamily: 'ui-monospace,monospace', whiteSpace: 'nowrap' }}>
                              {t.date} <span style={{ opacity: 0.5 }}>{t.time}</span>
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: botColor, flexShrink: 0 }} />
                                <span style={{ color: T.text, fontWeight: 500 }}>{t.bot}</span>
                              </span>
                            </td>
                            <td style={{ padding: '8px 14px', color: T.text, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.instrument || '—'}</td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'ui-monospace,monospace', color: T.green }}>
                              {t.credit != null ? `$${Math.abs(Number(t.credit)).toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'ui-monospace,monospace', color: T.red }}>
                              {t.debit != null ? `$${Number(t.debit).toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: 'ui-monospace,monospace', fontWeight: 700, color: pnl != null ? pnlCls(pnl) : T.muted }}>
                              {pnl != null ? fmtSign(pnl) : '—'}
                            </td>
                            <td style={{ padding: '8px 14px', color: T.muted, fontSize: 11 }}>
                              {t.reason === 'closed_by_ai_bot' ? <span style={{ color: T.amber }}>AI closed</span> : t.reason || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
