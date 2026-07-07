"use client"
import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Info, CheckCircle, Clock, CalendarDays } from 'lucide-react'

interface Finding {
  type: 'critical' | 'warning' | 'good' | 'info'
  title: string
  body: string
}

interface BotSummary {
  bot_name: string
  entries: number
  exits_with_pnl: number
  total_pnl: number
  wins: number
  losses: number
}

interface TradeRow {
  bot: string
  time: string
  action: string
  instrument: string
  side: string
  credit?: string | number | null
  filled_price?: string | number | null
  pnl?: string | number | null
  reason?: string
}

interface StrikePoint {
  time: string
  strike: number
  bot: string
  credit: number
}

interface Report {
  period: string
  generated_at: string
  session_date: string
  summary: {
    total_pnl: number
    total_entries: number
    total_exits: number
    exits_with_pnl: number
    wins: number
    losses: number
    win_rate: number
    largest_win: number
    largest_loss: number
    ai_closed_count: number
    mystery_exits: number
  }
  bot_summary: BotSummary[]
  entry_strikes: StrikePoint[]
  timeline: TradeRow[]
  findings: Finding[]
}

const findingMeta = {
  critical: { icon: AlertTriangle,  border: 'border-l-red-500',    bg: 'bg-red-500/8',    badge: 'bg-red-500/15 text-red-400',    label: 'Critical' },
  warning:  { icon: AlertTriangle,  border: 'border-l-amber-500',  bg: 'bg-amber-500/8',  badge: 'bg-amber-500/15 text-amber-400', label: 'Warning'  },
  good:     { icon: CheckCircle,    border: 'border-l-emerald-500',bg: 'bg-emerald-500/8',badge: 'bg-emerald-500/15 text-emerald-400',label: 'Good'  },
  info:     { icon: Info,           border: 'border-l-blue-500',   bg: 'bg-blue-500/8',   badge: 'bg-blue-500/15 text-blue-400',  label: 'Observe'  },
}

function pnlColor(v: number | null | undefined): string {
  if (v == null) return 'text-gray-500'
  return v >= 0 ? 'text-emerald-400' : 'text-red-400'
}
function fmt(v: number | null | undefined, prefix = '$'): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${prefix}${Math.abs(v).toFixed(0)}`
}
function fmtPnl(v: string | number | null | undefined): string {
  if (v == null) return '—'
  const n = Number(v)
  return isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(0)}`
}

function outcomeTag(row: TradeRow) {
  if (row.action === 'ENTRY') return null
  if (row.reason === 'closed_by_ai_bot')
    return <span className="tag amber">AI Closed</span>
  if (row.pnl != null && Number(row.pnl) >= 0)
    return <span className="tag green">Take Profit</span>
  if (row.pnl != null && Number(row.pnl) < 0)
    return <span className="tag red">Stop Loss</span>
  return <span className="tag muted">Exit</span>
}

function StrikeDrift({ points }: { points: StrikePoint[] }) {
  if (!points.length) return null
  const min = Math.min(...points.map(p => p.strike))
  const max = Math.max(...points.map(p => p.strike))
  const range = max - min || 1
  const maxH = 72

  return (
    <div className="retro-card mb-5">
      <div className="retro-card-label mb-3">Short-Strike Drift</div>
      <div className="flex items-end gap-1.5" style={{ height: maxH + 32 }}>
        {points.map((p, i) => {
          const h = Math.max(6, ((p.strike - min) / range) * maxH)
          const isPeak = p.strike === max
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1" style={{ minWidth: 36 }}>
              <div
                style={{ height: h }}
                className={`w-full rounded-t transition-all ${isPeak ? 'bg-red-500/40 border border-red-500/50' : 'bg-blue-500/25'}`}
                title={`${p.strike} @ ${p.time}`}
              />
              <div className={`font-mono text-[10px] font-semibold ${isPeak ? 'text-red-400' : 'text-blue-400'}`}>
                {p.strike.toFixed(0)}{isPeak ? ' ↑' : ''}
              </div>
              <div className="text-[9px] text-gray-600">{p.time}</div>
            </div>
          )
        })}
      </div>
      {max - min >= 20 && (
        <p className="text-[11px] text-gray-500 mt-2">
          Drift of <span className="text-amber-400 font-semibold">{(max - min).toFixed(0)} pts</span> — highest-strike entry carries peak gamma risk.
        </p>
      )}
    </div>
  )
}

export default function RetrospectivePage() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [period, setPeriod] = useState<'today' | 'all'>('today')
  const [notFound, setNotFound] = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setNotFound(false)
    try {
      const r = await api.get('/api/v1/retrospective/latest')
      setReport(r.data)
    } catch (e: any) {
      if (e?.response?.status === 404) setNotFound(true)
      else toast.error('Could not load retrospective')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport() }, [fetchReport])

  const runRetro = async () => {
    setRunning(true)
    try {
      const r = await api.post(`/api/v1/retrospective/run?period=${period}`)
      setReport(r.data)
      setNotFound(false)
      toast.success('Retrospective updated')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to run retrospective')
    } finally {
      setRunning(false)
    }
  }

  const s = report?.summary
  const genAt = report?.generated_at
    ? new Date(report.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    : null

  return (
    <>
      <style>{`
        .retro-page { background: #0b0f1a; min-height: 100vh; }
        .retro-inner { max-width: 880px; margin: 0 auto; padding: 32px 24px 80px; }

        .retro-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #475569; margin-bottom: 6px; }
        .retro-title { font-size: 20px; font-weight: 700; color: #f1f5f9; letter-spacing: -.02em; line-height: 1.2; }
        .retro-meta { font-size: 11px; color: #475569; font-family: ui-monospace,monospace; display:flex; gap:16px; flex-wrap:wrap; margin-top: 5px; }

        .retro-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin: 24px 0; }
        @media(max-width:600px){ .retro-strip { grid-template-columns:repeat(2,1fr); } }
        .retro-stat { background:#111827; border:1px solid #1e2d42; border-radius:6px; padding:12px 14px; }
        .retro-stat-label { font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#475569; margin-bottom:5px; }
        .retro-stat-val { font-size:20px; font-weight:700; font-family:ui-monospace,monospace; font-variant-numeric:tabular-nums; color:#f1f5f9; letter-spacing:-.02em; line-height:1; }
        .retro-stat-sub { font-size:10px; color:#475569; margin-top:3px; font-family:ui-monospace,monospace; }
        .pos { color:#34d399 !important; } .neg { color:#f87171 !important; } .warn { color:#fbbf24 !important; } .acc { color:#60a5fa !important; }

        .section-head { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#60a5fa; margin-bottom:12px; display:flex; align-items:center; gap:10px; }
        .section-head::after { content:''; flex:1; height:1px; background:#1e2d42; }

        .retro-card { background:#111827; border:1px solid #1e2d42; border-radius:6px; padding:14px 16px; }
        .retro-card-label { font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#475569; }

        /* Bot summary grid */
        .bot-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; margin-bottom:28px; }
        .bot-card { background:#111827; border:1px solid #1e2d42; border-radius:6px; padding:12px 14px; }
        .bot-name { font-size:12px; font-weight:700; color:#e2e8f0; margin-bottom:8px; }
        .bot-stats { display:flex; flex-direction:column; gap:4px; }
        .bot-row { display:flex; justify-content:space-between; align-items:center; font-size:11px; }
        .bot-row-label { color:#475569; }
        .bot-row-val { font-family:ui-monospace,monospace; font-variant-numeric:tabular-nums; font-weight:600; color:#e2e8f0; }

        /* Table */
        .tbl-wrap { overflow-x:auto; }
        table { width:100%; border-collapse:collapse; font-size:12px; font-variant-numeric:tabular-nums; }
        th { text-align:left; font-size:9.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#475569; padding:7px 10px; border-bottom:1px solid #1e2d42; white-space:nowrap; }
        td { padding:8px 10px; border-bottom:1px solid #111827; vertical-align:middle; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:#111827; }

        /* Tags */
        .tag { display:inline-block; padding:1px 7px; border-radius:3px; font-size:10px; font-weight:600; letter-spacing:.04em; white-space:nowrap; }
        .tag.green { background:rgba(52,211,153,.12); color:#34d399; }
        .tag.red   { background:rgba(248,113,113,.12); color:#f87171; }
        .tag.amber { background:rgba(251,191,36,.12);  color:#fbbf24; }
        .tag.muted { background:#1a2234; color:#64748b; }
        .tag.blue  { background:rgba(96,165,250,.12);  color:#60a5fa; }

        /* Findings */
        .findings { display:flex; flex-direction:column; gap:12px; }
        .finding { border-left:3px solid #1e2d42; border-radius:0 6px 6px 0; padding:14px 16px; }
        .finding.critical { border-left-color:#f87171; background:rgba(248,113,113,.04); }
        .finding.warning  { border-left-color:#fbbf24; background:rgba(251,191,36,.04); }
        .finding.good     { border-left-color:#34d399; background:rgba(52,211,153,.04); }
        .finding.info     { border-left-color:#60a5fa; background:rgba(96,165,250,.04); }
        .finding-hd { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:6px; }
        .finding-title { font-size:13px; font-weight:700; color:#f1f5f9; line-height:1.35; }
        .finding-badge { font-size:9px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:2px 7px; border-radius:3px; white-space:nowrap; flex-shrink:0; }
        .finding-body { font-size:12.5px; color:#94a3b8; line-height:1.65; }

        /* Action btn */
        .btn-run { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; border:none; transition:background .15s; }
        .btn-run.primary { background:#2563eb; color:#fff; }
        .btn-run.primary:hover { background:#1d4ed8; }
        .btn-run:disabled { opacity:.5; cursor:not-allowed; }
        .select-sm { background:#111827; border:1px solid #1e2d42; color:#94a3b8; border-radius:5px; padding:6px 10px; font-size:12px; cursor:pointer; }
        .select-sm:focus { outline:none; border-color:#3b82f6; }

        /* Empty */
        .empty { text-align:center; padding:80px 24px; }
        .empty-icon { width:52px; height:52px; background:#111827; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
        .empty-title { font-size:16px; font-weight:700; color:#e2e8f0; margin-bottom:6px; }
        .empty-sub { font-size:13px; color:#475569; }
      `}</style>

      <div className="retro-page">
        <Header title="Retrospective" />
        <div className="retro-inner">

          {/* Page header */}
          <div style={{ borderBottom: '1px solid #1e2d42', paddingBottom: 20, marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="retro-eyebrow">BotHub Pro · Admin</div>
              <div className="retro-title">Trade Retrospective</div>
              {genAt && (
                <div className="retro-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CalendarDays size={11} />
                    Session: {report?.session_date}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} />
                    Last run: {genAt}
                  </span>
                  <span style={{ textTransform: 'capitalize' }}>Period: {report?.period}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                className="select-sm"
                value={period}
                onChange={e => setPeriod(e.target.value as 'today' | 'all')}
              >
                <option value="today">Today</option>
                <option value="all">All Time</option>
              </select>
              <button
                className="btn-run primary"
                onClick={runRetro}
                disabled={running}
              >
                <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
                {running ? 'Running…' : 'Run Retrospective'}
              </button>
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569', fontSize: 13 }}>
              Loading…
            </div>
          )}

          {!loading && notFound && (
            <div className="empty">
              <div className="empty-icon"><ScrollText size={22} color="#475569" /></div>
              <div className="empty-title">No retrospective yet</div>
              <div className="empty-sub" style={{ marginBottom: 20 }}>
                Select a period above and click "Run Retrospective" to generate the first report.
              </div>
            </div>
          )}

          {!loading && report && s && (
            <>
              {/* Summary strip */}
              <div className="retro-strip">
                <div className="retro-stat">
                  <div className="retro-stat-label">Confirmed Net P&L</div>
                  <div className={`retro-stat-val ${s.total_pnl >= 0 ? 'pos' : 'neg'}`}>
                    {s.total_pnl >= 0 ? '+' : ''}${Math.abs(s.total_pnl).toFixed(0)}
                  </div>
                  <div className="retro-stat-sub">{s.exits_with_pnl} exits with P&L recorded</div>
                </div>
                <div className="retro-stat">
                  <div className="retro-stat-label">Win Rate</div>
                  <div className={`retro-stat-val ${s.win_rate >= 50 ? 'pos' : 'warn'}`}>{s.win_rate}%</div>
                  <div className="retro-stat-sub">{s.wins}W · {s.losses}L · {s.exits_with_pnl - s.wins - s.losses} unknown</div>
                </div>
                <div className="retro-stat">
                  <div className="retro-stat-label">Largest Loss</div>
                  <div className="retro-stat-val neg">{s.largest_loss === 0 ? '—' : `$${Math.abs(s.largest_loss).toFixed(0)}`}</div>
                  <div className="retro-stat-sub">Largest win: +${s.largest_win.toFixed(0)}</div>
                </div>
                <div className="retro-stat">
                  <div className="retro-stat-label">Interference</div>
                  <div className={`retro-stat-val ${s.ai_closed_count > 0 ? 'warn' : 'pos'}`}>{s.ai_closed_count}</div>
                  <div className="retro-stat-sub">AI-closed positions · {s.mystery_exits} mystery exits</div>
                </div>
              </div>

              {/* Bot breakdown */}
              {report.bot_summary.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div className="section-head">Bot Breakdown</div>
                  <div className="bot-grid">
                    {report.bot_summary.map((b, i) => (
                      <div className="bot-card" key={i}>
                        <div className="bot-name">{b.bot_name}</div>
                        <div className="bot-stats">
                          <div className="bot-row">
                            <span className="bot-row-label">Net P&L</span>
                            <span className={`bot-row-val ${b.total_pnl >= 0 ? 'pos' : 'neg'}`}>
                              {b.total_pnl >= 0 ? '+' : ''}${Math.abs(b.total_pnl).toFixed(0)}
                            </span>
                          </div>
                          <div className="bot-row">
                            <span className="bot-row-label">W / L</span>
                            <span className="bot-row-val">{b.wins} / {b.losses}</span>
                          </div>
                          <div className="bot-row">
                            <span className="bot-row-label">Entries</span>
                            <span className="bot-row-val">{b.entries}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strike drift */}
              {report.entry_strikes.length > 1 && (
                <div style={{ marginBottom: 32 }}>
                  <div className="section-head">Strike Drift</div>
                  <StrikeDrift points={report.entry_strikes} />
                </div>
              )}

              {/* Timeline */}
              <div style={{ marginBottom: 32 }}>
                <div className="section-head">Trade Timeline</div>
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Bot</th>
                        <th>Time ET</th>
                        <th>Action</th>
                        <th>Instrument</th>
                        <th style={{ textAlign: 'right' }}>Credit / Debit</th>
                        <th style={{ textAlign: 'right' }}>P&L</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.timeline.map((row, i) => {
                        const isEntry = row.action === 'ENTRY'
                        const pnl = row.pnl != null ? Number(row.pnl) : null
                        return (
                          <tr key={i}>
                            <td style={{ color: '#94a3b8', fontSize: 11 }}>{row.bot}</td>
                            <td style={{ fontFamily: 'ui-monospace,monospace', color: '#64748b' }}>{row.time}</td>
                            <td>
                              <span className={`tag ${isEntry ? 'blue' : 'muted'}`}>{row.action}</span>
                            </td>
                            <td style={{ color: '#e2e8f0', maxWidth: 200, fontSize: 12 }}>{row.instrument || '—'}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'ui-monospace,monospace' }}>
                              {isEntry
                                ? <span style={{ color: '#34d399' }}>${Math.abs(Number(row.credit || 0)).toFixed(2)}</span>
                                : row.filled_price != null
                                  ? <span style={{ color: '#f87171' }}>${Number(row.filled_price).toFixed(2)}</span>
                                  : <span style={{ color: '#475569' }}>—</span>
                              }
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'ui-monospace,monospace', fontWeight: 600 }}>
                              <span className={pnlColor(pnl)}>{fmtPnl(row.pnl)}</span>
                            </td>
                            <td>{outcomeTag(row)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Findings */}
              {report.findings.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div className="section-head">Findings</div>
                  <div className="findings">
                    {report.findings.map((f, i) => {
                      const meta = findingMeta[f.type]
                      const Icon = meta.icon
                      return (
                        <div key={i} className={`finding ${f.type}`}>
                          <div className="finding-hd">
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                              <Icon size={14} style={{ marginTop: 2, flexShrink: 0, opacity: 0.8 }}
                                color={f.type === 'critical' ? '#f87171' : f.type === 'warning' ? '#fbbf24' : f.type === 'good' ? '#34d399' : '#60a5fa'} />
                              <div className="finding-title">{f.title}</div>
                            </div>
                            <span className={`finding-badge ${meta.badge}`}>{meta.label}</span>
                          </div>
                          <div className="finding-body" style={{ paddingLeft: 22 }}>{f.body}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid #1e2d42', paddingTop: 14, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#334155', fontFamily: 'ui-monospace,monospace' }}>
                <span>BotHub Pro · Admin retrospective</span>
                <span>Generated {genAt}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// avoid import lint error for unused ScrollText in empty state
function ScrollText({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 0 1-2 2Z"/>
      <path d="M19 3H2v13a2 2 0 0 0 2 2h14V5a2 2 0 0 0-1-1.73"/>
      <line x1="6" y1="8" x2="14" y2="8"/><line x1="6" y1="12" x2="14" y2="12"/>
    </svg>
  )
}
