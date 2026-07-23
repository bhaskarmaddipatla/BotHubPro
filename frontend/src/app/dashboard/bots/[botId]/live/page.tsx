"use client"
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { botRunnerApi, botsApi } from '@/lib/api'
import { toast } from 'sonner'
import { Play, Square, Loader2, Info, AlertTriangle, X, XCircle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import BotScheduleCard from '@/components/bots/BotScheduleCard'
import BotTradeLog, { countTradeGroups } from '@/components/bots/BotTradeLog'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Position {
  symbol?: string; localSymbol?: string; local_symbol?: string
  position?: string | number; qty?: string | number; pos?: string | number
  avgCost?: string | number; avg_cost?: string | number; averageCost?: string | number
  mktValue?: string | number; mkt_value?: string | number; marketValue?: string | number
  unrealPnL?: string | number; unreal_pnl?: string | number; unrealizedPNL?: string | number; unrealized_pnl?: string | number
  [key: string]: unknown
}
interface TradeEntry {
  time?: string; timestamp?: string; action?: string; symbol?: string
  qty?: string | number; price?: string | number; pnl?: string | number
  credit?: string | number; filled_price?: string | number
  [key: string]: unknown
}

function fmtTime(raw?: string): string {
  if (!raw) return '—'
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw.length > 19 ? raw.slice(11, 19) : raw
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York', hour12: true })
  } catch { return raw }
}

const riskColors: Record<string, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/20 text-red-400',
}
const categoryLabels: Record<string, string> = {
  credit_spread: 'Credit Spread', iron_condor: 'Iron Condor',
  iron_fly: 'Iron Fly', butterfly: 'Butterfly',
  pmcc: 'PMCC', calendar: 'Calendar', custom: 'Custom',
  spx_0dte_ai: 'AI Credit Spread',
  swing_trade: 'Swing Trade',
}

const PARAM_DEFS: Record<string, { key: string; label: string; unit?: string; min?: number; max?: number; step?: number; type?: 'time'; tooltip: string }[]> = {
  credit_spread: [
    { key: 'contracts',          label: 'Contracts',       min: 1,    max: 50,    step: 1,    tooltip: 'Number of spread contracts per trade' },
    { key: 'spread_width',       label: 'Spread Width',    unit: 'pts', min: 1,  max: 50,    step: 1,    tooltip: 'Distance between long and short strike in index points' },
    { key: 'short_strike_delta', label: 'Short Δ',         min: 0.05, max: 0.50, step: 0.01, tooltip: 'Target delta for the short leg (0.20 = 20Δ, further OTM = lower Δ)' },
    { key: 'take_profit_pct',    label: 'Take Profit',     unit: '% of credit', min: 10, max: 100, step: 5, tooltip: 'Close when P&L reaches this % of opening credit received' },
    { key: 'stop_loss_pct',      label: 'Stop Loss',       unit: '% of credit', min: 50, max: 500, step: 25, tooltip: 'Exit when loss equals this % of credit received (100 = 1× credit, 200 = 2× credit)' },
    { key: 'max_trades_per_day', label: 'Max Trades/Day',  min: 1,    max: 10,   step: 1,    tooltip: 'Maximum new entries allowed per trading day' },
    { key: 'entry_start',        label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',          label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
  iron_condor: [
    { key: 'contracts',        label: 'Contracts',     min: 1,    max: 50,   step: 1,    tooltip: 'Number of condor contracts per trade' },
    { key: 'wing_width',       label: 'Wing Width',    unit: 'pts', min: 5, max: 100,  step: 5,    tooltip: 'Width of each spread leg in index points' },
    { key: 'target_delta',     label: 'Short Δ',       min: 0.05, max: 0.30, step: 0.01, tooltip: 'Target delta for both short strikes (call and put sides)' },
    { key: 'profit_target_pct',label: 'Take Profit',   unit: '% of credit', min: 10, max: 75,  step: 5, tooltip: 'Close entire condor when P&L reaches this % of credit received' },
    { key: 'stop_loss_pct',    label: 'Stop Loss',     unit: '% of credit', min: 100, max: 300, step: 25, tooltip: 'Exit when loss = this % of credit received (200 = 2× credit)' },
    { key: 'entry_start',      label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',        label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
  iron_fly: [
    { key: 'contracts',        label: 'Contracts',   min: 1,    max: 50,   step: 1,    tooltip: 'Number of iron fly contracts per trade' },
    { key: 'wing_width',       label: 'Wing Width',  unit: 'pts', min: 10, max: 100, step: 5,    tooltip: 'Distance from ATM short strike to long wing' },
    { key: 'profit_target_pct',label: 'Take Profit', unit: '% of credit', min: 2, max: 100, step: 1, tooltip: 'Close when P&L reaches this % of opening credit' },
    { key: 'stop_loss_pct',    label: 'Stop Loss',   unit: '% of credit', min: 5, max: 300, step: 5, tooltip: 'Exit when loss = this % of opening credit received' },
    { key: 'max_trades_per_day', label: 'Max Trades/Day', min: 1, max: 5, step: 1, tooltip: 'Maximum new entries allowed per trading day within the Entry Window. A profit-target exit allows re-entry (if still under this cap and inside the window); a stop-loss exit ends trading for the day regardless of remaining budget.' },
    { key: 'entry_start',      label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',        label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
  butterfly: [
    { key: 'contracts',        label: 'Contracts',   min: 1,  max: 20,  step: 1,  tooltip: 'Number of butterfly contracts per trade' },
    { key: 'profit_target_pct',label: 'Take Profit', unit: '% of debit', min: 50, max: 200, step: 10, tooltip: 'Close when profit = this % of debit paid to enter' },
    { key: 'stop_loss_pct',    label: 'Stop Loss',   unit: '% of debit', min: 50, max: 100, step: 10, tooltip: 'Exit when loss = this % of debit paid' },
    { key: 'entry_start',      label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',        label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
  spx_0dte_ai: [
    { key: 'contracts',          label: 'Contracts',       min: 1,    max: 50,    step: 1,    tooltip: 'Number of spread contracts per trade' },
    { key: 'spread_width',       label: 'Spread Width',    unit: 'pts', min: 5,  max: 50,    step: 5,    tooltip: 'Distance between long and short strike in index points' },
    { key: 'short_strike_delta', label: 'Short Δ',         min: 0.05, max: 0.50, step: 0.01, tooltip: 'Target delta for the short leg (0.20 = 20Δ, further OTM = lower Δ)' },
    { key: 'take_profit_pct',    label: 'Take Profit',     unit: '% of credit', min: 10, max: 100, step: 5, tooltip: 'Close when P&L reaches this % of opening credit received' },
    { key: 'stop_loss_pct',      label: 'Stop Loss',       unit: '% of credit', min: 50, max: 500, step: 25, tooltip: 'Exit when loss equals this % of credit received (100 = 1× credit, 200 = 2× credit)' },
    { key: 'max_trades_per_day', label: 'Max Trades/Day',  min: 1,    max: 10,   step: 1,    tooltip: 'Maximum new entries allowed per trading day' },
    { key: 'entry_start',        label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',          label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
  swing_trade: [
    { key: 'contracts',          label: 'Contracts',         min: 1,    max: 20,    step: 1,    tooltip: 'Number of spread contracts per entry' },
    { key: 'spread_width',       label: 'Spread Width',      unit: 'pts', min: 5,  max: 100,   step: 5,    tooltip: 'Distance between long and short strike in index points' },
    { key: 'short_strike_delta', label: 'Short Δ',           min: 0.05, max: 0.30, step: 0.01, tooltip: 'Target delta for the short leg (0.16 = 16Δ, further OTM = lower delta)' },
    { key: 'dte_min',            label: 'Min DTE',           min: 1,    max: 45,    step: 1,    tooltip: 'Minimum days-to-expiry when entering a new position' },
    { key: 'dte_max',            label: 'Max DTE',           min: 7,    max: 90,    step: 1,    tooltip: 'Maximum days-to-expiry when entering a new position' },
    { key: 'profit_target_pct',  label: 'Take Profit',       unit: '% of credit', min: 25, max: 75, step: 5, tooltip: 'Close when P&L reaches this % of opening credit received' },
    { key: 'stop_loss_pct',      label: 'Stop Loss',         unit: '% of credit', min: 100, max: 300, step: 25, tooltip: 'Exit when loss equals this % of credit (200 = 2× credit)' },
    { key: 'max_trades_per_week',label: 'Max Trades/Week',   min: 1,    max: 5,     step: 1,    tooltip: 'Maximum new entries allowed per trading week' },
    { key: 'entry_start',        label: 'Entry Window Start', type: 'time', unit: 'ET', tooltip: 'Earliest time bot will open a new position (Eastern Time)' },
    { key: 'entry_end',          label: 'Entry Window End',   type: 'time', unit: 'ET', tooltip: 'Latest time bot will open a new position (Eastern Time)' },
  ],
}

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  credit_spread: { contracts: 2, spread_width: 5, short_strike_delta: 0.20, take_profit_pct: 50, stop_loss_pct: 100, max_trades_per_day: 4 },
  iron_condor:   { contracts: 1, wing_width: 25, target_delta: 0.10, profit_target_pct: 50, stop_loss_pct: 200 },
  iron_fly:      { contracts: 1, wing_width: 50, profit_target_pct: 6, stop_loss_pct: 15, max_trades_per_day: 1 },
  butterfly:     { contracts: 1, profit_target_pct: 100, stop_loss_pct: 100 },
  spx_0dte_ai:   { contracts: 2, spread_width: 10, short_strike_delta: 0.20, take_profit_pct: 50, stop_loss_pct: 100, max_trades_per_day: 4 },
  swing_trade:   { contracts: 1, spread_width: 25, short_strike_delta: 0.16, dte_min: 7, dte_max: 45, profit_target_pct: 50, stop_loss_pct: 200, max_trades_per_week: 2 },
}

// ── Open Positions Card ───────────────────────────────────────────────────────
function OpenPositionsCard({ positions, onClose, running, onClear }: { positions: any[]; onClose?: (label: string, conIds?: number[]) => void; running?: boolean; onClear?: () => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState<number | null>(null)  // spread index being confirmed

  const legs = positions.filter(p => Number(p.position ?? p.qty ?? p.pos ?? 0) !== 0)

  const legSym = (p: any) => String(p?.localSymbol ?? p?.local_symbol ?? p?.symbol ?? '—')
  const legQty = (p: any) => Number(p?.position ?? p?.qty ?? p?.pos ?? 0)
  const legPnl = (p: any) => p?.unrealPnL ?? p?.unreal_pnl ?? p?.unrealizedPNL ?? p?.unrealized_pnl
  const legDay = (p: any) => p?.dayPnL ?? p?.day_pnl
  const legPx  = (p: any) => p?.avgCost ?? p?.avg_cost ?? p?.averageCost
  const legLast= (p: any) => p?.lastPrice ?? p?.last_price ?? p?.marketPrice ?? p?.market_price

  // Parse "SPXW 260626P07355000" → strike label "7355P"
  const strikeLabel = (sym: string) => {
    const m = sym.match(/(\d{6})([CP])(\d+)/)
    if (!m) return sym
    return `${parseInt(m[3]) / 1000}${m[2]}`
  }

  // Right and strike from an IBKR local symbol like "SPXW  260715C07570000"
  // (6-digit date, C/P, strike ×1000). Explicit fields on the leg win if present.
  const legMeta = (p: any) => {
    const m = legSym(p).match(/\d{6}([CP])(\d+)/)
    const right = String(p?.right ?? m?.[1] ?? '')
    const strike = p?.strike != null ? Number(p.strike) : m ? parseInt(m[2]) / 1000 : 0
    return { right, strike }
  }

  // ── Group legs into displayed rows ──────────────────────────────────────────
  // 1) Pair each short with the nearest long OF THE SAME RIGHT (verticals).
  // 2) Merge a call vertical + put vertical of equal size into one iron
  //    fly/condor row. Anything unpaired renders as its own row.
  type Row = { label: string; legs: any[] }
  const usedLegs = new Set<any>()
  const verticals: { short: any; long: any | null; right: string }[] = []
  for (const right of ['C', 'P']) {
    const shorts = legs.filter(l => legQty(l) < 0 && legMeta(l).right === right)
    const longs = legs.filter(l => legQty(l) > 0 && legMeta(l).right === right)
    for (const sl of shorts) {
      let best: any = null, bestDist = Infinity
      for (const bl of longs) {
        if (usedLegs.has(bl)) continue
        const d = Math.abs(legMeta(sl).strike - legMeta(bl).strike)
        if (d < bestDist) { bestDist = d; best = bl }
      }
      usedLegs.add(sl)
      if (best) usedLegs.add(best)
      verticals.push({ short: sl, long: best, right })
    }
  }
  const orphanLongs = legs.filter(l => legQty(l) > 0 && !usedLegs.has(l))

  const verticalLabel = (s: { short: any; long: any | null }) => {
    const ss = s.short ? strikeLabel(legSym(s.short)) : '?'
    const ls = s.long  ? strikeLabel(legSym(s.long))  : '?'
    const { right } = legMeta(s.short ?? s.long)
    const rightWord = right === 'P' ? 'Put' : right === 'C' ? 'Call' : ''
    let spreadType = ''
    if (s.short && s.long) {
      const shortStrike = legMeta(s.short).strike
      const longStrike = legMeta(s.long).strike
      if (shortStrike && longStrike && shortStrike !== longStrike) {
        // Credit: calls are sold below the long strike, puts above it
        const isCredit = right === 'P' ? shortStrike > longStrike : shortStrike < longStrike
        spreadType = isCredit ? 'Credit' : 'Debit'
      }
    }
    return `SPX ${ss}/${ls} ${rightWord} ${spreadType} Spread`.replace(/\s+/g, ' ').trim()
  }

  const rows: Row[] = []
  const merged = new Set<number>()
  const callVerts = verticals.map((v, i) => ({ v, i })).filter(x => x.v.right === 'C' && x.v.long)
  const putVerts  = verticals.map((v, i) => ({ v, i })).filter(x => x.v.right === 'P' && x.v.long)
  for (const c of callVerts) {
    const size = Math.abs(legQty(c.v.short))
    const p = putVerts.find(x => !merged.has(x.i) && Math.abs(legQty(x.v.short)) === size)
    if (!p) continue
    const sc = legMeta(c.v.short).strike, lc = legMeta(c.v.long).strike
    const sp = legMeta(p.v.short).strike, lp = legMeta(p.v.long).strike
    // Sanity: shorts inside, longs outside (credit structure)
    if (!(lc > sc && lp < sp && sc >= sp)) continue
    merged.add(c.i); merged.add(p.i)
    const label = sc === sp
      ? `SPX ${lp}/${sc}/${lc} Iron Fly`
      : `SPX ${lp}/${sp}P/${sc}C/${lc} Iron Condor`
    rows.push({ label, legs: [p.v.long, p.v.short, c.v.short, c.v.long] })
  }
  verticals.forEach((v, i) => {
    if (merged.has(i)) return
    rows.push({ label: verticalLabel(v), legs: [v.short, v.long].filter(Boolean) })
  })
  for (const bl of orphanLongs) {
    rows.push({ label: `SPX ${strikeLabel(legSym(bl))} (long)`, legs: [bl] })
  }

  const toggle = (i: number) => setExpanded(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const fmtPnl = (v: any) => {
    if (v === undefined || v === null) return '—'
    const n = Number(v)
    return <span className={n >= 0 ? 'text-green-400' : 'text-red-400'}>${n.toFixed(2)}</span>
  }

  const rowSum = (r: Row, get: (p: any) => any) => {
    const vals = r.legs.map(get).filter(v => v !== undefined && v !== null)
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : undefined
  }

  return (
    <Card className="bg-[#0f1623] border-[#1e2a3a] flex flex-col flex-1">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-sm text-white flex items-center gap-2">
          Open Positions
          {rows.length > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">{rows.length}</span>
          )}
          {rows.length > 0 && running === false && onClear && (
            <button
              onClick={onClear}
              title="Bot is stopped — this only resets the display, it does not touch any real IBKR position. Use this if positions here are stale/incorrect leftovers."
              className="ml-auto text-[10px] px-2 py-0.5 rounded border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors"
            >
              Clear Stale
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2 flex-1 flex flex-col">
        {rows.length === 0 ? (
          <p className="text-gray-600 text-xs text-center py-5">No open positions</p>
        ) : (
          <div className="overflow-auto max-h-48">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#0f1623]">
                <tr className="text-gray-500 border-b border-[#1e2a3a]">
                  <th className="text-left px-4 py-1.5 w-4"></th>
                  <th className="text-left px-2 py-1.5">Instrument</th>
                  <th className="text-right px-3 py-1.5">Open P&L</th>
                  <th className="text-right px-3 py-1.5">Day P&L</th>
                  {onClose && <th className="text-right px-3 py-1.5 w-24"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const open = expanded.has(i)
                  const totPnl = rowSum(r, legPnl)
                  const totDay = rowSum(r, legDay)
                  const label = r.label
                  const conIds = r.legs.map((l: any) => l?.conId ?? l?.con_id).filter(Boolean) as number[]
                  return (
                    <>
                      {/* Spread summary row */}
                      <tr
                        key={`s${i}`}
                        className="border-b border-[#1e2a3a]/40 hover:bg-[#1e2a3a]/30 cursor-pointer"
                        onClick={() => toggle(i)}
                      >
                        <td className="px-4 py-1.5 text-gray-500">{open ? '▾' : '▸'}</td>
                        <td className="px-2 py-1.5 text-gray-200 font-medium">{label}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{fmtPnl(totPnl)}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{fmtPnl(totDay)}</td>
                        {onClose && (
                          <td className="px-3 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                            {confirming === i ? (
                              <span className="flex items-center justify-end gap-1">
                                <span className="text-[10px] text-red-400 mr-1">Close position?</span>
                                <button
                                  onClick={() => { onClose(label, conIds.length ? conIds : undefined); setConfirming(null) }}
                                  className="px-2 py-0.5 rounded text-[10px] bg-red-500/30 text-red-300 hover:bg-red-500/50 font-medium">
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirming(null)}
                                  className="px-2 py-0.5 rounded text-[10px] bg-[#1e2a3a] text-gray-400 hover:text-white">
                                  No
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirming(i)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors ml-auto">
                                <XCircle size={10} /> Close Now
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                      {/* Expanded leg rows */}
                      {open && r.legs.map((leg, li) => {
                        const qty = legQty(leg)
                        return (
                          <tr key={`l${i}-${li}`} className="bg-[#0a0e1a] border-b border-[#1e2a3a]/20">
                            <td className="px-4 py-1"></td>
                            <td className="px-2 py-1 font-mono text-gray-400 text-[11px]">
                              <span className={`mr-1.5 font-medium ${qty < 0 ? 'text-orange-400' : 'text-blue-400'}`}>{qty > 0 ? '+' : ''}{qty}</span>
                              {legSym(leg)}
                            </td>
                            <td className="px-3 py-1 text-right text-gray-400">
                              {legPx(leg) !== undefined ? `avg ${Number(legPx(leg)).toFixed(2)}` : '—'}
                            </td>
                            <td className="px-3 py-1 text-right text-gray-400">
                              {legLast(leg) !== undefined ? `last ${Number(legLast(leg)).toFixed(2)}` : '—'}
                            </td>
                            {onClose && <td></td>}
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function ConfirmStartModal({ bot, params, timeParams, paramDefs, forceEntry, onConfirm, onCancel, loading }: {
  bot: any; params: Record<string, number>; timeParams: Record<string, string>
  paramDefs: typeof PARAM_DEFS[string]; forceEntry: boolean
  onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  const [agreed, setAgreed] = useState(false)
  const isPaper = bot?.configuration?.paper_trading !== false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-[#1e2a3a]">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" /> Confirm Bot Start
          </h3>
          <button onClick={onCancel} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Mode badge */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isPaper ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {isPaper ? '🟡 SIMULATED — Paper Trading (no real money)' : '🔴 LIVE TRADING — Real capital at risk'}
          </div>

          {/* Parameters summary */}
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">You are starting with these parameters:</p>
            <div className="bg-[#0a0e1a] rounded-lg p-3 grid grid-cols-2 gap-2">
              {paramDefs.map(d => (
                <div key={d.key} className="flex justify-between text-xs">
                  <span className="text-gray-400">{d.label}{d.unit ? ` (${d.unit})` : ''}</span>
                  <span className="text-white font-medium">
                    {d.type === 'time' ? (timeParams[d.key] ?? '—') : (params[d.key] ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Force Entry warning */}
          {forceEntry && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs border border-orange-500/40 bg-orange-500/10 text-orange-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span><strong>Force Entry (Test Mode) is ON.</strong> All bias, confidence, OR width, and readiness filters are bypassed. Disable before live trading.</span>
            </div>
          )}

          {/* Compliance checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 accent-blue-500"
            />
            <span className="text-xs text-gray-300 leading-relaxed">
              I confirm these parameters are correct and I accept full responsibility for all trades placed by this bot.
              {!isPaper && <strong className="text-red-400"> This will trade with real capital.</strong>}
            </span>
          </label>
        </div>

        <div className="flex gap-2 p-4 border-t border-[#1e2a3a]">
          <Button variant="outline" className="flex-1 border-[#1e2a3a]" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            className={`flex-1 ${isPaper ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} text-white`}
            onClick={onConfirm}
            disabled={!agreed || loading}
          >
            {loading ? <><Loader2 size={14} className="mr-1 animate-spin" /> Starting…</> : isPaper ? 'Start Simulation' : 'Start Live Trading'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function BotProcessLog({ lines, running, show, onToggle, onClear, onRefresh }: {
  lines: string[]; running: boolean; show: boolean; onToggle: () => void; onClear: () => void; onRefresh: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolledUp, setScrolledUp] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Auto-scroll to bottom only when user is already at bottom
  useEffect(() => {
    if (!show || scrolledUp) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, show, scrolledUp])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 40)
  }

  const jumpToBottom = () => {
    setScrolledUp(false)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  return (
    <Card className="bg-[#0f1623] border-[#1e2a3a]">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-sm text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              {running && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
              Process Log
            </span>
            {lines.length > 0 && (
              <span className="text-xs bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded-full">{lines.length} lines</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            {scrolledUp && (
              <button onClick={jumpToBottom} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                ↓ Latest
              </button>
            )}
            <button
              onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false) }}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Refresh log"
            >
              <Loader2 size={13} className={refreshing ? 'animate-spin text-blue-400' : ''} />
            </button>
            {lines.length > 0 && (
              <button onClick={onClear} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                Clear
              </button>
            )}
            <button onClick={onToggle} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </CardTitle>
      </CardHeader>
      {show && (
        <CardContent className="px-0 pb-2">
          <div ref={scrollRef} onScroll={handleScroll} className="bg-[#060a12] mx-3 rounded-lg p-3 h-56 overflow-y-auto font-mono text-xs space-y-0.5">
            {lines.length === 0 ? (
              <p className="text-gray-600 text-center py-4">
                {running
                  ? 'Bot is running — log output appears here within seconds…'
                  : 'No log output. Start the bot to see live output.'}
              </p>
            ) : (
              <>
                {lines.map((line, i) => {
                  const isSep     = /^━+$/.test(line.trim())
                  const isHeader  = /^\s*(ORDER CONTEXT|ENTRY CONTEXT)/i.test(line)
                  const isSkip    = /⛔|SKIPPED/i.test(line)
                  const isError   = /error(?!Code=0\b)|exception|traceback|critical|failed to/i.test(line)
                  const isWarn    = /warn|warning/i.test(line)
                  const isEntry   = /entry time|short leg|long leg|filled credit|order id|entry type|limit price|max risk|expiration|quantity/i.test(line)
                  const isExit    = /exit time|realized p&l|hold time/i.test(line)
                  const isContext = /spx:|bias:|confidence:|recommendation:|vix:|readiness:|dte:|vix9d/i.test(line)
                  const isOk      = /connected|placed|filled|profit|success/i.test(line)

                  const cls = isSep     ? 'text-[#1e3a5a] select-none' :
                              isHeader  ? 'text-cyan-400 font-bold mt-1' :
                              isSkip    ? 'text-orange-400' :
                              isError   ? 'text-red-400' :
                              isWarn    ? 'text-yellow-300' :
                              isEntry   ? 'text-emerald-300' :
                              isExit    ? 'text-blue-300' :
                              isContext ? 'text-sky-300' :
                              isOk      ? 'text-green-400' :
                              'text-gray-400'
                  return <div key={i} className={cls}>{line || ' '}</div>
                })}
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ── Swing Monitor Panel ───────────────────────────────────────────────────────
const MODE_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  fast:     'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  normal:   'text-green-400 bg-green-500/10 border-green-500/30',
}
const ACTION_COLORS: Record<string, string> = {
  take_profit:    'text-green-400',
  stop_loss:      'text-red-400',
  exit_now:       'text-red-500 font-bold',
  eod_close:      'text-orange-400',
  consider_close: 'text-yellow-400',
  review:         'text-purple-400',
  hold:           'text-gray-400',
}
const URGENCY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  high:     'bg-orange-500/20 text-orange-400',
  medium:   'bg-yellow-500/20 text-yellow-400',
  low:      'bg-blue-500/20 text-blue-400',
  none:     'bg-gray-500/20 text-gray-400',
}

function SwingMonitorPanel({ botId }: { botId: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<Record<string, boolean>>({})
  const [showExitLog, setShowExitLog] = useState(false)

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const fetchDashboard = useCallback(async () => {
    try {
      const { api } = await import('@/lib/api')
      const r = await api.get(`/api/v1/swing-monitor/${botId}/dashboard`)
      setData(r.data)
    } catch { /* no positions yet */ } finally { setLoading(false) }
  }, [botId])

  useEffect(() => { fetchDashboard(); const t = setInterval(fetchDashboard, 15000); return () => clearInterval(t) }, [fetchDashboard])

  const handleApprove = async (posId: string) => {
    setApproving(a => ({ ...a, [posId]: true }))
    try {
      const { api } = await import('@/lib/api')
      await api.post(`/api/v1/swing-monitor/${botId}/approve-exit/${posId}`)
      await fetchDashboard()
      toast.success('Exit approved — bot will execute on next cycle')
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Approval failed') }
    finally { setApproving(a => ({ ...a, [posId]: false })) }
  }

  const handleCancelApproval = async (posId: string) => {
    setApproving(a => ({ ...a, [posId]: true }))
    try {
      const { api } = await import('@/lib/api')
      await api.delete(`/api/v1/swing-monitor/${botId}/approve-exit/${posId}`)
      await fetchDashboard()
      toast.success('Exit approval cancelled')
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Cancel failed') }
    finally { setApproving(a => ({ ...a, [posId]: false })) }
  }

  if (loading) return <div className="text-xs text-gray-500 py-4 text-center">Loading swing monitor…</div>
  if (!data) return (
    <Card className="bg-[#0f1623] border-[#1e2a3a]">
      <CardContent className="py-6 text-center text-xs text-gray-500">
        No swing monitor data yet. Start the bot to begin tracking positions.
      </CardContent>
    </Card>
  )

  const { summary, positions, exit_log, ai_callouts, monitor_state } = data
  const overallMode = summary?.overall_monitoring_mode || 'normal'
  const modeColor = MODE_COLORS[overallMode] || MODE_COLORS.normal

  return (
    <div className="space-y-3">
      {/* Summary strip */}
      <div className={`rounded-xl border px-4 py-3 flex flex-wrap gap-4 items-center ${modeColor}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${overallMode === 'critical' ? 'bg-red-400 animate-pulse' : overallMode === 'fast' ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
          <span className="text-xs font-semibold uppercase tracking-wide">{overallMode} mode</span>
        </div>
        <div className="text-xs text-gray-400">{summary?.total_positions ?? 0} position{summary?.total_positions !== 1 ? 's' : ''}</div>
        <div className={`text-xs font-mono font-semibold ${(summary?.total_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          Total P&L: {(summary?.total_pnl ?? 0) >= 0 ? '+' : ''}${(summary?.total_pnl ?? 0).toFixed(2)}
        </div>
        <div className="text-xs text-gray-500 font-mono">Target: ${(summary?.total_target_pnl ?? 0).toFixed(2)}</div>
        {data.spx_price > 0 && <div className="text-xs text-gray-500 font-mono">SPX {data.spx_price.toFixed(2)}</div>}
        <div className="ml-auto text-xs text-gray-600">
          {data.generated_at ? new Date(data.generated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
        </div>
      </div>

      {/* Position cards */}
      {(positions || []).length === 0 && (
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardContent className="py-4 text-center text-xs text-gray-500">No open positions</CardContent>
        </Card>
      )}
      {(positions || []).map((pos: any, idx: number) => {
        const posId = pos.id || pos.position_id || String(idx)
        const pnlPos = (pos.pnl ?? 0) >= 0
        const action = pos.recommended_action || {}
        const mode = pos.monitoring_mode || 'normal'
        const pnlPct = pos.pnl_pct ?? 0
        const progressPct = Math.min(100, Math.max(0, pnlPct))
        const progressColor = pnlPct >= 50 ? 'bg-green-500' : pnlPct >= 35 ? 'bg-yellow-500' : 'bg-blue-500'

        return (
          <Card key={posId} className={`bg-[#0f1623] border ${mode === 'critical' ? 'border-red-500/40' : mode === 'fast' ? 'border-yellow-500/30' : 'border-[#1e2a3a]'}`}>
            <CardContent className="p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {pos.symbol || 'SPX'} {pos.spread_type || pos.type || 'Credit Spread'}
                    {pos.short_strike && <span className="text-gray-400 text-xs ml-2">@{pos.short_strike}/{pos.long_strike}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    DTE {pos.dte ?? '—'} · {pos.contracts ?? 1} contract{(pos.contracts ?? 1) !== 1 ? 's' : ''}
                    {pos.expiration && <span className="ml-2">Exp {pos.expiration}</span>}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${MODE_COLORS[mode] || MODE_COLORS.normal}`}>
                  {mode}
                </span>
              </div>

              {/* P&L row */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-gray-500">P&L</div>
                  <div className={`font-mono font-semibold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                    {pnlPos ? '+' : ''}${(pos.pnl ?? 0).toFixed(2)} <span className="text-gray-400">({pnlPos ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Target</div>
                  <div className="font-mono text-green-300">${(pos.target_pnl ?? 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Stop</div>
                  <div className="font-mono text-red-300">${Math.abs(pos.stop_pnl ?? 0).toFixed(2)} loss</div>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>0%</span>
                  <span className={progressColor === 'bg-green-500' ? 'text-green-400' : 'text-gray-400'}>{pnlPct.toFixed(1)}% of target</span>
                  <span>50%</span>
                </div>
                <div className="h-1.5 bg-[#1e2a3a] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              {/* Distance + next check */}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                {pos.distance_to_short_strike != null && (
                  <span>Strike distance: <span className="text-white font-mono">{pos.distance_to_short_strike.toFixed(1)} pts ({pos.distance_to_short_strike_pct?.toFixed(1)}%)</span></span>
                )}
                {pos.poll_interval_seconds != null && (
                  <span>Next check: <span className="text-white font-mono">{pos.poll_interval_seconds < 60 ? `${pos.poll_interval_seconds}s` : `${Math.round(pos.poll_interval_seconds / 60)}m`}</span></span>
                )}
              </div>

              {/* Recommended action */}
              <div className={`rounded-lg px-3 py-2 flex items-center justify-between gap-3 bg-[#0a0e1a] border border-[#1e2a3a]`}>
                <div className="flex items-center gap-2 min-w-0">
                  {(action.urgency === 'critical' || action.urgency === 'high') ? <TrendingDown size={14} className="text-red-400 shrink-0" /> :
                   action.action === 'hold' ? <Minus size={14} className="text-gray-400 shrink-0" /> :
                   <TrendingUp size={14} className="text-yellow-400 shrink-0" />}
                  <div className="min-w-0">
                    <span className={`text-xs font-semibold ${ACTION_COLORS[action.action] || 'text-gray-400'}`}>
                      {(action.action || 'hold').replace(/_/g, ' ').toUpperCase()}
                    </span>
                    {action.reason && <div className="text-xs text-gray-500 truncate">{action.reason}</div>}
                  </div>
                </div>
                {action.urgency && action.urgency !== 'none' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${URGENCY_COLORS[action.urgency] || URGENCY_COLORS.none}`}>
                    {action.urgency}
                  </span>
                )}
              </div>

              {/* Approve / Cancel buttons */}
              {action.action && action.action !== 'hold' && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline"
                    className="flex-1 h-7 text-xs border-green-500/40 text-green-400 hover:bg-green-500/10"
                    onClick={() => handleApprove(posId)} disabled={approving[posId]}>
                    {approving[posId] ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                    Approve Exit
                  </Button>
                  <Button size="sm" variant="outline"
                    className="flex-1 h-7 text-xs border-[#1e2a3a] text-gray-400 hover:bg-[#1e2a3a]"
                    onClick={() => handleCancelApproval(posId)} disabled={approving[posId]}>
                    Hold
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* AI Callouts */}
      {(ai_callouts || []).length > 0 && (
        <Card className="bg-[#0f1623] border-purple-500/20">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm text-purple-300">AI Advisor</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {(ai_callouts || []).slice(-3).reverse().map((c: any, i: number) => (
              <div key={i} className="bg-[#0a0e1a] rounded-lg px-3 py-2 text-xs text-gray-300">
                {c.timestamp && <div className="text-gray-600 mb-0.5">{new Date(c.timestamp).toLocaleTimeString()}</div>}
                {c.recommendation || c.message || JSON.stringify(c)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Exit Decision Log */}
      {(exit_log || []).length > 0 && (
        <Card className="bg-[#0f1623] border-[#1e2a3a]">
          <CardHeader className="pb-1 pt-3 px-4 cursor-pointer" onClick={() => setShowExitLog(v => !v)}>
            <CardTitle className="text-sm text-white flex items-center justify-between">
              <span>Exit Decision Log <span className="text-gray-500 font-normal text-xs ml-1">({exit_log.length})</span></span>
              {showExitLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </CardTitle>
          </CardHeader>
          {showExitLog && (
            <CardContent className="px-4 pb-4">
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {[...(exit_log || [])].reverse().map((e: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-[#1e2a3a]/50 last:border-0">
                    <span className="text-gray-600 shrink-0">{e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '—'}</span>
                    <span className={ACTION_COLORS[e.action] || 'text-gray-400'}>{e.action?.replace(/_/g, ' ') || '—'}</span>
                    <span className="text-gray-500 truncate">{e.reason || e.message || ''}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}

export default function LiveBotPage() {
  const params = useParams()
  const router = useRouter()
  const botId = params?.botId as string

  const [bot, setBot] = useState<any>(null)
  const [allBots, setAllBots] = useState<any[]>([])
  const [running, setRunning] = useState(false)
  const [pid, setPid] = useState<number | null>(null)
  const [brokerConn, setBrokerConn] = useState<{ connection: string; [k: string]: unknown } | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [tradeLog, setTradeLog] = useState<TradeEntry[]>([])
  const [botLog, setBotLog] = useState<string[]>([])
  const logClearedRef = useRef(false)
  const [showLog, setShowLog] = useState(true)  // default open
  const [actionLoading, setActionLoading] = useState(false)
  const [tradeParams, setTradeParams] = useState<Record<string, number>>({})
  const [timeParams, setTimeParams] = useState<Record<string, string>>({ entry_start: '09:30', entry_end: '15:45' })
  const [botDefaults, setBotDefaults] = useState<Record<string, number>>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [diagReport, setDiagReport] = useState<any>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [ibkrPaper, setIbkrPaper] = useState<boolean>(true)  // reflects saved IBKR credentials
  const [isAdmin, setIsAdmin] = useState(false)
  const [diagnoseMode, setDiagnoseMode] = useState(false)
  const [forceEntry, setForceEntry] = useState(false)
  const [closingPosition, setClosingPosition] = useState(false)

  const handleClosePosition = async (label: string, conIds?: number[]) => {
    setClosingPosition(true)
    try {
      await botRunnerApi.closePosition(botId, label, conIds)
      toast.success(`Close signal sent for "${label}". Bot will exit the position within ~10 seconds.`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to send close signal')
    } finally {
      setClosingPosition(false)
    }
  }

  const handleClearPositions = async () => {
    try {
      await botRunnerApi.clearPositions(botId)
      setPositions([])
      toast.success('Cleared stale positions display')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to clear positions')
    }
  }

  const runDiagnose = async () => {
    setDiagLoading(true)
    setDiagReport(null)
    try {
      const { api } = await import('@/lib/api')
      const r = await api.get(`/api/v1/bot-runner/${botId}/diagnose`)
      setDiagReport(r.data)
    } catch (e: any) {
      setDiagReport({ error: e?.response?.data?.detail || String(e) })
    } finally {
      setDiagLoading(false)
    }
  }

  // Persist params to localStorage so they survive navigation
  const storageKey = botId ? `bot_params_${botId}` : null

  // Fetch saved IBKR credentials to determine paper vs live mode, and user role
  useEffect(() => {
    import('@/lib/api').then(({ api }) => {
      api.get('/api/v1/broker/ibkr').then(r => {
        setIbkrPaper(r.data?.paper_trading !== false)
      }).catch(() => {})
      api.get('/api/v1/users/me').then(r => {
        setIsAdmin(r.data?.role === 'admin')
      }).catch(() => {})
    })
    setDiagnoseMode(localStorage.getItem('diagnose_mode') === 'true')
    // Load all bots for the switcher
    botsApi.list().then(r => setAllBots(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!botId) return
    botsApi.get(botId).then(r => {
      setBot(r.data)
      const category = r.data.category || 'credit_spread'
      const defaults = DEFAULT_PARAMS[category] || DEFAULT_PARAMS.credit_spread
      const saved = r.data.configuration || {}
      const botOriginal: Record<string, number> = { ...defaults }
      Object.keys(defaults).forEach(k => { if (saved[k] !== undefined) botOriginal[k] = +saved[k] })
      setBotDefaults(botOriginal)

      // Load user's last-saved params from localStorage; fall back to bot defaults
      const stored = storageKey ? localStorage.getItem(storageKey) : null
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          // Split time strings out of stored params
          const { entry_start, entry_end, ...numericParsed } = parsed
          setTradeParams(numericParsed)
          setTimeParams(tp => ({ ...tp, ...(entry_start ? { entry_start } : {}), ...(entry_end ? { entry_end } : {}) }))
          return
        } catch {}
      }
      setTradeParams(botOriginal)
    }).catch(() => {})
  }, [botId, storageKey])

  // Save to localStorage whenever params change
  const updateParams = (updater: (p: Record<string, number>) => Record<string, number>) => {
    setTradeParams(prev => {
      const next = updater(prev)
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ ...next, ...timeParams }))
      setHasUnsaved(true)
      return next
    })
  }

  const updateTimeParam = (key: string, value: string) => {
    setTimeParams(prev => {
      const next = { ...prev, [key]: value }
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ ...tradeParams, ...next }))
      setHasUnsaved(true)
      return next
    })
  }

  const handleReset = () => {
    setTradeParams(botDefaults)
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(botDefaults))
    setHasUnsaved(false)
    toast.success('Reset to bot default values')
  }

  const fetchStatus = useCallback(async () => {
    if (!botId) return
    try {
      const r = await botRunnerApi.status(botId)
      setRunning(r.data.running); setPid(r.data.pid)
      setBrokerConn(r.data.broker_connection ?? null)
    } catch {}
  }, [botId])

  const fetchPositions = useCallback(async () => {
    if (!botId) return
    try { const r = await botRunnerApi.positions(botId); setPositions(Array.isArray(r.data) ? r.data : []) } catch { setPositions([]) }
  }, [botId])

  const fetchBotLog = useCallback(async () => {
    if (!botId || logClearedRef.current) return
    try {
      const { api } = await import('@/lib/api')
      const r = await api.get(`/api/v1/bot-runner/${botId}/logs?lines=200`)
      setBotLog(r.data.lines || [])
    } catch { setBotLog([]) }
  }, [botId])

  const fetchTradeLog = useCallback(async () => {
    if (!botId) return
    try { const r = await botRunnerApi.tradeLog(botId); setTradeLog(Array.isArray(r.data) ? r.data : []) } catch { setTradeLog([]) }
  }, [botId])

  useEffect(() => {
    fetchStatus(); fetchPositions(); fetchTradeLog(); fetchBotLog()
    const s = setInterval(fetchStatus, 5000)
    const d = setInterval(() => { fetchPositions(); fetchTradeLog() }, 5000)
    const l = setInterval(fetchBotLog, 3000)  // log refreshes fast so nothing is missed
    return () => { clearInterval(s); clearInterval(d) }
    return () => { clearInterval(s); clearInterval(d); clearInterval(l) }
  }, [fetchStatus, fetchPositions, fetchTradeLog, fetchBotLog])

  const handleStart = async () => {
    setActionLoading(true)
    setShowConfirm(false)
    try {
      const res = await botRunnerApi.startWithParams(botId, { ...tradeParams, ...timeParams, ...(forceEntry ? { force_entry: true } : {}) })
      setRunning(true); setPid(res.data.pid)
      toast.success(`Bot started (PID ${res.data.pid})`)
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to start bot')
    } finally { setActionLoading(false) }
  }

  const handleStop = async () => {
    setActionLoading(true)
    try {
      await botRunnerApi.stop(botId)
      setRunning(false); setPid(null)
      toast.success('Bot stopped')
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to stop bot')
    } finally { setActionLoading(false) }
  }

  const category = bot?.category || 'credit_spread'
  const paramDefs = PARAM_DEFS[category] || PARAM_DEFS.credit_spread
  const isPaper = ibkrPaper  // driven by saved IBKR credentials, not bot config
  const showDebug = isAdmin || diagnoseMode  // admins always; subscribers only in diagnose mode

  return (
    <div className="flex flex-col h-full">
      <Header title="Live Bot Monitor" />

      {/* ── Bot switcher nav ── */}
      {allBots.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1e2a3a] bg-[#080d14] overflow-x-auto">
          <button
            onClick={() => router.push('/dashboard/bots')}
            className="shrink-0 text-xs text-gray-500 hover:text-gray-300 mr-2 flex items-center gap-1 transition-colors"
          >
            ← All Bots
          </button>
          <div className="w-px h-4 bg-[#1e2a3a] shrink-0 mr-2" />
          {allBots.map(b => (
            <button
              key={b.id}
              onClick={() => router.push(`/dashboard/bots/${b.id}/live`)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                b.id === botId
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1e2a3a] text-gray-400 hover:text-white hover:bg-[#2a3a4a]'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {showConfirm && bot && (
        <ConfirmStartModal
          bot={bot} params={tradeParams} timeParams={timeParams} paramDefs={paramDefs}
          forceEntry={forceEntry}
          onConfirm={handleStart} onCancel={() => setShowConfirm(false)} loading={actionLoading}
        />
      )}

      <div className="flex-1 p-4 space-y-3 overflow-auto">

        {/* ── Compact bot info header ── */}
        {bot && (
          <div className="bg-[#0f1623] border border-[#1e2a3a] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            {/* Left: name, description, badges */}
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-white font-semibold text-base leading-tight">{bot.name}</span>
              {bot.description && (
                <span className="text-xs text-gray-500 leading-snug line-clamp-1">{bot.description}</span>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColors[bot.risk_level] || riskColors.medium}`}>
                  {bot.risk_level} risk
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                  {categoryLabels[bot.category] || bot.category}
                </span>
                {bot.configuration?.symbol && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-mono">
                    {bot.configuration.symbol}
                  </span>
                )}
              </div>
            </div>

            {/* Right: status + actions */}
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                running ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                {running ? `Running${pid ? ` · PID ${pid}` : ''}` : 'Stopped'}
              </span>
              {running && brokerConn && brokerConn.connection !== 'CONNECTED' && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400"
                  title={Object.entries(brokerConn).filter(([k]) => k !== 'connection').map(([k, v]) => `${k}: ${v}`).join(' · ') || undefined}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Broker {brokerConn.connection.toLowerCase()}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full ${isPaper ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                {isPaper ? 'Paper' : '⚠ Live'}
              </span>
              {running ? (
                <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10 h-7 text-xs"
                  onClick={handleStop} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} className="mr-1" />}
                  Stop
                </Button>
              ) : (
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                  onClick={() => setShowConfirm(true)} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} className="mr-1" />}
                  Start Bot
                </Button>
              )}
              {showDebug && (
                <Button size="sm" variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-7 text-xs"
                  onClick={runDiagnose} disabled={diagLoading}>
                  {diagLoading ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  Diagnose
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Diagnostic report ── */}
        {diagReport && (
          <div className="bg-[#060a12] border border-blue-500/20 rounded-xl p-4 mb-1 text-xs font-mono">
            <div className="flex items-center justify-between mb-3">
              <span className="text-blue-400 font-semibold text-sm">Diagnostic Report</span>
              <button onClick={() => setDiagReport(null)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {/* TWS connection */}
              <div className={`flex gap-2 ${diagReport.tws_reachable ? 'text-green-400' : 'text-red-400'}`}>
                <span>{diagReport.tws_reachable ? '✓' : '✗'}</span>
                <span>TWS {diagReport.tws_address}: {diagReport.tws_reachable ? 'reachable' : `UNREACHABLE — ${diagReport.tws_error}`}</span>
              </div>
              {/* GitHub token */}
              <div className={`flex gap-2 ${diagReport.github_token === 'SET' ? 'text-green-400' : 'text-red-400'}`}>
                <span>{diagReport.github_token === 'SET' ? '✓' : '✗'}</span>
                <span>GITHUB_TOKEN: {diagReport.github_token}</span>
              </div>
              {/* Runner file */}
              <div className={`flex gap-2 ${diagReport.runner_exists ? 'text-green-400' : 'text-yellow-400'}`}>
                <span>{diagReport.runner_exists ? '✓' : '⚠'}</span>
                <span>runner.py: {diagReport.runner_exists ? `found at ${diagReport.runner_path}` : `NOT FOUND at ${diagReport.runner_path}`}</span>
              </div>
              {/* Process alive */}
              <div className={`flex gap-2 ${diagReport.process_alive ? 'text-green-400' : 'text-red-400'}`}>
                <span>{diagReport.process_alive ? '✓' : '✗'}</span>
                <span>Process PID {diagReport.pid}: {diagReport.process_alive ? 'alive' : 'DEAD (crashed or not started)'}</span>
              </div>
              {/* Packages */}
              {diagReport.packages && Object.entries(diagReport.packages).map(([pkg, status]: any) => (
                <div key={pkg} className={`flex gap-2 ${status === 'OK' ? 'text-gray-500' : 'text-red-400'}`}>
                  <span>{status === 'OK' ? '✓' : '✗'}</span>
                  <span>{pkg}: {status}</span>
                </div>
              ))}
              {/* Bot log tail */}
              {diagReport.bot_log_last_30?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#1e2a3a]">
                  <div className="text-gray-400 mb-1">Last log lines:</div>
                  {diagReport.bot_log_last_30.map((line: string, i: number) => {
                    const isErr = /error|exception|traceback|failed/i.test(line)
                    return <div key={i} className={isErr ? 'text-red-400' : 'text-gray-400'}>{line || ' '}</div>
                  })}
                </div>
              )}
              {diagReport.bot_log_note && (
                <div className="text-yellow-400 mt-2">{diagReport.bot_log_note}</div>
              )}
            </div>
          </div>
        )}

        {/* ── Two-column layout: params | positions+log ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3 items-stretch">

          {/* Left: Trade Parameters */}
          <div className="flex flex-col gap-3">
            <Card className="bg-[#0f1623] border-[#1e2a3a] flex-1">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-sm text-white">Your Trade Parameters</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  {running ? 'Locked while running — stop bot to edit.' : 'Set before starting. You will confirm before the bot executes.'}
                </p>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-2 space-y-0">
                {paramDefs.map(def => {
                  const isTime = def.type === 'time'
                  const current = isTime ? timeParams[def.key] : tradeParams[def.key]
                  const original = isTime ? undefined : botDefaults[def.key]
                  const changed = !isTime && original !== undefined && current !== original
                  return (
                    <div key={def.key} className="py-1.5 border-b border-[#1e2a3a]/50 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs text-gray-300 truncate">{def.label}</span>
                          {def.unit && <span className="text-xs text-gray-600 shrink-0">({def.unit})</span>}
                          <span title={def.tooltip} className="text-gray-600 hover:text-gray-400 cursor-help shrink-0 ml-0.5">
                            <Info size={10} />
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {changed && !running && (
                            <span className="text-xs text-gray-600" title={`Bot default: ${original}`}>
                              was {original}
                            </span>
                          )}
                          {isTime ? (
                            <input
                              type="time"
                              value={String(current ?? '')}
                              onChange={e => updateTimeParam(def.key, e.target.value)}
                              disabled={running}
                              className="w-24 bg-[#0a0e1a] border border-[#1e2a3a] rounded-md px-2 py-1 text-xs text-white disabled:opacity-40 focus:outline-none focus:border-blue-500/50"
                            />
                          ) : (
                            <input
                              type="number"
                              min={def.min}
                              max={def.max}
                              step={def.step}
                              value={current ?? ''}
                              onChange={e => updateParams(p => ({ ...p, [def.key]: parseFloat(e.target.value) || 0 }))}
                              disabled={running}
                              className={`w-20 bg-[#0a0e1a] border rounded-md px-2 py-1 text-xs text-white text-left disabled:opacity-40 focus:outline-none focus:border-blue-500/50 ${changed && !running ? 'border-blue-500/40' : 'border-[#1e2a3a]'}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Force Entry test mode toggle */}
                <div className={`mt-3 rounded-lg border px-3 py-2.5 ${forceEntry ? 'border-orange-500/40 bg-orange-500/10' : 'border-[#1e2a3a]'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={12} className={forceEntry ? 'text-orange-400' : 'text-gray-600'} />
                      <span className={`text-xs font-medium ${forceEntry ? 'text-orange-400' : 'text-gray-500'}`}>
                        Force Entry (Test Mode)
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={forceEntry}
                        disabled={running}
                        onChange={e => setForceEntry(e.target.checked)}
                      />
                      <div className="w-8 h-4 bg-gray-600 peer-focus:ring-1 peer-focus:ring-orange-500 rounded-full peer peer-checked:bg-orange-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4 peer-disabled:opacity-40" />
                    </label>
                  </div>
                  {forceEntry && (
                    <p className="text-xs text-orange-400/70 mt-1.5">
                      Skips all bias, confidence, OR width and readiness filters. For testing only — disable before live trading.
                    </p>
                  )}
                </div>

                <div className="pt-3 flex items-center justify-between gap-2">
                  {hasUnsaved && !running ? (
                    <button onClick={handleReset}
                      className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors">
                      Reset to bot defaults
                    </button>
                  ) : <span />}
                  {!running && (
                    <p className="text-xs text-gray-600 text-right">
                      You'll confirm before anything runs.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bot Schedule */}
            {botId && (
              <BotScheduleCard botId={botId} />
            )}
          </div>

          {/* Right: Positions + Trade Log */}
          <div className="flex flex-col gap-3">
            {/* Swing Monitor Panel (swing_trade strategy only) */}
            {bot?.configuration?.strategy === 'swing_trade' ? (
              <SwingMonitorPanel botId={botId} />
            ) : (
            /* Open Positions */
            <OpenPositionsCard positions={positions} onClose={handleClosePosition} running={running} onClear={handleClearPositions} />
            )}

            {/* Trade Log */}
            <Card className="bg-[#0f1623] border-[#1e2a3a] flex flex-col flex-[2]">
              <CardHeader className="pb-1 pt-3 px-4 shrink-0">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  Trade Log
                  {countTradeGroups(tradeLog) > 0 && (
                    <span className="text-xs bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded-full">{countTradeGroups(tradeLog)}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2 flex-1 min-h-0">
                <BotTradeLog trades={tradeLog} />
              </CardContent>
            </Card>
            {/* Process Log — visible to admins and users with diagnose mode enabled */}
            {showDebug && (
              <div className="flex-1">
                <BotProcessLog lines={botLog} running={running} show={showLog} onToggle={() => setShowLog(v => !v)} onClear={() => { logClearedRef.current = true; setBotLog([]) }} onRefresh={fetchBotLog} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
